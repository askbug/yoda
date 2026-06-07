import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { CatalogIndex, CatalogSkill, SkillValidationIssue } from '@shared/skills/types';
import { rpc } from '@renderer/lib/ipc';

const SKILLS_CATALOG_QUERY_KEY = ['skills', 'catalog'] as const;

export type SkillValidationIssueEntry = {
  skill: CatalogSkill;
  issue: SkillValidationIssue;
};

export function useSkillValidationIssues(): {
  issues: SkillValidationIssueEntry[];
  count: number;
  firstIssue: SkillValidationIssueEntry | undefined;
} {
  const { data: catalog = null } = useQuery({
    queryKey: SKILLS_CATALOG_QUERY_KEY,
    queryFn: async () => {
      const result = await rpc.skills.getCatalog();
      if (result.success && result.data) return result.data;
      throw new Error(result.error ?? 'Failed to load catalog');
    },
  });

  const issues = useMemo(() => collectSkillValidationIssues(catalog), [catalog]);

  return {
    issues,
    count: issues.length,
    firstIssue: issues[0],
  };
}

function collectSkillValidationIssues(catalog: CatalogIndex | null): SkillValidationIssueEntry[] {
  if (!catalog) return [];

  return catalog.skills
    .filter((skill) => !skill.disabled)
    .flatMap((skill) =>
      (skill.validationIssues ?? []).map((issue) => ({
        skill,
        issue,
      }))
    );
}
