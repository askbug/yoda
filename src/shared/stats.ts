import type { AgentAccountProviderId } from './runtime-registry';

/**
 * Normalized token accounting across provider CLIs. Providers report cache
 * tokens differently (Claude's `input_tokens` excludes cache reads, Codex's
 * includes them) — readers normalize so `input` is always the non-cached
 * share and `total` is every token processed: input + output + cacheRead +
 * cacheCreation. `reasoning` is an informational subset of `output`.
 */
export type TokenBuckets = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  reasoning: number;
  total: number;
};

/** `date` is a local-timezone YYYY-MM-DD key. */
export type DailyTokenUsage = {
  date: string;
  tokens: TokenBuckets;
};

export type RuntimeUsage = {
  runtimeId: string;
  tokens: TokenBuckets;
  /** Sessions with parseable usage for this runtime. */
  sessionCount: number;
};

export type AuthProviderUsage = {
  /** Null = sessions spawned before auth tracking landed. */
  authProvider: AgentAccountProviderId | null;
  tokens: TokenBuckets;
};

export type TaskUsage = {
  taskId: string;
  projectId: string;
  name: string;
  archived: boolean;
  tokens: TokenBuckets;
};

/** Everything the Usage view renders, in one call. */
export type UsageOverview = {
  tasksTotal: number;
  /** Tasks archived, all time — archiving is the completion act in Yoda. */
  tasksArchived: number;
  /** Cumulative code delta across all tasks (live diff or archived snapshot). */
  linesAdded: number;
  linesDeleted: number;
  /** Cumulative burn across all parseable session transcripts; null when none. */
  tokens: TokenBuckets | null;
  /** Merged per-local-day burn across all sessions, ascending by date. */
  daily: DailyTokenUsage[];
  /** Sorted by token total, descending. */
  byRuntime: RuntimeUsage[];
  byAuthProvider: AuthProviderUsage[];
  topTasks: TaskUsage[];
};

export type TaskDiffStatsSource = 'live' | 'snapshot' | 'none';

export type ConversationUsageSummary = {
  conversationId: string;
  title: string;
  runtimeId: string | null;
  authProvider: AgentAccountProviderId | null;
  /** Null when the provider has no transcript reader or nothing parsed. */
  tokens: TokenBuckets | null;
};

export type TaskStats = {
  diff: { additions: number; deletions: number; source: TaskDiffStatsSource };
  conversations: ConversationUsageSummary[];
};

export function emptyTokenBuckets(): TokenBuckets {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0, total: 0 };
}

export function addTokenBuckets(target: TokenBuckets, delta: TokenBuckets): TokenBuckets {
  target.input += delta.input;
  target.output += delta.output;
  target.cacheRead += delta.cacheRead;
  target.cacheCreation += delta.cacheCreation;
  target.reasoning += delta.reasoning;
  target.total += delta.total;
  return target;
}
