import type {
  AgentModelCandidateCacheEntry,
  AgentModelCandidateInferenceResult,
  AgentModelCandidateItem,
  AgentModelCandidateProviderSettings,
  AgentModelCandidateSource,
} from '@shared/agent-model-candidates';
import {
  AGENT_PROVIDERS,
  getProvider,
  type AgentProviderDefinition,
  type AgentProviderId,
} from '@shared/agent-provider-registry';
import type { ProviderCustomConfig } from '@shared/app-settings';
import { maasService } from '@main/core/maas/maas-service';
import { log } from '@main/lib/logger';
import { normalizeModelCandidates } from './model-candidate-parser';
import {
  filterModelsForProvider,
  sanitizeCachedModelIdsForProvider,
  sanitizeCatalogEntriesForProvider,
} from './provider-model-catalog';
import { providerOverrideSettings } from './provider-settings-service';
import { appSettingsService } from './settings-service';

const MODEL_CANDIDATE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type SourceResult = {
  source: AgentModelCandidateSource;
  models: string[];
  error?: string;
};

const CATALOG_SOURCE: AgentModelCandidateSource = 'catalog';
const SOURCE_ORDER: AgentModelCandidateSource[] = [
  'catalog',
  'zenmux',
  'officialApi',
  'docs',
  'cli',
];

export class ProviderModelCandidatesService {
  async inferNamingModelCandidates(
    providerId: AgentProviderId,
    args: { forceRefresh?: boolean } = {}
  ): Promise<AgentModelCandidateInferenceResult> {
    const provider = getProvider(providerId);
    const settings = await appSettingsService.get('agentModelCandidates');
    const existingSettings = normalizeProviderModelSettings(settings.providers[providerId]);
    const existingEntries = provider
      ? sanitizeCatalogEntriesForProvider(provider, existingSettings.sources)
      : existingSettings.sources;
    const existingHiddenModels = provider
      ? sanitizeCachedModelIdsForProvider(provider, existingSettings.hiddenModels)
      : existingSettings.hiddenModels;
    const freshEntries = existingEntries.filter(isFreshEntry);

    if (!args.forceRefresh && freshEntries.length > 0) {
      return buildInferenceResult(providerId, freshEntries, existingHiddenModels, true);
    }

    if (!provider) {
      return buildInferenceResult(providerId, existingEntries, existingHiddenModels, true);
    }

    const refreshedSettings = await this.refreshCandidates(
      provider,
      !!args.forceRefresh,
      existingSettings
    );
    const refreshedEntries = refreshedSettings.sources;
    const refreshedHiddenModels = sanitizeCachedModelIdsForProvider(
      provider,
      refreshedSettings.hiddenModels
    );
    if (refreshedEntries.length > 0) {
      return buildInferenceResult(providerId, refreshedEntries, refreshedHiddenModels, false);
    }

    if (existingEntries.length > 0) {
      return buildInferenceResult(providerId, existingEntries, existingHiddenModels, true);
    }

    return buildInferenceResult(providerId, refreshedEntries, refreshedHiddenModels, false);
  }

  async updateModelCandidatePreferences(
    providerId: AgentProviderId,
    args: {
      hiddenModels?: string[];
      preferredNamingModel?: string | null;
    }
  ): Promise<AgentModelCandidateInferenceResult> {
    const settings = await appSettingsService.get('agentModelCandidates');
    const current = normalizeProviderModelSettings(settings.providers[providerId]);
    const preferredNamingModel = args.preferredNamingModel?.trim() ?? '';
    const hiddenModels =
      args.hiddenModels === undefined
        ? current.hiddenModels
        : normalizeModelCandidates(args.hiddenModels);
    const nextHiddenModels = preferredNamingModel
      ? hiddenModels.filter((model) => model !== preferredNamingModel)
      : hiddenModels;

    await appSettingsService.update('agentModelCandidates', {
      providers: {
        [providerId]: {
          sources: current.sources,
          hiddenModels: nextHiddenModels,
        },
      },
    });

    if (args.preferredNamingModel !== undefined) {
      const providerConfig = await providerOverrideSettings.getItem(providerId);
      const nextConfig: ProviderCustomConfig = { ...(providerConfig ?? {}) };
      if (preferredNamingModel) {
        nextConfig.namingModel = preferredNamingModel;
      } else {
        delete nextConfig.namingModel;
      }
      await providerOverrideSettings.updateItem(providerId, nextConfig);
    }

    return this.inferNamingModelCandidates(providerId);
  }

  async refreshStartupModelCatalog(): Promise<void> {
    const settings = await appSettingsService.get('agentModelCandidates');
    const providers: Partial<Record<AgentProviderId, AgentModelCandidateProviderSettings>> = {};

    let catalogModels: string[] = [];
    try {
      catalogModels = await maasService.listZenmuxCatalogTextModelCandidates(true);
    } catch (error) {
      log.warn('provider-model-candidates-service: startup model catalog refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (catalogModels.length === 0) return;

    for (const provider of AGENT_PROVIDERS) {
      const current = normalizeProviderModelSettings(settings.providers[provider.id]);
      providers[provider.id] = {
        sources: [
          toCacheEntry({
            source: CATALOG_SOURCE,
            models: filterModelsForProvider(provider, catalogModels),
          }),
        ],
        hiddenModels: current.hiddenModels,
      };
    }

    if (Object.keys(providers).length === 0) return;
    await appSettingsService.update('agentModelCandidates', { providers });
  }

  private async refreshCandidates(
    provider: AgentProviderDefinition,
    forceRefresh: boolean,
    current: AgentModelCandidateProviderSettings
  ): Promise<AgentModelCandidateProviderSettings> {
    const result = await inferSource(CATALOG_SOURCE, () =>
      inferFromCatalog(provider, forceRefresh)
    );
    const entries = [toCacheEntry(result)];

    await appSettingsService.update('agentModelCandidates', {
      providers: {
        [provider.id]: {
          sources: entries,
          hiddenModels: current.hiddenModels,
        },
      },
    });

    return {
      sources: entries,
      hiddenModels: current.hiddenModels,
    };
  }
}

async function inferSource(
  source: AgentModelCandidateSource,
  load: () => Promise<string[]>
): Promise<SourceResult> {
  try {
    return { source, models: normalizeModelCandidates(await load()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.debug('provider-model-candidates-service: source failed', { source, error: message });
    return { source, models: [], error: message };
  }
}

function toCacheEntry(result: SourceResult): AgentModelCandidateCacheEntry {
  const fetchedAt = new Date();
  return {
    source: result.source,
    models: result.models,
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: new Date(fetchedAt.getTime() + MODEL_CANDIDATE_CACHE_TTL_MS).toISOString(),
    ...(result.error ? { error: result.error } : {}),
  };
}

function sortSourceEntries(
  entries: readonly AgentModelCandidateCacheEntry[]
): AgentModelCandidateCacheEntry[] {
  return [...entries].sort((left, right) => {
    const leftIndex = SOURCE_ORDER.indexOf(left.source);
    const rightIndex = SOURCE_ORDER.indexOf(right.source);
    return leftIndex - rightIndex;
  });
}

function isFreshEntry(entry: AgentModelCandidateCacheEntry): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function normalizeProviderModelSettings(
  settings: AgentModelCandidateProviderSettings | AgentModelCandidateCacheEntry[] | undefined
): AgentModelCandidateProviderSettings {
  if (Array.isArray(settings)) {
    return {
      sources: normalizeCatalogSources(settings),
      hiddenModels: [],
    };
  }
  return {
    sources: normalizeCatalogSources(settings?.sources ?? []),
    hiddenModels: normalizeModelCandidates(settings?.hiddenModels ?? []),
  };
}

function normalizeCatalogSources(
  sources: readonly AgentModelCandidateCacheEntry[]
): AgentModelCandidateCacheEntry[] {
  return sources.filter(isCatalogEntry).map((entry) => ({
    ...entry,
    source: CATALOG_SOURCE,
  }));
}

function isCatalogEntry(entry: AgentModelCandidateCacheEntry): boolean {
  return entry.source === CATALOG_SOURCE;
}

function buildInferenceResult(
  providerId: AgentProviderId,
  sources: readonly AgentModelCandidateCacheEntry[],
  hiddenModels: readonly string[],
  cached: boolean
): AgentModelCandidateInferenceResult {
  const sortedSources = sortSourceEntries(sources);
  const models = buildModelItems(sortedSources, hiddenModels);
  return {
    providerId,
    models,
    candidates: models.filter((model) => model.visible).map((model) => model.id),
    sources: sortedSources,
    hiddenModels: normalizeModelCandidates(hiddenModels),
    cached,
  };
}

function buildModelItems(
  entries: readonly AgentModelCandidateCacheEntry[],
  hiddenModels: readonly string[]
): AgentModelCandidateItem[] {
  const hidden = new Set(normalizeModelCandidates(hiddenModels));
  const sourceByModel = new Map<string, AgentModelCandidateSource[]>();

  for (const entry of entries) {
    for (const model of normalizeModelCandidates(entry.models)) {
      const sources = sourceByModel.get(model) ?? [];
      if (!sources.includes(entry.source)) sources.push(entry.source);
      sourceByModel.set(model, sources);
    }
  }

  return normalizeModelCandidates([...sourceByModel.keys()]).map((model) => ({
    id: model,
    visible: !hidden.has(model),
    sources: sourceByModel.get(model) ?? [],
  }));
}

async function inferFromCatalog(
  provider: AgentProviderDefinition,
  forceRefresh: boolean
): Promise<string[]> {
  const models = await maasService.listZenmuxCatalogTextModelCandidates(forceRefresh);
  if (models.length === 0) return [];

  return filterModelsForProvider(provider, models);
}

export const providerModelCandidatesService = new ProviderModelCandidatesService();
