import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { conversationTranscriptChangedChannel } from '@shared/events/conversationEvents';
import { resolveClaudeTranscriptPath } from '@main/core/session-title/claude-title-source';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { iterateLines } from '@main/utils/text-lines';
import { resolveTask } from '../projects/utils';
import { findClaudeTranscriptPathBySessionId } from './claude-transcript-locator';
import { getCodexSessionContext } from './getCodexSessionContext';
import { mapConversationRowToConversation } from './utils';

/**
 * Live transcript feed for the sidebar Transcript panel: the RAW on-disk JSONL
 * the CLI itself writes (Claude session transcript / Codex rollout) — every
 * line complete and unfiltered, plus a ref-counted fs.watch so the renderer
 * can mirror the file in real time. The panel tails the last lines; the full
 * file opens in the regular file viewer via `filePath`.
 */

const DEBOUNCE_MS = 250;
const READY_POLL_INTERVAL_MS = 1_000;
const READY_POLL_MAX_MS = 5 * 60_000;
/** The sidebar panel tails this many lines; the file tab shows the rest. */
const MAX_TAIL_LINES = 500;

export interface ConversationTranscript {
  /** Absolute path of the JSONL file, for opening in the file viewer. */
  filePath: string | null;
  /** Total JSONL lines in the file (non-empty). */
  totalLines: number;
  /** The last {@link MAX_TAIL_LINES} raw JSONL lines, in file order. */
  lines: string[];
}

const EMPTY_TRANSCRIPT: ConversationTranscript = { filePath: null, totalLines: 0, lines: [] };

export async function getConversationTranscript(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<ConversationTranscript> {
  const filePath = await resolveTranscriptPath(projectId, taskId, conversationId);
  if (!filePath) return EMPTY_TRANSCRIPT;

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return { ...EMPTY_TRANSCRIPT, filePath };
  }

  let totalLines = 0;
  const tail: string[] = [];
  for (const line of iterateLines(raw)) {
    if (!line.trim()) continue;
    totalLines += 1;
    tail.push(line);
    if (tail.length > MAX_TAIL_LINES) tail.shift();
  }
  return { filePath, totalLines, lines: tail };
}

// ── Live watch (ref-counted per conversation) ────────────────────────────────

class TranscriptWatch {
  refs = 0;
  private watcher: FSWatcher | undefined;
  private readyTimer: NodeJS.Timeout | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly readyDeadline = Date.now() + READY_POLL_MAX_MS;
  private stopped = false;

  constructor(
    private readonly filePath: string,
    private readonly conversationId: string
  ) {
    this.waitForFile();
  }

  stop(): void {
    this.stopped = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    try {
      this.watcher?.close();
    } catch {}
    this.watcher = undefined;
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
      this.watcher = watch(this.filePath, () => this.scheduleEmit());
      this.watcher.on('error', () => {});
    } catch (err) {
      log.warn('TranscriptFeed: failed to attach watcher', {
        filePath: this.filePath,
        error: String(err),
      });
      return;
    }
    // The file may have grown between getConversationTranscript and attach.
    this.scheduleEmit();
  }

  private scheduleEmit(): void {
    if (this.stopped || this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      if (this.stopped) return;
      events.emit(
        conversationTranscriptChangedChannel,
        { conversationId: this.conversationId },
        this.conversationId
      );
    }, DEBOUNCE_MS);
  }
}

const watches = new Map<string, TranscriptWatch>();

export async function subscribeConversationTranscript(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<void> {
  const existing = watches.get(conversationId);
  if (existing) {
    existing.refs += 1;
    return;
  }
  const filePath = await resolveTranscriptPath(projectId, taskId, conversationId);
  if (!filePath) return;
  const watchEntry = new TranscriptWatch(filePath, conversationId);
  watchEntry.refs = 1;
  watches.set(conversationId, watchEntry);
}

export async function unsubscribeConversationTranscript(
  _projectId: string,
  _taskId: string,
  conversationId: string
): Promise<void> {
  const entry = watches.get(conversationId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  watches.delete(conversationId);
  entry.stop();
}

async function resolveTranscriptPath(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<string | null> {
  const conversation = await loadConversation(conversationId);
  const cwd = resolveTask(projectId, taskId)?.conversations.taskPath;
  if (!conversation) return null;

  if (conversation.runtimeId === 'claude') {
    if (cwd) return resolveClaudeTranscriptPath(cwd, conversationId);
    return (await findClaudeTranscriptPathBySessionId(conversationId)) ?? null;
  }
  if (conversation.runtimeId === 'codex' && cwd) {
    const context = await getCodexSessionContext(
      cwd,
      conversation.id,
      conversation.title,
      conversation.createdAt ?? null
    ).catch(() => null);
    return context?.rolloutPath ?? null;
  }
  return null;
}

async function loadConversation(conversationId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row ? mapConversationRowToConversation(row) : null;
}
