import { type Conversation } from '@shared/conversations';
import { type RuntimeId } from '@shared/runtime-registry';
import { type ConversationRow } from '@main/db/schema';

export function mapConversationRowToConversation(
  row: ConversationRow,
  resume: boolean = false
): Conversation {
  return {
    id: row.id,
    title: row.title,
    taskId: row.taskId,
    projectId: row.projectId,
    runtimeId: row.runtime as RuntimeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    autoApprove: row.config ? JSON.parse(row.config).autoApprove : undefined,
    resume: resume,
    lastInteractedAt: row.lastInteractedAt ?? null,
    isInitialConversation: row.isInitialConversation,
  };
}
