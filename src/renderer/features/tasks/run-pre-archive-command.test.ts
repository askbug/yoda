import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runPreArchiveCommand } from './run-pre-archive-command';

const mocks = vi.hoisted(() => ({
  asProvisioned: vi.fn(),
  getCodexSessionContext: vi.fn(),
  getTaskStore: vi.fn(),
  sendInput: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@renderer/features/tasks/stores/task-selectors', () => ({
  asProvisioned: mocks.asProvisioned,
  getTaskStore: mocks.getTaskStore,
}));

vi.mock('@renderer/lib/ipc', () => ({
  rpc: {
    conversations: {
      getCodexSessionContext: mocks.getCodexSessionContext,
    },
    pty: {
      sendInput: mocks.sendInput,
    },
  },
}));

vi.mock('@renderer/utils/logger', () => ({
  log: {
    warn: mocks.warn,
  },
}));

function makeConversation(providerId: 'codex' | 'claude') {
  const conversation = {
    data: {
      id: 'conversation-1',
      providerId,
      title: providerId === 'codex' ? 'Codex' : 'Claude',
      lastInteractedAt: '2026-05-30T00:00:00.000Z',
    },
    session: {
      sessionId: `${providerId}-session`,
    },
    status: 'idle',
    setStatus: vi.fn((status: string) => {
      conversation.status = status;
    }),
    setWorking: vi.fn(() => {
      conversation.status = 'working';
    }),
    clearWorking: vi.fn(() => {
      if (conversation.status === 'working') {
        conversation.status = 'idle';
      }
    }),
  };
  return conversation;
}

function mockProvisionedConversation(conversation: ReturnType<typeof makeConversation>) {
  mocks.getTaskStore.mockReturnValue({});
  mocks.asProvisioned.mockReturnValue({
    path: '/workspace',
    conversations: {
      conversations: new Map([['conversation-1', conversation]]),
    },
  });
}

describe('runPreArchiveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCodexSessionContext.mockResolvedValue({ completedTurnCount: 0 });
    mocks.sendInput.mockResolvedValue({ ok: true });
  });

  it('commits Codex compact commands with space before carriage-return submission', async () => {
    const conversation = makeConversation('codex');
    mockProvisionedConversation(conversation);
    mocks.sendInput.mockImplementation(async (_sessionId: string, data: string) => {
      if (data === '\r') conversation.status = 'completed';
      return { ok: true };
    });

    await runPreArchiveCommand('project-1', 'task-1', 'lovstudio-git-commit-with-context');

    expect(mocks.sendInput.mock.calls).toEqual([
      ['codex-session', '$lovstudio-git-commit-with-context'],
      ['codex-session', ' '],
      ['codex-session', '\r'],
    ]);
  });

  it('keeps carriage-return submission for Claude commands', async () => {
    const conversation = makeConversation('claude');
    mockProvisionedConversation(conversation);
    mocks.sendInput.mockImplementation(async (_sessionId: string, data: string) => {
      if (data === '\r') conversation.status = 'completed';
      return { ok: true };
    });

    await runPreArchiveCommand('project-1', 'task-1', 'lovstudio-git-commit-with-context');

    expect(mocks.sendInput.mock.calls).toEqual([
      ['claude-session', '/lovstudio-git-commit-with-context'],
      ['claude-session', '\r'],
    ]);
  });

  it('sends Ctrl-C and clears working state when interrupted', async () => {
    const conversation = makeConversation('codex');
    const abortController = new AbortController();
    mockProvisionedConversation(conversation);
    mocks.sendInput.mockImplementation(async (_sessionId: string, data: string) => {
      if (data === '\r') abortController.abort();
      return { ok: true };
    });

    await runPreArchiveCommand('project-1', 'task-1', 'lovstudio-git-commit-with-context', {
      signal: abortController.signal,
    });

    expect(mocks.sendInput.mock.calls).toEqual([
      ['codex-session', '$lovstudio-git-commit-with-context'],
      ['codex-session', ' '],
      ['codex-session', '\r'],
      ['codex-session', '\x03'],
    ]);
    expect(conversation.status).toBe('idle');
  });

  it('finishes Codex pre-archive wait when rollout task completion advances', async () => {
    vi.useFakeTimers();
    const conversation = makeConversation('codex');
    mockProvisionedConversation(conversation);
    mocks.getCodexSessionContext
      .mockResolvedValueOnce({ completedTurnCount: 2 })
      .mockResolvedValueOnce({ completedTurnCount: 3 });

    const run = runPreArchiveCommand('project-1', 'task-1', 'lovstudio-git-commit-with-context');
    await vi.runAllTimersAsync();
    await run;

    expect(mocks.getCodexSessionContext).toHaveBeenCalledWith(
      '/workspace',
      'conversation-1',
      'Codex'
    );
    expect(conversation.status).toBe('completed');
    vi.useRealTimers();
  });
});
