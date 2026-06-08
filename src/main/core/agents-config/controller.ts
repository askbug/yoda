import { createRPCController } from '@/shared/ipc/rpc';
import type { Agent, AgentDraft } from '@shared/agents';
import { agentsConfigService } from './agents-config-service';

export const agentsConfigController = createRPCController({
  list: (): Promise<Agent[]> => agentsConfigService.list(),

  get: (id: string): Promise<Agent | null> => agentsConfigService.get(id),

  create: (draft: AgentDraft): Promise<Agent> => agentsConfigService.create(draft),

  update: (id: string, draft: AgentDraft): Promise<Agent> => agentsConfigService.update(id, draft),

  remove: (id: string): Promise<void> => agentsConfigService.remove(id),

  duplicate: (id: string): Promise<Agent> => agentsConfigService.duplicate(id),
});
