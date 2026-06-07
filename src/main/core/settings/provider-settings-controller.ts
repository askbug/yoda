import { createRPCController } from '@/shared/ipc/rpc';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { ProviderCustomConfig } from '@shared/app-settings';
import { providerModelCandidatesService } from './provider-model-candidates-service';
import { providerOverrideSettings } from './provider-settings-service';

export const providerSettingsController = createRPCController({
  getAll: (): Promise<Record<string, ProviderCustomConfig>> => providerOverrideSettings.getAll(),

  getItem: (id: string): Promise<ProviderCustomConfig | undefined> =>
    providerOverrideSettings.getItem(id),

  getItemWithMeta: (
    id: string
  ): Promise<{
    value: ProviderCustomConfig;
    defaults: ProviderCustomConfig;
    overrides: Partial<ProviderCustomConfig>;
  } | null> => providerOverrideSettings.getItemWithMeta(id),

  updateItem: (id: string, config: Partial<ProviderCustomConfig>): Promise<void> =>
    providerOverrideSettings.updateItem(id, config),

  resetItem: (id: string): Promise<void> => providerOverrideSettings.resetItem(id),

  resetAll: (): Promise<void> => providerOverrideSettings.resetAll(),

  inferNamingModelCandidates: (id: AgentProviderId, args?: { forceRefresh?: boolean }) =>
    providerModelCandidatesService.inferNamingModelCandidates(id, args),

  updateModelCandidatePreferences: (
    id: AgentProviderId,
    args: {
      hiddenModels?: string[];
      preferredNamingModel?: string | null;
    }
  ) => providerModelCandidatesService.updateModelCandidatePreferences(id, args),
});
