import { type Conversation } from '@shared/conversations';

export type ActiveConversationSession = {
  sessionId: string;
  conversationId: string;
  projectId: string;
  taskId: string;
  taskTitle?: string;
  providerId: Conversation['providerId'];
  title: string;
  detachable: boolean;
};

export interface ConversationProvider {
  startSession(
    conversation: Conversation,
    initialSize?: { cols: number; rows: number },
    isResuming?: boolean,
    initialPrompt?: string
  ): Promise<void>;
  stopSession(conversationId: string): Promise<void>;
  getActiveSessions(): ActiveConversationSession[];
  destroyAll(): Promise<void>;
  detachAll(): Promise<void>;
}

export type ConversationConfig = {
  autoApprove?: boolean;
};
