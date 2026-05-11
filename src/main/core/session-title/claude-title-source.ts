import { watch, type FSWatcher } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { log } from '@main/lib/logger';
import type {
  SessionTitleContext,
  SessionTitleSource,
  SessionTitleWatcher,
  TitleListener,
} from './types';

/**
 * Claude Code stores session transcripts at
 *   ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
 * where <encoded-cwd> replaces both '/' and '.' with '-'.
 *
 * After the first user turn, Claude appends a line like
 *   {"type":"summary","summary":"<auto-title>","leafUuid":"..."}
 * each time it auto-titles the conversation. We tail the file and surface the
 * latest summary as the session title.
 */
export class ClaudeSessionTitleSource implements SessionTitleSource {
  readonly providerId = 'claude' as const;

  watch(ctx: SessionTitleContext, onTitle: TitleListener): SessionTitleWatcher {
    const filePath = resolveClaudeTranscriptPath(ctx.cwd, ctx.conversationId);
    return new ClaudeTranscriptTailer(filePath, onTitle);
  }
}

export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, '-');
}

export function resolveClaudeTranscriptPath(cwd: string, sessionId: string): string {
  return join(homedir(), '.claude', 'projects', encodeClaudeProjectDir(cwd), `${sessionId}.jsonl`);
}

const READY_POLL_INTERVAL_MS = 1_000;
const READY_POLL_MAX_MS = 5 * 60_000;

class ClaudeTranscriptTailer implements SessionTitleWatcher {
  private watcher: FSWatcher | undefined;
  private readyTimer: NodeJS.Timeout | undefined;
  private readyDeadline = Date.now() + READY_POLL_MAX_MS;
  private offset = 0;
  private buffer = '';
  private lastTitle: string | undefined;
  private stopped = false;
  private reading = false;
  private pendingRead = false;

  constructor(
    private readonly filePath: string,
    private readonly onTitle: TitleListener
  ) {
    this.waitForFile();
  }

  stop(): void {
    this.stopped = true;
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = undefined;
    }
  }

  private waitForFile(): void {
    if (this.stopped) return;
    stat(this.filePath)
      .then(() => this.attach())
      .catch(() => {
        if (this.stopped || Date.now() > this.readyDeadline) return;
        this.readyTimer = setTimeout(() => this.waitForFile(), READY_POLL_INTERVAL_MS);
      });
  }

  private attach(): void {
    if (this.stopped) return;
    try {
      this.watcher = watch(this.filePath, () => {
        this.scheduleRead();
      });
      this.watcher.on('error', (err) => {
        log.warn('ClaudeSessionTitleSource: watch error', {
          filePath: this.filePath,
          error: String(err),
        });
      });
    } catch (err) {
      log.warn('ClaudeSessionTitleSource: failed to attach watcher', {
        filePath: this.filePath,
        error: String(err),
      });
      return;
    }
    this.scheduleRead();
  }

  private scheduleRead(): void {
    if (this.stopped) return;
    if (this.reading) {
      this.pendingRead = true;
      return;
    }
    this.reading = true;
    void this.readAppended()
      .catch((err) => {
        log.warn('ClaudeSessionTitleSource: read error', {
          filePath: this.filePath,
          error: String(err),
        });
      })
      .finally(() => {
        this.reading = false;
        if (this.pendingRead && !this.stopped) {
          this.pendingRead = false;
          this.scheduleRead();
        }
      });
  }

  private async readAppended(): Promise<void> {
    const fileHandle = await open(this.filePath, 'r').catch(() => undefined);
    if (!fileHandle) return;
    try {
      const stats = await fileHandle.stat();
      if (stats.size < this.offset) {
        this.offset = 0;
        this.buffer = '';
      }
      if (stats.size === this.offset) return;
      const length = stats.size - this.offset;
      const buf = Buffer.alloc(length);
      await fileHandle.read(buf, 0, length, this.offset);
      this.offset = stats.size;
      this.buffer += buf.toString('utf8');

      let nl = this.buffer.indexOf('\n');
      while (nl !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line) this.tryEmitTitle(line);
        nl = this.buffer.indexOf('\n');
      }
    } finally {
      await fileHandle.close();
    }
  }

  private tryEmitTitle(line: string): void {
    if (this.stopped) return;
    if (!line.includes('"type":"summary"')) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!isSummaryRecord(parsed)) return;
    const title = parsed.summary.trim();
    if (!title || title === this.lastTitle) return;
    this.lastTitle = title;
    try {
      this.onTitle(title);
    } catch (err) {
      log.warn('ClaudeSessionTitleSource: listener threw', { error: String(err) });
    }
  }
}

function isSummaryRecord(value: unknown): value is { type: 'summary'; summary: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'summary' &&
    typeof (value as { summary?: unknown }).summary === 'string'
  );
}
