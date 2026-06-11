import type { RuntimeId } from '@shared/runtime-registry';

/**
 * Roadmap content — single source of truth for the runtime capability matrix.
 *
 * All display strings resolve through i18n:
 *   roadmap.categories.<categoryId>          — category label
 *   roadmap.features.<featureId>.name/.desc  — feature name + what it covers
 *   roadmap.notes.<noteKey>                  — the research insight behind a cell
 *
 * To update progress, edit the cells below; missing cells fall back to 'planned'.
 */

export type RoadmapStatus = 'shipped' | 'testing' | 'inProgress' | 'researching' | 'planned' | 'na';

export type RoadmapRuntimeColumn = {
  id: RuntimeId;
  /** Runtime not integrated yet — the whole column renders as upcoming. */
  upcoming?: boolean;
};

export const ROADMAP_RUNTIMES: readonly RoadmapRuntimeColumn[] = [
  { id: 'claude' },
  { id: 'codex' },
  { id: 'hermes', upcoming: true },
];

export type RoadmapCell = {
  status: RoadmapStatus;
  /** i18n key suffix under roadmap.notes.* */
  noteKey?: string;
};

/**
 * Each capability is researched like a book chapter: a standalone deep-dive
 * report comparing how mainstream agents design and implement it. All reports
 * together build toward《高质量 Agent 设计指南》.
 */
export type RoadmapReportStatus = 'published' | 'draft' | 'planned';

export type RoadmapReport = {
  status: RoadmapReportStatus;
  url?: string;
};

export type RoadmapFeature = {
  id: string;
  cells: Partial<Record<RuntimeId, RoadmapCell>>;
  /** Missing report means the chapter is still planned. */
  report?: RoadmapReport;
};

export type RoadmapCategory = {
  id: string;
  features: RoadmapFeature[];
};

export const ROADMAP_FALLBACK_STATUS: RoadmapStatus = 'planned';

export const ROADMAP_CATEGORIES: readonly RoadmapCategory[] = [
  {
    id: 'lifecycle',
    features: [
      {
        id: 'version',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      {
        id: 'install',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      {
        id: 'launch',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      { id: 'doctor', cells: {} },
    ],
  },
  {
    id: 'session',
    features: [
      {
        id: 'sessionNameSync',
        cells: {
          claude: { status: 'shipped', noteKey: 'sessionNameSync.claude' },
          codex: { status: 'shipped', noteKey: 'sessionNameSync.codex' },
        },
        report: { status: 'draft' },
      },
      {
        id: 'sessionAutoRename',
        cells: {
          claude: { status: 'shipped', noteKey: 'sessionAutoRename.claude' },
          codex: { status: 'shipped', noteKey: 'sessionAutoRename.codex' },
        },
        report: { status: 'draft' },
      },
      {
        id: 'sessionStateSync',
        cells: {
          claude: { status: 'shipped', noteKey: 'sessionStateSync.claude' },
          codex: { status: 'testing', noteKey: 'sessionStateSync.codex' },
        },
        report: { status: 'draft' },
      },
      {
        id: 'sessionResume',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      { id: 'compaction', cells: {} },
      { id: 'checkpointing', cells: {} },
    ],
  },
  {
    id: 'context',
    features: [
      {
        id: 'projectPrompt',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      {
        id: 'systemPrompt',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      { id: 'memory', cells: {} },
      { id: 'fileContext', cells: {} },
    ],
  },
  {
    id: 'extensibility',
    features: [
      {
        id: 'mcp',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      {
        id: 'skills',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped', noteKey: 'skills.codex' },
        },
      },
      { id: 'plugins', cells: {} },
      { id: 'subagents', cells: {} },
      {
        id: 'hooks',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'researching', noteKey: 'hooks.codex' },
        },
      },
      { id: 'slashCommands', cells: {} },
      { id: 'outputStyles', cells: {} },
    ],
  },
  {
    id: 'control',
    features: [
      { id: 'permissions', cells: {} },
      { id: 'sandboxing', cells: {} },
      { id: 'managedSettings', cells: {} },
      { id: 'trustModel', cells: {} },
    ],
  },
  {
    id: 'account',
    features: [
      {
        id: 'authSync',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      {
        id: 'usageSync',
        cells: {
          claude: { status: 'shipped', noteKey: 'usageSync.claude' },
          codex: { status: 'shipped' },
        },
      },
      { id: 'modelConfig', cells: {} },
      { id: 'providers', cells: {} },
    ],
  },
  {
    id: 'workflow',
    features: [
      {
        id: 'worktrees',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
      { id: 'codeReview', cells: {} },
      { id: 'headlessCi', cells: {} },
      { id: 'sdk', cells: {} },
      { id: 'ideAcp', cells: {} },
    ],
  },
  {
    id: 'surface',
    features: [
      {
        id: 'statusline',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'researching', noteKey: 'statusline.codex' },
        },
      },
      { id: 'notifications', cells: {} },
      { id: 'keybindings', cells: {} },
      { id: 'planMode', cells: {} },
    ],
  },
  {
    id: 'orchestration',
    features: [
      { id: 'agentTeams', cells: {} },
      { id: 'routines', cells: {} },
      { id: 'remoteExecution', cells: {} },
    ],
  },
  {
    id: 'observability',
    features: [
      { id: 'telemetry', cells: {} },
      {
        id: 'costTracking',
        cells: {
          claude: { status: 'shipped' },
        },
      },
      {
        id: 'transcript',
        cells: {
          claude: { status: 'shipped' },
          codex: { status: 'shipped' },
        },
      },
    ],
  },
];

export function getRoadmapCell(feature: RoadmapFeature, runtimeId: RuntimeId): RoadmapCell {
  return feature.cells[runtimeId] ?? { status: ROADMAP_FALLBACK_STATUS };
}

export function getRoadmapReport(feature: RoadmapFeature): RoadmapReport {
  return feature.report ?? { status: 'planned' };
}

/** Chapter counts by report status, for the book progress line. */
export function getReportCounts(): Record<RoadmapReportStatus, number> {
  const counts: Record<RoadmapReportStatus, number> = { published: 0, draft: 0, planned: 0 };
  for (const category of ROADMAP_CATEGORIES) {
    for (const feature of category.features) {
      counts[getRoadmapReport(feature).status] += 1;
    }
  }
  return counts;
}

export type RuntimeProgress = {
  shipped: number;
  total: number;
};

/** Shipped count over applicable (non-`na`) features for one runtime column. */
export function getRuntimeProgress(runtimeId: RuntimeId): RuntimeProgress {
  let shipped = 0;
  let total = 0;
  for (const category of ROADMAP_CATEGORIES) {
    for (const feature of category.features) {
      const cell = getRoadmapCell(feature, runtimeId);
      if (cell.status === 'na') continue;
      total += 1;
      if (cell.status === 'shipped') shipped += 1;
    }
  }
  return { shipped, total };
}
