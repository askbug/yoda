import { Link2, Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Issue } from '@shared/tasks';
import {
  getLinkedIssues,
  isIssueLinkedToTask,
  type ReadyTaskStore,
} from '@renderer/features/projects/components/issues-view/issue-task-links';
import {
  IssueIdentifier,
  ProviderLogo,
  StatusDot,
} from '@renderer/features/tasks/components/issue-selector/issue-selector';
import { rpc } from '@renderer/lib/ipc';
import { Badge } from '@renderer/lib/ui/badge';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { SearchInput } from '@renderer/lib/ui/search-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';

export type TaskIssueLinkingState = {
  issues: Issue[];
  isLoading: boolean;
  hasAnyIntegration: boolean;
  onSearchTermChange: (term: string) => void;
};

function issueKey(issue: Issue): string {
  return issue.url || `${issue.provider}:${issue.identifier}`;
}

function mergeIssueCandidates(candidates: Issue[], linkedIssues: Issue[]): Issue[] {
  const issueMap = new Map<string, Issue>();

  for (const issue of linkedIssues) {
    issueMap.set(issueKey(issue), issue);
  }

  for (const issue of candidates) {
    const key = issueKey(issue);
    issueMap.set(key, issue);
  }

  return [...issueMap.values()];
}

function issueMatchesQuery(issue: Issue, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return [issue.identifier, issue.title, issue.url].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery)
  );
}

function TaskIssueChip({ issue }: { issue: Issue }) {
  const chip = (
    <>
      <ProviderLogo provider={issue.provider} className="size-3" />
      <IssueIdentifier identifier={issue.identifier} />
    </>
  );

  if (!issue.url) {
    return (
      <Badge variant="outline" className="max-w-32 justify-start gap-1.5">
        {chip}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="max-w-32 justify-start gap-1.5"
      title={issue.title}
      render={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void rpc.app.openExternal(issue.url);
          }}
        />
      }
    >
      {chip}
    </Badge>
  );
}

export const TaskLinkedIssues = observer(function TaskLinkedIssues({
  task,
  maxVisible = 2,
  className,
}: {
  task: ReadyTaskStore;
  maxVisible?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const linkedIssues = getLinkedIssues(task.data);
  const visibleIssues = linkedIssues.slice(0, maxVisible);
  const hiddenCount = Math.max(0, linkedIssues.length - visibleIssues.length);

  if (linkedIssues.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      <span className="text-xs text-foreground-passive">{t('issues.linkedIssues')}</span>
      {visibleIssues.map((issue) => (
        <TaskIssueChip key={issueKey(issue)} issue={issue} />
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="secondary">{t('issues.moreIssues', { count: hiddenCount })}</Badge>
      ) : null}
    </div>
  );
});

function TaskIssueCandidateRow({ issue, task }: { issue: Issue; task: ReadyTaskStore }) {
  const checked = isIssueLinkedToTask(issue, task);

  const toggleIssue = () => {
    if (checked) {
      void task.unlinkIssue(issue.url);
      return;
    }

    void task.linkIssue(issue);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
        checked && 'bg-muted/60'
      )}
      onClick={toggleIssue}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleIssue();
      }}
    >
      <Checkbox checked={checked} aria-hidden tabIndex={-1} className="pointer-events-none" />
      <ProviderLogo provider={issue.provider} className="size-3.5" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <StatusDot status={issue.status} />
        <IssueIdentifier identifier={issue.identifier} />
        <span className="min-w-0 truncate text-foreground">{issue.title}</span>
      </span>
    </div>
  );
}

export const TaskIssueLinkPopover = observer(function TaskIssueLinkPopover({
  task,
  issueLinking,
}: {
  task: ReadyTaskStore;
  issueLinking: TaskIssueLinkingState;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const linkedIssues = getLinkedIssues(task.data);
  const linkedCount = linkedIssues.length;
  const label =
    linkedCount > 0
      ? t('issues.manageLinkedIssues', { count: linkedCount })
      : t('issues.linkIssues');

  const issues = useMemo(() => {
    const mergedIssues = mergeIssueCandidates(issueLinking.issues, linkedIssues);
    return mergedIssues.filter((issue) => issueMatchesQuery(issue, query));
  }, [issueLinking.issues, linkedIssues, query]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen || !query) return;
    setQuery('');
    issueLinking.onSearchTermChange('');
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    issueLinking.onSearchTermChange(nextQuery);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={label}>
                  <Link2 className="size-3.5" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-96 gap-2 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <div className="text-xs font-medium text-foreground-muted">{t('issues.linkIssues')}</div>
          <div className="text-xs text-foreground-passive">
            {t('issues.linkedIssueCount', { count: linkedCount })}
          </div>
        </div>
        {!issueLinking.hasAnyIntegration ? (
          <p className="px-2 py-3 text-center text-xs text-foreground-passive">
            {t('issues.connectIntegrationDescription')}
          </p>
        ) : (
          <>
            <SearchInput
              value={query}
              onChange={handleQueryChange}
              placeholder={t('issues.searchByTitleNumber')}
              className="h-8 text-xs"
            />
            {issueLinking.isLoading && issues.length === 0 ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-foreground-muted" />
              </div>
            ) : issues.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-foreground-passive">
                {query.trim() ? t('issues.noIssuesFound') : t('issues.noIssuesToLink')}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {issues.map((issue) => (
                  <TaskIssueCandidateRow key={issueKey(issue)} issue={issue} task={task} />
                ))}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
});
