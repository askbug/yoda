export type SkillUsageStats = {
  count: number;
  lastUsedAt: string | null;
};

export const skillUsageStatsChangedEvent = 'yoda:skill-usage-stats-changed';

const STORAGE_KEY = 'yoda.skillUsageStats.v1';
const EMPTY_STATS: SkillUsageStats = { count: 0, lastUsedAt: null };

type StoredSkillUsageStats = Record<string, SkillUsageStats>;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage ?? null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStats(value: unknown): SkillUsageStats {
  if (!isObjectRecord(value)) return EMPTY_STATS;

  const count = typeof value.count === 'number' && Number.isFinite(value.count) ? value.count : 0;
  const lastUsedAt = typeof value.lastUsedAt === 'string' ? value.lastUsedAt : null;
  return { count: Math.max(0, Math.floor(count)), lastUsedAt };
}

function readStats(): StoredSkillUsageStats {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([skillId, stats]) => [skillId, normalizeStats(stats)])
    );
  } catch {
    return {};
  }
}

function writeStats(stats: StoredSkillUsageStats): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Best-effort local UI stat; quota or storage failures should not affect prompting.
  }
}

export function getSkillUsageStats(skillId: string): SkillUsageStats {
  return readStats()[skillId] ?? EMPTY_STATS;
}

export function recordSkillInvocation(skillId: string): SkillUsageStats {
  const normalizedSkillId = skillId.trim();
  if (!normalizedSkillId) return EMPTY_STATS;

  const stats = readStats();
  const previous = stats[normalizedSkillId] ?? EMPTY_STATS;
  const next = {
    count: previous.count + 1,
    lastUsedAt: new Date().toISOString(),
  };
  stats[normalizedSkillId] = next;
  writeStats(stats);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(skillUsageStatsChangedEvent, { detail: { skillId: normalizedSkillId } })
    );
  }

  return next;
}
