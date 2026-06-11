import { type RuntimeId } from '@shared/runtime-registry';
import { taskNameFromPrompt } from '@shared/task-name';
import { agentConfig } from '@renderer/utils/agentConfig';

type ConversationTitleInput = {
  runtimeId: RuntimeId;
  title: string;
};

function capitalizeProviderId(runtimeId: RuntimeId): string {
  return `${runtimeId.charAt(0).toUpperCase()}${runtimeId.slice(1)}`;
}

function agentDisplayName(runtimeId: RuntimeId): string {
  return agentConfig[runtimeId]?.name ?? capitalizeProviderId(runtimeId);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDefaultTitleIndex(title: string, runtimeId: RuntimeId): number | null {
  const candidates = [agentDisplayName(runtimeId), capitalizeProviderId(runtimeId), runtimeId];
  for (const candidate of candidates) {
    const escaped = escapeRegExp(candidate);
    const bareMatch = title.match(new RegExp(`^${escaped}$`, 'i'));
    if (bareMatch) return 1;
    const indexedMatch = title.match(new RegExp(`^${escaped} \\(([1-9]\\d*)\\)$`, 'i'));
    if (!indexedMatch) continue;
    const rawIndex = indexedMatch[1];
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 1) continue;
    if (String(index) !== rawIndex) continue;
    return index;
  }
  return null;
}

export function formatConversationTitleForDisplay(runtimeId: RuntimeId, title: string): string {
  const index = parseDefaultTitleIndex(title, runtimeId);
  if (index === null) return title;
  const name = agentDisplayName(runtimeId);
  return index === 1 ? name : `${name} (${index})`;
}

export function nextDefaultConversationTitle(
  runtimeId: RuntimeId,
  conversations: ConversationTitleInput[]
): string {
  const used = new Set<number>();

  for (const conversation of conversations) {
    if (conversation.runtimeId !== runtimeId) continue;
    const index = parseDefaultTitleIndex(conversation.title, runtimeId);
    if (index !== null) used.add(index);
  }

  let next = 1;
  while (used.has(next)) next += 1;

  const name = agentDisplayName(runtimeId);
  return next === 1 ? name : `${name} (${next})`;
}

export function initialConversationTitle(
  runtimeId: RuntimeId,
  initialPrompt: string | undefined,
  conversations: ConversationTitleInput[]
): string {
  const promptTitle = initialPrompt ? taskNameFromPrompt(initialPrompt) : '';
  return promptTitle || nextDefaultConversationTitle(runtimeId, conversations);
}
