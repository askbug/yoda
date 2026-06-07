import { getProvider } from '@shared/agent-provider-registry';
import { PRODUCT_NAME } from '@shared/app-identity';
import type { ActiveAgentSessionSummary } from '@main/core/tasks/task-manager';
import type { TeardownMode } from '@main/core/workspaces/workspace-registry';

export type QuitAgentSessionsDecision =
  | { action: 'quit'; mode: TeardownMode }
  | { action: 'cancel' };

type QuitDialogOptions = {
  type: 'question';
  buttons: string[];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
  noLink: boolean;
};

type ShowQuitDialog = (options: QuitDialogOptions) => number;

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function messageFor(summary: ActiveAgentSessionSummary): string {
  return summary.running === 1
    ? 'An agent session is still running.'
    : `${summary.running} agent sessions are still running.`;
}

type SessionDetail = ActiveAgentSessionSummary['nonKeepableSessions'][number];

const MAX_VISIBLE_SESSION_DETAILS = 8;
const MAX_SESSION_LABEL_LENGTH = 96;

function truncateLabel(value: string): string {
  if (value.length <= MAX_SESSION_LABEL_LENGTH) return value;
  return `${value.slice(0, MAX_SESSION_LABEL_LENGTH - 3)}...`;
}

function sessionLabel(session: SessionDetail): string {
  const taskTitle = session.taskTitle?.trim() || session.taskId;
  const title = session.title.trim() || session.conversationId;
  const providerName = getProvider(session.providerId)?.name ?? session.providerId;
  return truncateLabel(`${taskTitle} - ${title} (${providerName})`);
}

function formatSessionList(sessions: SessionDetail[]): string {
  if (sessions.length === 0) return '';

  const visible = sessions.slice(0, MAX_VISIBLE_SESSION_DETAILS).map((session) => {
    return `- ${sessionLabel(session)}`;
  });
  const hiddenCount = sessions.length - visible.length;
  if (hiddenCount > 0) {
    visible.push(`- and ${hiddenCount} more`);
  }
  return visible.join('\n');
}

function directOnlyDetail(summary: ActiveAgentSessionSummary): string {
  const count = summary.running;
  const sessionText = count === 1 ? "This session isn't" : "These sessions aren't";
  const pronoun = count === 1 ? 'it' : 'they';
  const stopObject = count === 1 ? 'it' : 'them';
  const list = formatSessionList(summary.nonKeepableSessions);

  const intro = `${sessionText} using tmux, so ${pronoun} can't keep running in the background after ${PRODUCT_NAME} quits.`;
  const action = `Stop ${stopObject} to quit, or cancel to keep working.`;

  return list ? `${intro}\n\n${list}\n\n${action}` : `${intro} ${action}`;
}

function mixedDetail(summary: ActiveAgentSessionSummary, keepable: number, direct: number): string {
  const list = formatSessionList(summary.nonKeepableSessions);
  const intro = `${keepable} ${pluralize(keepable, 'session can', 'sessions can')} be kept in tmux. ${direct} direct ${pluralize(direct, 'session', 'sessions')} will stop if ${PRODUCT_NAME} quits.`;

  return list ? `${intro}\n\n${list}` : intro;
}

export function resolveQuitAgentSessionsDecision(
  summary: ActiveAgentSessionSummary,
  showDialog: ShowQuitDialog
): QuitAgentSessionsDecision {
  if (summary.running <= 0) return { action: 'quit', mode: 'terminate' };

  const keepable = Math.max(0, Math.min(summary.keepable, summary.running));
  const direct = summary.running - keepable;
  const title = `Quit ${PRODUCT_NAME}?`;
  const message = messageFor(summary);

  if (keepable === summary.running) {
    const response = showDialog({
      type: 'question',
      buttons: ['Keep Running', 'Stop Sessions', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title,
      message,
      detail: `Keep them running in tmux after ${PRODUCT_NAME} quits, or stop them before exiting.`,
      noLink: true,
    });
    if (response === 0) return { action: 'quit', mode: 'detach' };
    if (response === 1) return { action: 'quit', mode: 'terminate' };
    return { action: 'cancel' };
  }

  if (keepable > 0) {
    const response = showDialog({
      type: 'question',
      buttons: ['Keep tmux Sessions', 'Stop Sessions', 'Cancel'],
      defaultId: 2,
      cancelId: 2,
      title,
      message,
      detail: mixedDetail(summary, keepable, direct),
      noLink: true,
    });
    if (response === 0) return { action: 'quit', mode: 'detach' };
    if (response === 1) return { action: 'quit', mode: 'terminate' };
    return { action: 'cancel' };
  }

  const response = showDialog({
    type: 'question',
    buttons: ['Stop Sessions', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title,
    message,
    detail: directOnlyDetail(summary),
    noLink: true,
  });
  if (response === 0) return { action: 'quit', mode: 'terminate' };
  return { action: 'cancel' };
}
