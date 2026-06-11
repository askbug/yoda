import { describe, expect, it } from 'vitest';
import { resolveConversationRuntimeSelection } from '@renderer/features/tasks/conversations/runtime-selection';

describe('resolveConversationRuntimeSelection', () => {
  it('keeps default provider while availability is unknown', () => {
    const selection = resolveConversationRuntimeSelection({
      defaultProviderId: 'claude',
      runtimeOverride: null,
      installedProviderIds: [],
      availabilityKnown: false,
    });

    expect(selection.runtimeId).toBe('claude');
    expect(selection.createDisabled).toBe(false);
  });

  it('falls back to the first installed provider when default is unavailable', () => {
    const selection = resolveConversationRuntimeSelection({
      defaultProviderId: 'claude',
      runtimeOverride: null,
      installedProviderIds: ['codex', 'qwen'],
      availabilityKnown: true,
    });

    expect(selection.runtimeId).toBe('codex');
    expect(selection.createDisabled).toBe(false);
  });

  it('disables creation when no agents are installed', () => {
    const selection = resolveConversationRuntimeSelection({
      defaultProviderId: 'claude',
      runtimeOverride: null,
      installedProviderIds: [],
      availabilityKnown: true,
    });

    expect(selection.runtimeId).toBeNull();
    expect(selection.createDisabled).toBe(true);
  });

  it('honors an explicit provider override', () => {
    const selection = resolveConversationRuntimeSelection({
      defaultProviderId: 'claude',
      runtimeOverride: 'codex',
      installedProviderIds: ['codex'],
      availabilityKnown: true,
    });

    expect(selection.runtimeId).toBe('codex');
    expect(selection.createDisabled).toBe(false);
  });
});
