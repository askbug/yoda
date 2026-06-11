import { getAgentAutoApproveDefault } from '@shared/agent-auto-approve-defaults';
import type { RuntimeId } from '@shared/runtime-registry';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';

export function useRuntimeAutoApproveDefaults() {
  const { value, isLoading, isSaving, update } = useAppSettingsKey('runtimeAutoApproveDefaults');
  const defaults = value ?? {};

  return {
    defaults,
    loading: isLoading,
    saving: isSaving,
    getDefault: (runtimeId: RuntimeId) => getAgentAutoApproveDefault(defaults, runtimeId),
    setDefault: (runtimeId: RuntimeId, enabled: boolean) => update({ [runtimeId]: enabled }),
  };
}
