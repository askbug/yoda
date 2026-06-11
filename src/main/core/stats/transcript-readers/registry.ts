import { claudeUsageReader } from './claude-usage-reader';
import { codexUsageReader } from './codex-usage-reader';
import type { TranscriptUsageReader } from './types';

const readers = new Map<string, TranscriptUsageReader>([
  ['claude', claudeUsageReader],
  ['codex', codexUsageReader],
]);

/** Providers whose transcripts we can mine for token usage. */
export const TRANSCRIPT_USAGE_PROVIDER_IDS = [...readers.keys()];

/** Null for providers without a known transcript format. */
export function getTranscriptUsageReader(runtimeId: string | null): TranscriptUsageReader | null {
  if (!runtimeId) return null;
  return readers.get(runtimeId) ?? null;
}
