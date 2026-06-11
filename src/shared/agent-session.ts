import type { RuntimeId } from '@shared/runtime-registry';

export interface AgentSessionConfig {
  taskId: string;
  conversationId: string;
  runtimeId: RuntimeId;
  command: string;
  args: string[];
  cwd: string;
  sessionId?: string;
  shellSetup?: string;
  tmuxSessionName?: string;
  tmuxEnv?: Record<string, string>;
  autoApprove: boolean;
  resume: boolean;
}
