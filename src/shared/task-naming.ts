export const TASK_NAMING_CONTEXT_SOURCE_IDS = [
  'prompt',
  'project',
  'readme',
  'recentTasks',
] as const;

export type TaskNamingContextSourceId = (typeof TASK_NAMING_CONTEXT_SOURCE_IDS)[number];

export type TaskNamingLanguage = 'app' | 'prompt' | 'en' | 'zh-CN';

export type TaskNamingContextSettings = Record<TaskNamingContextSourceId, boolean>;

export type TaskNamingSettings = {
  model: string;
  language: TaskNamingLanguage;
  context: TaskNamingContextSettings;
  recentTaskLimit: number;
  requestTimeoutMs: number;
};

export const DEFAULT_TASK_NAMING_MODEL = '';
export const DEFAULT_TASK_NAMING_RECENT_TASK_LIMIT = 8;
export const DEFAULT_TASK_NAMING_TIMEOUT_MS = 15_000;

export const DEFAULT_TASK_NAMING_CONTEXT: TaskNamingContextSettings = {
  prompt: true,
  project: true,
  readme: true,
  recentTasks: true,
};

export type TaskNamingStatus = 'idle' | 'generating' | 'ready' | 'failed';

export type TaskNamingContextSource = {
  id: TaskNamingContextSourceId;
  label: string;
  content: string;
  estimatedTokens: number;
  truncated?: boolean;
};

export type TaskNamingDebugStage = {
  name: string;
  durationMs: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TaskNamingDebugTrace = {
  totalDurationMs: number;
  stages: TaskNamingDebugStage[];
};

export type TaskNamingContextSnapshot = {
  version: 1;
  taskId: string;
  projectId: string;
  createdAt: string;
  language: TaskNamingLanguage;
  model: string;
  estimatedTokens: number;
  estimatedCharacters: number;
  sourceCount: number;
  generationMethod?: 'agent-cli';
  debugTrace?: TaskNamingDebugTrace;
  sources: TaskNamingContextSource[];
};

export type TaskNamingSnapshot = {
  taskId: string;
  projectId: string;
  status: TaskNamingStatus;
  model: string | null;
  context: TaskNamingContextSnapshot | null;
  generatedTaskName?: string;
  generatedBranchName?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
