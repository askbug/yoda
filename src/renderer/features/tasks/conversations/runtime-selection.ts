import { RUNTIME_IDS, type RuntimeId } from '@shared/runtime-registry';

type ResolveConversationProviderSelectionParams = {
  defaultProviderId: RuntimeId;
  runtimeOverride: RuntimeId | null;
  installedProviderIds: RuntimeId[];
  availabilityKnown: boolean;
};

export type ConversationRuntimeSelection = {
  runtimeId: RuntimeId | null;
  createDisabled: boolean;
};

export function resolveConversationRuntimeSelection({
  defaultProviderId,
  runtimeOverride,
  installedProviderIds,
  availabilityKnown,
}: ResolveConversationProviderSelectionParams): ConversationRuntimeSelection {
  const installedSet = new Set(installedProviderIds);
  const fallbackProviderId =
    availabilityKnown && !installedSet.has(defaultProviderId)
      ? RUNTIME_IDS.find((id) => installedSet.has(id))
      : undefined;

  const noInstalledAgents = availabilityKnown && installedSet.size === 0;
  const effectiveDefaultProviderId = noInstalledAgents
    ? null
    : (fallbackProviderId ?? defaultProviderId);
  const runtimeId = runtimeOverride ?? effectiveDefaultProviderId;
  const providerInstalled = runtimeId ? installedSet.has(runtimeId) : false;

  return {
    runtimeId,
    createDisabled: runtimeId === null || (availabilityKnown && !providerInstalled),
  };
}
