import type { AgentProviderId } from './agent-provider-registry';

export const AGENT_MODEL_CANDIDATE_SOURCES = [
  'catalog',
  'officialApi',
  'zenmux',
  'docs',
  'cli',
] as const;

export type AgentModelCandidateSource = (typeof AGENT_MODEL_CANDIDATE_SOURCES)[number];

export type AgentModelCandidateCacheEntry = {
  source: AgentModelCandidateSource;
  models: string[];
  fetchedAt: string;
  expiresAt: string;
  error?: string;
};

export type AgentModelCandidateItem = {
  id: string;
  visible: boolean;
  sources: AgentModelCandidateSource[];
};

export type AgentModelCandidateProviderSettings = {
  sources: AgentModelCandidateCacheEntry[];
  hiddenModels: string[];
};

export type AgentModelCandidatesSettings = {
  providers: Partial<Record<AgentProviderId, AgentModelCandidateProviderSettings>>;
};

export type AgentModelCandidateInferenceResult = {
  providerId: AgentProviderId;
  models: AgentModelCandidateItem[];
  candidates: string[];
  sources: AgentModelCandidateCacheEntry[];
  hiddenModels: string[];
  cached: boolean;
};
