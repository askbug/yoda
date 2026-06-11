import type { RuntimeId } from './runtime-registry';

export type RuntimeAutoApproveDefaults = Partial<Record<RuntimeId, boolean>>;

export function getAgentAutoApproveDefault(
  defaults: RuntimeAutoApproveDefaults | undefined,
  runtimeId: RuntimeId
): boolean {
  return defaults?.[runtimeId] ?? false;
}

export function resolveAgentAutoApprove(
  explicitAutoApprove: boolean | undefined,
  defaults: RuntimeAutoApproveDefaults | undefined,
  runtimeId: RuntimeId
): boolean {
  return explicitAutoApprove ?? getAgentAutoApproveDefault(defaults, runtimeId);
}
