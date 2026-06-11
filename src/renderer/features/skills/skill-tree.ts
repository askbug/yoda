import type { CatalogSkill } from '@shared/skills/types';

export type SkillTreeEntry =
  | { kind: 'group'; prefix: string; skills: CatalogSkill[] }
  | { kind: 'leaf'; skill: CatalogSkill };

/** First name segment — by convention usually the brand/author (lovstudio-*, baoyu-*, lark-*). */
export function skillPrefix(id: string): string {
  const match = /^[^-_:.]+/.exec(id.toLowerCase());
  return match ? match[0] : id.toLowerCase();
}

/**
 * Group skills by their first name segment for the tree layout. Preserves the
 * incoming sort order: a group sits where its first member appeared and
 * members keep their relative order. Prefixes with a single skill stay flat.
 */
export function buildSkillTree(skills: CatalogSkill[]): SkillTreeEntry[] {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    const prefix = skillPrefix(skill.id);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  const entries: SkillTreeEntry[] = [];
  const groups = new Map<string, CatalogSkill[]>();
  for (const skill of skills) {
    const prefix = skillPrefix(skill.id);
    if ((counts.get(prefix) ?? 0) < 2) {
      entries.push({ kind: 'leaf', skill });
      continue;
    }
    let members = groups.get(prefix);
    if (!members) {
      members = [];
      groups.set(prefix, members);
      entries.push({ kind: 'group', prefix, skills: members });
    }
    members.push(skill);
  }
  return entries;
}
