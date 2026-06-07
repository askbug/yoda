import { defineEvent } from '@shared/ipc/events';

export const conversationRenamedChannel = defineEvent<{
  conversationId: string;
  projectId: string;
  taskId: string;
  title: string;
}>('conversation:renamed');

export const conversationArchivedChannel = defineEvent<{
  conversationId: string;
  projectId: string;
  taskId: string;
}>('conversation:archived');
