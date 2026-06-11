export interface ConversationTranscript {
  filePath: string | null;
  totalLines: number;
  lines: string[];
}

const EMPTY_TRANSCRIPT: ConversationTranscript = { filePath: null, totalLines: 0, lines: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is string => typeof line === 'string');
}

function normalizeTotalLines(value: unknown, lines: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return lines.length;
  return Math.max(lines.length, Math.floor(value));
}

export function normalizeConversationTranscript(value: unknown): ConversationTranscript {
  if (!isRecord(value)) return EMPTY_TRANSCRIPT;

  const lines = normalizeLines(value.lines);

  return {
    filePath: typeof value.filePath === 'string' ? value.filePath : null,
    totalLines: normalizeTotalLines(value.totalLines, lines),
    lines,
  };
}
