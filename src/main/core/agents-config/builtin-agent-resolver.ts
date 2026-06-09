import type { AgentProviderId } from '@shared/agent-provider-registry';
import { agentsConfigService } from './agents-config-service';

/**
 * The runtime + model + base prompt an internal AI utility (task naming,
 * session summary, …) should use, resolved from its built-in Agent. Every
 * LLM-backed feature is modeled as an Agent, so its provider/model/prompt are
 * configurable in the Agent Store rather than via bespoke settings.
 */
export interface ResolvedUtilityAgent {
  providerId: AgentProviderId | null;
  model: string | null;
  systemPrompt: string;
}

/**
 * Resolves the built-in Agent that drives an internal utility (by slug). Returns
 * nulls when the Agent is absent or has no preferred runtime, so callers can
 * fall back to their existing defaults.
 */
export async function resolveUtilityAgent(builtinSlug: string): Promise<ResolvedUtilityAgent> {
  const agent = await agentsConfigService.getBySlug(builtinSlug);
  if (!agent) return { providerId: null, model: null, systemPrompt: '' };
  return {
    providerId: agent.preferredRuntimeProvider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
  };
}
