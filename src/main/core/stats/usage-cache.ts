import { readFile, stat } from 'node:fs/promises';
import { getTranscriptUsageReader } from './transcript-readers/registry';
import type { SessionTokenUsage, UsageReaderContext } from './transcript-readers/types';

// Lifetime totals parse every historical session once — size for that.
const MAX_CACHE_ENTRIES = 2000;
// Unresolvable transcripts stay unresolvable for a while; re-check sparsely
// so a brand-new session's transcript is still picked up soon after it lands.
const NEGATIVE_PATH_TTL_MS = 60_000;

type CacheEntry = {
  mtimeMs: number;
  usage: SessionTokenUsage | null;
};

type PathEntry = {
  path: string | null;
  resolvedAtMs: number;
};

/**
 * Parsed transcript usage, keyed by transcript path and invalidated by file
 * mtime. Resolved paths are cached per conversation — including failures,
 * briefly — since Codex resolution hits SQLite per lookup. Transcripts live
 * under `~/.claude` / `~/.codex` and survive worktree teardown, so no DB
 * persistence is needed.
 */
class SessionUsageCache {
  private byPath = new Map<string, CacheEntry>();
  private pathByConversation = new Map<string, PathEntry>();

  async getUsage(
    runtimeId: string | null,
    ctx: UsageReaderContext
  ): Promise<SessionTokenUsage | null> {
    const reader = getTranscriptUsageReader(runtimeId);
    if (!reader) return null;

    const now = Date.now();
    let entry = this.pathByConversation.get(ctx.conversationId);
    if (!entry || (entry.path === null && now - entry.resolvedAtMs > NEGATIVE_PATH_TTL_MS)) {
      entry = { path: await reader.resolveTranscriptPath(ctx), resolvedAtMs: now };
      this.pathByConversation.set(ctx.conversationId, entry);
    }
    const path = entry.path;
    if (!path) return null;

    let mtimeMs: number;
    try {
      mtimeMs = (await stat(path)).mtimeMs;
    } catch {
      return null;
    }

    const cached = this.byPath.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.usage;

    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return null;
    }
    const usage = reader.parseUsage(raw);
    this.byPath.set(path, { mtimeMs, usage });
    this.evict();
    return usage;
  }

  private evict(): void {
    while (this.byPath.size > MAX_CACHE_ENTRIES) {
      const oldest = this.byPath.keys().next().value;
      if (oldest === undefined) return;
      this.byPath.delete(oldest);
    }
  }
}

export const sessionUsageCache = new SessionUsageCache();
