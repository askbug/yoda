import {
  agentSessionStatusChangedChannel,
  isAgentSessionRunningStatus,
  type AgentEvent,
  type AgentSessionRuntimeStatus,
} from '@shared/events/agentEvents';
import { events } from '@main/lib/events';

type SessionKey = {
  projectId: string;
  taskId: string;
  conversationId: string;
};

function keyFor({ projectId, taskId, conversationId }: SessionKey): string {
  return `${projectId}\0${taskId}\0${conversationId}`;
}

function statusForAgentEvent(event: AgentEvent): AgentSessionRuntimeStatus | null {
  if (event.type === 'stop') return 'completed';
  if (event.type === 'error') return 'error';
  if (event.type === 'notification') return 'awaiting-input';
  return null;
}

class AgentSessionRuntimeStore {
  private statuses = new Map<string, AgentSessionRuntimeStatus>();
  private offRendererStatusChanged: (() => void) | null = null;

  initialize(): void {
    if (this.offRendererStatusChanged) return;
    this.offRendererStatusChanged = events.on(agentSessionStatusChangedChannel, (event) => {
      this.setStatus(event, event.status);
    });
  }

  dispose(): void {
    this.offRendererStatusChanged?.();
    this.offRendererStatusChanged = null;
    this.statuses.clear();
  }

  setStatus(session: SessionKey, status: AgentSessionRuntimeStatus): void {
    this.statuses.set(keyFor(session), status);
  }

  setFromAgentEvent(event: AgentEvent): void {
    const status = statusForAgentEvent(event);
    if (!status) return;
    this.setStatus(event, status);
  }

  remove(session: SessionKey): void {
    this.statuses.delete(keyFor(session));
  }

  isRunning(session: SessionKey): boolean {
    const status = this.statuses.get(keyFor(session)) ?? 'idle';
    return isAgentSessionRunningStatus(status);
  }

  getStatus(session: SessionKey): AgentSessionRuntimeStatus {
    return this.statuses.get(keyFor(session)) ?? 'idle';
  }
}

export const agentSessionRuntimeStore = new AgentSessionRuntimeStore();
