import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IExecutionContext } from '@main/core/execution-context/types';
import { ensureCodexThreadArchived } from './codex-archive';

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock('@main/lib/logger', () => ({
  log: {
    warn: mocks.logWarn,
  },
}));

describe('ensureCodexThreadArchived', () => {
  let dir: string;
  let statePath: string;
  let ctx: IExecutionContext;
  let exec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yoda-codex-archive-'));
    statePath = join(dir, 'state_5.sqlite');
    createStateDb(statePath);
    exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    ctx = {
      root: '/repo',
      supportsLocalSpawn: true,
      exec: exec as unknown as IExecutionContext['exec'],
      execStreaming: vi.fn() as unknown as IExecutionContext['execStreaming'],
      dispose: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs codex archive for active threads', async () => {
    insertThread(statePath, { id: 'thread-1', archived: 0 });

    await ensureCodexThreadArchived({
      runtimeId: 'codex',
      providerConfig: {
        cli: 'codex',
        resumeFlag: 'resume',
        resumeSessionIdArg: true,
      },
      threadId: 'thread-1',
      ctx,
      statePath,
    });

    expect(exec).toHaveBeenCalledWith('codex', ['archive', 'thread-1'], {
      timeout: 10_000,
      maxBuffer: 32 * 1024,
    });
  });

  it('does not run archive for already archived threads', async () => {
    insertThread(statePath, { id: 'thread-1', archived: 1 });

    await ensureCodexThreadArchived({
      runtimeId: 'codex',
      providerConfig: {
        cli: 'codex',
        resumeFlag: 'resume',
        resumeSessionIdArg: true,
      },
      threadId: 'thread-1',
      ctx,
      statePath,
    });

    expect(exec).not.toHaveBeenCalled();
  });

  it('logs and swallows archive failures', async () => {
    insertThread(statePath, { id: 'thread-1', archived: 0 });
    exec.mockRejectedValueOnce(new Error('archive failed'));

    await ensureCodexThreadArchived({
      runtimeId: 'codex',
      providerConfig: {
        cli: 'codex',
        resumeFlag: 'resume',
        resumeSessionIdArg: true,
      },
      threadId: 'thread-1',
      ctx,
      statePath,
    });

    expect(mocks.logWarn).toHaveBeenCalledWith(
      'ensureCodexThreadArchived: failed to archive Codex thread',
      {
        threadId: 'thread-1',
        error: 'Error: archive failed',
      }
    );
  });
});

function createStateDb(statePath: string): void {
  const db = new Database(statePath);
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        archived INTEGER NOT NULL DEFAULT 0
      );
    `);
  } finally {
    db.close();
  }
}

function insertThread(statePath: string, args: { id: string; archived: number }): void {
  const db = new Database(statePath);
  try {
    db.prepare(`INSERT INTO threads (id, archived) VALUES (?, ?)`).run(args.id, args.archived);
  } finally {
    db.close();
  }
}
