import { describe, expect, it } from 'vitest';
import type { RuntimeCustomConfig } from '@shared/app-settings';
import { buildAgentNamingCommand } from './agent-naming-command';

function config(overrides: Partial<RuntimeCustomConfig> = {}): RuntimeCustomConfig {
  return {
    namingModel: 'small-model',
    namingCommand: 'agent run --model {model}',
    ...overrides,
  };
}

describe('buildAgentNamingCommand', () => {
  it('sends the naming prompt on stdin by default', () => {
    const command = buildAgentNamingCommand(config(), 'rename this task');

    expect(command).toEqual({
      command: 'agent',
      args: ['run', '--model', 'small-model'],
      stdin: 'rename this task',
    });
  });

  it('supports explicit prompt and model placeholders', () => {
    const command = buildAgentNamingCommand(
      config({ namingCommand: 'agent --model={model} --prompt {prompt}' }),
      'rename this task'
    );

    expect(command).toEqual({
      command: 'agent',
      args: ['--model=small-model', '--prompt', 'rename this task'],
      stdin: undefined,
    });
  });

  it('allows command templates without a model placeholder', () => {
    const command = buildAgentNamingCommand(
      config({ namingModel: '', namingCommand: 'agent rename' }),
      'rename this task'
    );

    expect(command).toEqual({
      command: 'agent',
      args: ['rename'],
      stdin: 'rename this task',
    });
  });

  it('omits split model flags when no model is configured or inferred', () => {
    const command = buildAgentNamingCommand(
      config({ namingModel: '', namingCommand: 'codex exec --model {model} -' }),
      'rename this task'
    );

    expect(command).toEqual({
      command: 'codex',
      args: ['exec', '-'],
      stdin: 'rename this task',
    });
  });

  it('omits inline model flags when no model is configured or inferred', () => {
    const command = buildAgentNamingCommand(
      config({ namingModel: '', namingCommand: 'codex exec --model={model} -' }),
      'rename this task'
    );

    expect(command).toEqual({
      command: 'codex',
      args: ['exec', '-'],
      stdin: 'rename this task',
    });
  });

  it('rejects non-flag model placeholders when no model is configured or inferred', () => {
    expect(() =>
      buildAgentNamingCommand(
        config({ namingModel: '', namingCommand: 'agent run --profile {model}-fast' }),
        'rename'
      )
    ).toThrow(/No task naming model/);
  });

  it('rejects shell control syntax', () => {
    expect(() =>
      buildAgentNamingCommand(config({ namingCommand: 'agent run | tee output' }), 'rename')
    ).toThrow(/executable command prefixes/);
  });
});
