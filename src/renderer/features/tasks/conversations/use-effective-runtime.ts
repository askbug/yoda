import { useState } from 'react';
import { isValidRuntimeId, RUNTIME_IDS, type RuntimeId } from '@shared/runtime-registry';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { appState } from '@renderer/lib/stores/app-state';
import { resolveConversationRuntimeSelection } from './runtime-selection';

export type EffectiveRuntime = {
  runtimeId: RuntimeId | null;
  setRuntimeOverride: (id: RuntimeId | null) => void;
  createDisabled: boolean;
};

export type ExternalRuntimeOverride = {
  value: RuntimeId | null;
  set: (id: RuntimeId | null) => void;
};

export function useEffectiveRuntime(
  connectionId?: string,
  external?: ExternalRuntimeOverride
): EffectiveRuntime {
  const [localOverride, setLocalOverride] = useState<RuntimeId | null>(null);
  const runtimeOverride = external ? external.value : localOverride;
  const setRuntimeOverride = external ? external.set : setLocalOverride;

  const { value: defaultAgentValue } = useAppSettingsKey('defaultRuntime');
  const defaultProviderId: RuntimeId = isValidRuntimeId(defaultAgentValue)
    ? defaultAgentValue
    : 'claude';

  const dependencyResource = connectionId
    ? appState.dependencies.getRemote(connectionId)
    : appState.dependencies.local;
  const availabilityKnown = dependencyResource.data !== null;
  const installedProviderIds = RUNTIME_IDS.filter(
    (id) => dependencyResource.data?.[id]?.status === 'available'
  );

  const { runtimeId, createDisabled } = resolveConversationRuntimeSelection({
    defaultProviderId,
    runtimeOverride,
    installedProviderIds,
    availabilityKnown,
  });

  return { runtimeId, setRuntimeOverride, createDisabled };
}
