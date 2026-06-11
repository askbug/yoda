import {
  addTokenBuckets,
  emptyTokenBuckets,
  type DailyTokenUsage,
  type TokenBuckets,
} from '@shared/stats';
import { formatLocalDateKey } from '../local-date';

export type SessionTokenUsage = {
  total: TokenBuckets;
  /** Sorted ascending by date. Entries without a parseable timestamp only count toward `total`. */
  daily: DailyTokenUsage[];
};

export type UsageReaderContext = {
  cwd: string;
  conversationId: string;
  conversationTitle?: string;
  conversationCreatedAt?: string | null;
};

export interface TranscriptUsageReader {
  /** Null when the transcript cannot be located. */
  resolveTranscriptPath(ctx: UsageReaderContext): Promise<string | null>;
  /** Null when the transcript contains no token usage. */
  parseUsage(raw: string): SessionTokenUsage | null;
}

export type UsageEntry = {
  buckets: TokenBuckets;
  timestamp: string | null;
};

export function makeUsageEntry(
  fields: Omit<TokenBuckets, 'total'>,
  timestamp: string | null
): UsageEntry {
  return {
    buckets: {
      ...fields,
      // All tokens processed; `reasoning` is a subset of `output` and excluded.
      total: fields.input + fields.output + fields.cacheRead + fields.cacheCreation,
    },
    timestamp,
  };
}

export function aggregateUsageEntries(entries: Iterable<UsageEntry>): SessionTokenUsage | null {
  const total = emptyTokenBuckets();
  const daily = new Map<string, TokenBuckets>();
  let seen = false;
  for (const entry of entries) {
    seen = true;
    addTokenBuckets(total, entry.buckets);
    const dateKey = toLocalDateKey(entry.timestamp);
    if (!dateKey) continue;
    const bucket = daily.get(dateKey);
    if (bucket) addTokenBuckets(bucket, entry.buckets);
    else daily.set(dateKey, { ...entry.buckets });
  }
  if (!seen) return null;
  return {
    total,
    daily: [...daily.entries()]
      .map(([date, tokens]) => ({ date, tokens }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function toLocalDateKey(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return null;
  return formatLocalDateKey(new Date(ms));
}
