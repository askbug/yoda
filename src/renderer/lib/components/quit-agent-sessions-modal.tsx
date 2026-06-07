import { ExternalLink, Power, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getProvider } from '@shared/agent-provider-registry';
import { PRODUCT_NAME } from '@shared/app-identity';
import {
  quitAgentSessionsRespondedChannel,
  type QuitAgentSessionInfo,
  type QuitAgentSessionsRequest,
  type QuitAgentSessionsResponse,
} from '@shared/events/appEvents';
import { openTaskTarget } from '@renderer/app/open-task-target';
import { events, rpc } from '@renderer/lib/ipc';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { useCloseGuard } from '@renderer/lib/modal/use-close-guard';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';

export type QuitAgentSessionsModalArgs = {
  request: QuitAgentSessionsRequest;
};

type Props = BaseModalProps<void> & QuitAgentSessionsModalArgs;

const MAX_SESSION_LABEL_LENGTH = 96;

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function truncateLabel(value: string): string {
  if (value.length <= MAX_SESSION_LABEL_LENGTH) return value;
  return `${value.slice(0, MAX_SESSION_LABEL_LENGTH - 3)}...`;
}

function taskLabel(session: QuitAgentSessionInfo): string {
  return truncateLabel(session.taskTitle?.trim() || session.taskId);
}

function sessionLabel(session: QuitAgentSessionInfo, resolvedTitle?: string): string {
  return truncateLabel(resolvedTitle?.trim() || session.title.trim() || session.conversationId);
}

function providerName(session: QuitAgentSessionInfo): string {
  return getProvider(session.providerId)?.name ?? session.providerId;
}

export function QuitAgentSessionsModal({ request, onSuccess, onClose }: Props) {
  useCloseGuard(true);
  const { navigate } = useNavigate();
  const respondedRef = useRef(false);
  const [resolvedSessionTitles, setResolvedSessionTitles] = useState<{
    requestId: string;
    titles: Record<string, string>;
  }>({ requestId: '', titles: {} });
  const keepable = Math.max(0, Math.min(request.keepable, request.running));
  const direct = request.running - keepable;
  const allKeepable = keepable === request.running;
  const noneKeepable = keepable === 0;

  const respond = (response: QuitAgentSessionsResponse) => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    events.emit(quitAgentSessionsRespondedChannel, response);
    if (response.action === 'quit') {
      onSuccess();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    return () => {
      if (respondedRef.current) return;
      respondedRef.current = true;
      events.emit(quitAgentSessionsRespondedChannel, {
        requestId: request.requestId,
        action: 'cancel',
      });
    };
  }, [request.requestId]);

  useEffect(() => {
    let cancelled = false;

    if (request.nonKeepableSessions.length === 0) return;

    void Promise.all(
      request.nonKeepableSessions.map(async (session) => {
        try {
          const resolved = await rpc.conversations.getConversationSessionInfo(
            session.projectId,
            session.taskId,
            session.conversationId
          );
          return [session.sessionId, resolved.sessionTitle?.trim() ?? ''] as const;
        } catch {
          return [session.sessionId, ''] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [sessionId, title] of entries) {
        if (title) next[sessionId] = title;
      }
      setResolvedSessionTitles({ requestId: request.requestId, titles: next });
    });

    return () => {
      cancelled = true;
    };
  }, [request.nonKeepableSessions, request.requestId]);

  const cancel = () => respond({ requestId: request.requestId, action: 'cancel' });
  const quit = (mode: 'detach' | 'terminate') =>
    respond({ requestId: request.requestId, action: 'quit', mode });

  const openSession = (session: QuitAgentSessionInfo) => {
    cancel();
    openTaskTarget(
      {
        projectId: session.projectId,
        taskId: session.taskId,
        conversationId: session.conversationId,
      },
      navigate
    );
  };

  const title =
    request.running === 1
      ? 'An agent session is still running.'
      : `${request.running} agent sessions are still running.`;
  const stopLabel = pluralize(request.running, 'Stop Session', 'Stop Sessions');

  const detail = allKeepable
    ? `Keep them running in tmux after ${PRODUCT_NAME} quits, or stop them before exiting.`
    : noneKeepable
      ? `${request.running === 1 ? "This session isn't" : "These sessions aren't"} using tmux, so ${request.running === 1 ? 'it' : 'they'} can't keep running in the background after ${PRODUCT_NAME} quits.`
      : `${keepable} ${pluralize(keepable, 'session can', 'sessions can')} be kept in tmux. ${direct} direct ${pluralize(direct, 'session', 'sessions')} will stop if ${PRODUCT_NAME} quits.`;
  const sessionTitles =
    resolvedSessionTitles.requestId === request.requestId ? resolvedSessionTitles.titles : {};

  return (
    <>
      <DialogHeader showCloseButton={false}>
        <DialogTitle>Quit {PRODUCT_NAME}?</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="gap-4 pt-0">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-foreground-muted">{detail}</p>
        </div>

        {request.nonKeepableSessions.length > 0 ? (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background">
            {request.nonKeepableSessions.map((session) => {
              const label = taskLabel(session);
              const conversationLabel = sessionLabel(session, sessionTitles[session.sessionId]);
              const provider = providerName(session);
              return (
                <button
                  key={session.sessionId}
                  type="button"
                  className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-background-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  title={`${label} - ${conversationLabel} (${provider})`}
                  onClick={() => openSession(session)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{label}</span>
                    <span className="block truncate text-xs text-foreground-muted">
                      {provider} - {conversationLabel}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 text-foreground-muted" />
                </button>
              );
            })}
          </div>
        ) : null}
      </DialogContentArea>
      <DialogFooter>
        <Button variant="outline" onClick={cancel}>
          <X className="size-3.5" />
          Cancel
        </Button>
        {!noneKeepable ? (
          <Button variant="outline" onClick={() => quit('detach')}>
            <Power className="size-3.5" />
            {allKeepable ? 'Keep Running' : 'Keep tmux Sessions'}
          </Button>
        ) : null}
        <Button variant="destructive" onClick={() => quit('terminate')}>
          <Square className="size-3.5" />
          {stopLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
