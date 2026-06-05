import { Loader2, Plus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Issue } from '@shared/tasks';
import { getReadySessionStores } from '@renderer/features/projects/components/issues-view/issue-session-links';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { Input } from '@renderer/lib/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { Textarea } from '@renderer/lib/ui/textarea';
import { cn } from '@renderer/utils/utils';

interface CreateIssueButtonProps {
  repositoryUrl: string | null;
  projectId?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  onCreated?: (issue: Issue) => Promise<void> | void;
}

export const CreateIssueButton = observer(function CreateIssueButton({
  repositoryUrl,
  projectId,
  disabled,
  iconOnly = false,
  onCreated,
}: CreateIssueButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const sessions = projectId ? getReadySessionStores(projectId) : [];

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((selectedId) => selectedId !== sessionId)
        : [...current, sessionId]
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repositoryUrl || isCreating) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('issues.titleRequired'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await rpc.github.createIssue({
        repositoryUrl,
        title: trimmedTitle,
        body,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      const selectedSessions = sessions.filter((session) =>
        selectedSessionIds.includes(session.data.id)
      );
      await Promise.all(selectedSessions.map((session) => session.linkIssue(result.issue)));

      setTitle('');
      setBody('');
      setSelectedSessionIds([]);
      setOpen(false);
      await onCreated?.(result.issue);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('issues.createIssueFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (isCreating) return;
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant={iconOnly ? 'ghost' : 'outline'}
            size={iconOnly ? 'icon-sm' : 'sm'}
            disabled={disabled || !repositoryUrl}
            aria-label={t('issues.newIssue')}
            title={t('issues.newIssue')}
          >
            {isCreating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {iconOnly ? null : t('issues.newIssue')}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-3">
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('issues.issueTitlePlaceholder')}
            autoFocus
          />
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('issues.issueBodyPlaceholder')}
            className="min-h-24"
          />
          {projectId ? (
            <div className="rounded-md border border-border bg-background-1 p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground-muted">
                  {t('issues.linkOnCreate')}
                </span>
                {selectedSessionIds.length > 0 ? (
                  <span className="text-xs text-foreground-passive">
                    {t('issues.selectedSessionCount', { count: selectedSessionIds.length })}
                  </span>
                ) : null}
              </div>
              {sessions.length === 0 ? (
                <p className="py-2 text-center text-xs text-foreground-passive">
                  {t('issues.noSessionsToLink')}
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto">
                  {sessions.map((session) => {
                    const checked = selectedSessionIds.includes(session.data.id);
                    return (
                      <div
                        key={session.data.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                          checked && 'bg-muted/60'
                        )}
                        onClick={() => toggleSession(session.data.id)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          toggleSession(session.data.id);
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          aria-hidden
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <span className="min-w-0 flex-1 truncate">{session.data.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isCreating}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={isCreating || !title.trim()}>
              {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t('issues.createIssue')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
});
