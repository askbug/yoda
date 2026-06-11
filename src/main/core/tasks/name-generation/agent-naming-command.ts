import type { RuntimeCustomConfig } from '@shared/app-settings';
import { parseShellWords } from '@main/core/conversations/impl/agent-command';

const MODEL_FLAGS = new Set(['--model', '-m']);
const INLINE_MODEL_PLACEHOLDER_PATTERN = /^(?:--model|-m)=\{model\}$/;

export type AgentNamingCommand = {
  command: string;
  args: string[];
  stdin?: string;
};

export function buildAgentNamingCommand(
  providerConfig: RuntimeCustomConfig,
  prompt: string
): AgentNamingCommand {
  const template = providerConfig.namingCommand?.trim();
  if (!template) {
    throw new Error('No task naming command is configured for this agent.');
  }

  const model = providerConfig.namingModel?.trim() ?? '';
  const parsed = parseShellWords(template, { rejectShellSyntax: true });
  if (!parsed.ok) throw new Error(parsed.reason);
  if (parsed.words.length === 0) {
    throw new Error('Task naming command is empty.');
  }

  let consumesPromptArg = false;
  const words: string[] = [];
  for (const word of parsed.words) {
    if (word.includes('{prompt}')) consumesPromptArg = true;
    if (!model && word === '{model}' && MODEL_FLAGS.has(words.at(-1) ?? '')) {
      words.pop();
      continue;
    }
    if (!model && INLINE_MODEL_PLACEHOLDER_PATTERN.test(word)) continue;
    if (!model && word.includes('{model}')) {
      throw new Error('No task naming model is configured or inferred for this agent.');
    }
    words.push(word.split('{model}').join(model).split('{prompt}').join(prompt));
  }

  const [command, ...args] = words;
  return {
    command,
    args,
    stdin: consumesPromptArg ? undefined : prompt,
  };
}
