import { Link2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { Issue, Task } from '@shared/tasks';
import { isRegistered, type TaskStore } from '@renderer/features/tasks/stores/task';
import { getTaskManagerStore } from '@renderer/features/tasks/stores/task-selectors';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { cn } from '@renderer/utils/utils';

export type ReadySessionStore = TaskStore & { data: Task };

export function getLinkedIssues(task: Task): Issue[] {
  return task.linkedIssues ?? (task.linkedIssue ? [task.linkedIssue] : []);
}

export function isIssueLinkedToSession(issue: Issue, session: ReadySessionStore): boolean {
  return getLinkedIssues(session.data).some((linkedIssue) => linkedIssue.url === issue.url);
}

export function getReadySessionStores(projectId: string): ReadySessionStore[] {
  const taskManager = getTaskManagerStore(projectId);
  if (!taskManager) return [];

  return Array.from(taskManager.tasks.values())
    .filter((store): store is ReadySessionStore => isRegistered(store))
    .filter((store) => !store.data.archivedAt);
}

export function getLinkedSessionStores(projectId: string, issue: Issue): ReadySessionStore[] {
  return getReadySessionStores(projectId).filter((session) =>
    isIssueLinkedToSession(issue, session)
  );
}

function SessionChip({ projectId, session }: { projectId: string; session: ReadySessionStore }) {
  const { navigate } = useNavigate();

  return (
    <Badge
      variant="outline"
      render={
        <button
          type="button"
          className="max-w-32 justify-start"
          onClick={() => navigate('task', { projectId, taskId: session.data.id })}
        />
      }
    >
      <span className="min-w-0 truncate">{session.data.name}</span>
    </Badge>
  );
}

export const IssueLinkedSessions = observer(function IssueLinkedSessions({
  issue,
  projectId,
  maxVisible = 3,
  className,
}: {
  issue: Issue;
  projectId: string;
  maxVisible?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const linkedSessions = getLinkedSessionStores(projectId, issue);
  const visibleSessions = linkedSessions.slice(0, maxVisible);
  const hiddenCount = Math.max(0, linkedSessions.length - visibleSessions.length);

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      <span className="text-xs text-foreground-passive">{t('issues.linkedSessions')}</span>
      {linkedSessions.length === 0 ? (
        <span className="text-xs text-foreground-passive">{t('issues.noLinkedSessions')}</span>
      ) : (
        <>
          {visibleSessions.map((session) => (
            <SessionChip key={session.data.id} projectId={projectId} session={session} />
          ))}
          {hiddenCount > 0 ? (
            <Badge variant="secondary">{t('issues.moreSessions', { count: hiddenCount })}</Badge>
          ) : null}
        </>
      )}
    </div>
  );
});

export const IssueSessionLinkPopover = observer(function IssueSessionLinkPopover({
  issue,
  projectId,
  compact = false,
  iconOnly = false,
}: {
  issue: Issue;
  projectId: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const sessions = getReadySessionStores(projectId);
  const linkedCount = sessions.filter((session) => isIssueLinkedToSession(issue, session)).length;
  const label =
    linkedCount > 0
      ? t('issues.manageLinkedSessions', { count: linkedCount })
      : t('issues.linkSessions');

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={iconOnly ? 'ghost' : 'outline'}
            size={iconOnly ? 'icon-xs' : compact ? 'xs' : 'sm'}
            aria-label={label}
            title={label}
          >
            <Link2 className="size-3.5" />
            {iconOnly ? null : label}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="text-xs font-medium text-foreground-muted">
            {t('issues.linkSessions')}
          </div>
          <div className="text-xs text-foreground-passive">
            {t('issues.linkedSessionCount', { count: linkedCount })}
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-foreground-passive">
            {t('issues.noSessionsToLink')}
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {sessions.map((session) => {
              const checked = isIssueLinkedToSession(issue, session);
              const issueCount = getLinkedIssues(session.data).length;

              return (
                <div
                  key={session.data.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    checked && 'bg-muted/60'
                  )}
                  onClick={() => {
                    if (checked) {
                      void session.unlinkIssue(issue.url);
                    } else {
                      void session.linkIssue(issue);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (checked) {
                      void session.unlinkIssue(issue.url);
                    } else {
                      void session.linkIssue(issue);
                    }
                  }}
                >
                  <Checkbox
                    checked={checked}
                    aria-hidden
                    tabIndex={-1}
                    className="pointer-events-none"
                  />
                  <span className="min-w-0 flex-1 truncate">{session.data.name}</span>
                  <span className="shrink-0 text-xs text-foreground-passive">
                    {t('issues.sessionIssueCount', { count: issueCount })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
