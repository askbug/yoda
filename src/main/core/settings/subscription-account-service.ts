import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentSubscriptionAccount, RuntimeId } from '@shared/runtime-registry';
import { log } from '@main/lib/logger';

const execFileAsync = promisify(execFile);
/** Keychain reads can pop a permission prompt — cache the answer for a while. */
const CLAUDE_PLAN_CACHE_TTL_MS = 10 * 60 * 1_000;

type AccountInfo = Pick<
  AgentSubscriptionAccount,
  'loggedIn' | 'email' | 'displayName' | 'organization' | 'plan'
>;

const NOT_LOGGED_IN: AccountInfo = {
  loggedIn: false,
  email: null,
  displayName: null,
  organization: null,
  plan: null,
};

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

let claudePlanCache: { plan: string | null; expiresAt: number } | null = null;

/**
 * The subscription tier (Pro / Max 5x / Max 20x) lives in Claude Code's OAuth
 * credentials: `~/.claude/.credentials.json`, or the macOS Keychain item
 * "Claude Code-credentials". Both carry `claudeAiOauth.subscriptionType`
 * ("pro" | "max") and `rateLimitTier` (e.g. "default_claude_max_5x").
 * Values are cached at login time, so they can lag a plan change.
 */
async function readClaudePlan(): Promise<string | null> {
  if (claudePlanCache && Date.now() < claudePlanCache.expiresAt) return claudePlanCache.plan;

  let raw: string | null = null;
  try {
    raw = await fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8');
  } catch {
    raw = null;
  }
  if (!raw && process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 10_000 }
      );
      raw = stdout;
    } catch {
      raw = null;
    }
  }

  let plan: string | null = null;
  if (raw) {
    try {
      const credentials = JSON.parse(raw) as {
        claudeAiOauth?: { subscriptionType?: string; rateLimitTier?: string };
      };
      const subscription = asString(credentials.claudeAiOauth?.subscriptionType);
      if (subscription) {
        plan = subscription.charAt(0).toUpperCase() + subscription.slice(1);
        const tier = asString(credentials.claudeAiOauth?.rateLimitTier)?.match(/_(\d+x)$/)?.[1];
        if (tier) plan += ` ${tier}`;
      }
    } catch {
      plan = null;
    }
  }
  claudePlanCache = { plan, expiresAt: Date.now() + CLAUDE_PLAN_CACHE_TTL_MS };
  return plan;
}

/** `~/.claude.json` `oauthAccount` written by Claude Code's OAuth login. */
async function readClaudeAccount(): Promise<AccountInfo> {
  const config = (await readJsonFile(path.join(os.homedir(), '.claude.json'))) as {
    oauthAccount?: {
      emailAddress?: string;
      displayName?: string;
      organizationName?: string;
      billingType?: string;
      seatTier?: string;
    };
  } | null;
  const account = config?.oauthAccount;
  const email = asString(account?.emailAddress);
  if (!account || !email) return NOT_LOGGED_IN;
  return {
    loggedIn: true,
    email,
    displayName: asString(account.displayName),
    organization: asString(account.organizationName),
    plan:
      (await readClaudePlan()) ??
      asString(account.seatTier) ??
      (account.billingType === 'stripe_subscription'
        ? 'Subscription'
        : asString(account.billingType)),
  };
}

/** `~/.codex/auth.json` ChatGPT login tokens; identity lives in the id_token claims. */
async function readCodexAccount(): Promise<AccountInfo> {
  const auth = (await readJsonFile(path.join(os.homedir(), '.codex', 'auth.json'))) as {
    tokens?: { id_token?: string };
  } | null;
  const idToken = asString(auth?.tokens?.id_token);
  if (!idToken) return NOT_LOGGED_IN;
  const claims = decodeJwtPayload(idToken);
  const email = asString(claims?.email);
  if (!claims || !email) return NOT_LOGGED_IN;
  const authClaim = claims['https://api.openai.com/auth'] as
    | { chatgpt_plan_type?: string }
    | undefined;
  const planType = asString(authClaim?.chatgpt_plan_type);
  return {
    loggedIn: true,
    email,
    displayName: asString(claims.name),
    organization: null,
    plan: planType ? `ChatGPT ${planType.charAt(0).toUpperCase()}${planType.slice(1)}` : null,
  };
}

/** `~/.gemini/google_accounts.json` written by Gemini CLI's Google login. */
async function readGeminiAccount(): Promise<AccountInfo> {
  const accounts = (await readJsonFile(
    path.join(os.homedir(), '.gemini', 'google_accounts.json')
  )) as { active?: string } | null;
  const email = asString(accounts?.active);
  if (!email) return NOT_LOGGED_IN;
  return { loggedIn: true, email, displayName: null, organization: null, plan: null };
}

const ACCOUNT_READERS: Partial<Record<RuntimeId, () => Promise<AccountInfo>>> = {
  claude: readClaudeAccount,
  codex: readCodexAccount,
  gemini: readGeminiAccount,
};

export async function getSubscriptionAccount(id: RuntimeId): Promise<AgentSubscriptionAccount> {
  const base: AgentSubscriptionAccount = {
    runtimeId: id,
    supported: false,
    ...NOT_LOGGED_IN,
    error: null,
  };
  const reader = ACCOUNT_READERS[id];
  if (!reader) return base;
  try {
    return { ...base, supported: true, ...(await reader()) };
  } catch (error) {
    log.warn(`Failed to read subscription account for ${id}:`, error);
    return {
      ...base,
      supported: true,
      error: error instanceof Error ? error.message : 'Failed to read account info.',
    };
  }
}
