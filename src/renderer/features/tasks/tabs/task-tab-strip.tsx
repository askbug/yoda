import { Archive, ArchiveX, GitCompare, Loader2, MessageSquare, Plus, X } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { formatConversationTitleForDisplay } from '@renderer/features/tasks/conversations/conversation-title-utils';
import { GitChangeStatusIcon } from '@renderer/features/tasks/diff-view/changes-panel/components/changes-list-item';
import { runPreArchiveCommand } from '@renderer/features/tasks/run-pre-archive-command';
import type { ResolvedDiffTab, ResolvedTab } from '@renderer/features/tasks/tabs/tab-manager-store';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { splitPath } from '@renderer/features/tasks/utils';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { ReorderList } from '@renderer/lib/components/reorder-list';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/lib/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { agentConfig } from '@renderer/utils/agentConfig';
import { log } from '@renderer/utils/logger';
import { cn } from '@renderer/utils/utils';

export const TaskTabStrip = observer(function TaskTabStrip() {
  const { t } = useTranslation();
  const { projectId, taskId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const { taskView } = provisioned;
  const { tabManager } = taskView;
  const tabs = tabManager.resolvedTabs;
  const activeTabId = tabManager.resolvedActiveTabId;
  const showCreateConversationModal = useShowModal('createConversationModal');
  const { value: homeDraft } = useAppSettingsKey('homeDraft');
  const preArchiveCommand = homeDraft?.preArchiveCommand ?? '';
  const [archivingConversationId, setArchivingConversationId] = useState<string | null>(null);
  const mountedProject = asMounted(getProjectStore(projectId));
  const connectionId =
    mountedProject?.data.type === 'ssh' ? mountedProject.data.connectionId : undefined;

  const tabIds = useMemo(() => tabs.map((tab) => tab.tabId), [tabs]);
  const tabsById = useMemo(() => new Map(tabs.map((tab) => [tab.tabId, tab])), [tabs]);

  const handleReorder = (newIds: string[]) => {
    for (let toIndex = 0; toIndex < newIds.length; toIndex++) {
      const fromIndex = tabIds.indexOf(newIds[toIndex]!);
      if (fromIndex === -1) continue;
      if (fromIndex !== toIndex) {
        tabManager.reorderTabs(fromIndex, toIndex);
        return;
      }
    }
  };

  const handleCreateConversation = () => {
    showCreateConversationModal({
      connectionId,
      projectId,
      taskId,
      onSuccess: ({ conversationId }) => {
        tabManager.openConversation(conversationId);
        taskView.setFocusedRegion('main');
      },
    });
  };

  const handleArchiveConversation = (
    conversationId: string,
    options?: { skipPreCommand?: boolean }
  ) => {
    if (archivingConversationId) return;
    void (async () => {
      try {
        setArchivingConversationId(conversationId);
        if (!options?.skipPreCommand && preArchiveCommand.trim().length > 0) {
          await runPreArchiveCommand(projectId, taskId, conversationId, preArchiveCommand);
        }
        await provisioned.conversations.archiveConversation(conversationId);
      } catch (error) {
        log.warn('TaskTabStrip: archive conversation failed', {
          projectId,
          taskId,
          conversationId,
          error,
        });
      } finally {
        setArchivingConversationId(null);
      }
    })();
  };

  return (
    <div
      className="flex h-9 shrink-0 items-stretch border-b border-border bg-background-secondary"
      role="tablist"
    >
      <div className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <ReorderList
          axis="x"
          items={tabIds}
          onReorder={handleReorder}
          className="flex h-full shrink-0"
          itemClassName="flex h-full shrink-0 list-none"
          getKey={(tabId) => tabId}
        >
          {(tabId) => {
            const tab = tabsById.get(tabId);
            if (!tab) return null;
            return (
              <TaskTab
                tab={tab}
                isActive={activeTabId === tab.tabId}
                closeLabel={t('tasks.tabs.close')}
                previewLabel={t('tasks.tabs.preview')}
                onSelect={() => {
                  taskView.setFocusedRegion('main');
                  tabManager.setActiveTab(tab.tabId);
                }}
                onClose={() => tabManager.closeTab(tab.tabId)}
                onPin={() => tabManager.pinTab(tab.tabId)}
                archiveLabel={t('tasks.tabs.archiveConversation')}
                archiveSkipPreLabel={t('tasks.tabs.archiveConversationSkipPre')}
                isArchiving={
                  tab.kind === 'conversation' && archivingConversationId === tab.conversationId
                }
                hasPreArchiveCommand={preArchiveCommand.trim().length > 0}
                onArchiveConversation={
                  tab.kind === 'conversation'
                    ? (options) => handleArchiveConversation(tab.conversationId, options)
                    : undefined
                }
              />
            );
          }}
        </ReorderList>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t('tasks.tabs.newConversation')}
                className="flex w-9 shrink-0 items-center justify-center border-r border-border text-foreground-passive outline-none transition-colors hover:bg-background-secondary-1/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={handleCreateConversation}
              >
                <Plus className="size-4" />
              </button>
            }
          />
          <TooltipContent>{t('tasks.tabs.newConversation')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});

function TaskTab({
  tab,
  isActive,
  closeLabel,
  previewLabel,
  archiveLabel,
  archiveSkipPreLabel,
  isArchiving,
  hasPreArchiveCommand,
  onSelect,
  onClose,
  onPin,
  onArchiveConversation,
}: {
  tab: ResolvedTab;
  isActive: boolean;
  closeLabel: string;
  previewLabel: string;
  archiveLabel: string;
  archiveSkipPreLabel: string;
  isArchiving: boolean;
  hasPreArchiveCommand: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPin: () => void;
  onArchiveConversation?: (options?: { skipPreCommand?: boolean }) => void;
}) {
  const meta = getTabMeta(tab);
  const title = tab.isPreview ? `${meta.title} (${previewLabel})` : meta.title;

  const tabContent = (
    <div
      className={cn(
        'group/tab relative flex h-full w-48 min-w-32 max-w-56 items-stretch border-r border-border text-foreground-muted',
        'bg-background-secondary hover:bg-background-secondary-1/70',
        isActive && 'bg-background text-foreground hover:bg-background',
        isArchiving && 'text-foreground/40'
      )}
    >
      {isActive && <div className="absolute inset-x-0 top-0 h-0.5 bg-foreground" />}
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        title={title}
        onClick={onSelect}
        onDoubleClick={() => {
          if (tab.isPreview) onPin();
        }}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">{meta.icon}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-xs leading-none',
              tab.isPreview && 'italic text-foreground-muted'
            )}
          >
            {meta.label}
          </span>
          {meta.detail && (
            <span className="min-w-0 truncate text-[10px] leading-none text-foreground-passive">
              {meta.detail}
            </span>
          )}
        </span>
        {tab.kind === 'file' && tab.isDirty && (
          <span className="size-1.5 shrink-0 rounded-full bg-foreground-muted" />
        )}
      </button>
      {isArchiving && (
        <span className="flex size-6 shrink-0 self-center text-foreground-passive">
          <Loader2 className="m-auto size-3.5 animate-spin" />
        </span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={closeLabel}
              className={cn(
                'mr-1 flex size-6 shrink-0 self-center rounded-md text-foreground-passive opacity-0 outline-none transition-colors hover:bg-background-2 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring group-hover/tab:opacity-100 group-focus-within/tab:opacity-100',
                isArchiving && 'hidden'
              )}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              <X className="m-auto size-3.5" />
            </button>
          }
        />
        <TooltipContent>{closeLabel}</TooltipContent>
      </Tooltip>
    </div>
  );

  if (tab.kind !== 'conversation' || !onArchiveConversation) return tabContent;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-full shrink-0">{tabContent}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onArchiveConversation()} disabled={isArchiving}>
          {isArchiving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Archive className="size-4" />
          )}
          {archiveLabel}
        </ContextMenuItem>
        {hasPreArchiveCommand && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onArchiveConversation({ skipPreCommand: true })}
              disabled={isArchiving}
            >
              <ArchiveX className="size-4" />
              {archiveSkipPreLabel}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function getTabMeta(tab: ResolvedTab): {
  icon: ReactNode;
  label: string;
  detail?: string;
  title: string;
} {
  if (tab.kind === 'conversation') {
    const providerId = tab.store.data.providerId;
    const config = agentConfig[providerId];
    const label =
      formatConversationTitleForDisplay(providerId, tab.store.data.title).trim() ||
      config?.name ||
      providerId;
    return {
      icon: config ? (
        <AgentLogo
          logo={config.logo}
          alt={config.alt}
          isSvg={config.isSvg}
          invertInDark={config.invertInDark}
          className="size-3.5"
        />
      ) : (
        <MessageSquare className="size-3.5" />
      ),
      label,
      title: label,
    };
  }

  const { filename, directory } = splitPath(tab.path);
  if (tab.kind === 'file') {
    return {
      icon: <FileIcon filename={filename} size={13} />,
      label: filename,
      detail: directory,
      title: tab.path,
    };
  }

  return {
    icon: tab.status ? (
      <GitChangeStatusIcon status={tab.status} className="size-3.5" />
    ) : (
      <GitCompare className="size-3.5 text-foreground-passive" />
    ),
    label: filename,
    detail: directory || diffGroupLabel(tab.diffGroup),
    title: tab.path,
  };
}

function diffGroupLabel(group: ResolvedDiffTab['diffGroup']): string {
  switch (group) {
    case 'disk':
      return 'Changed';
    case 'staged':
      return 'Staged';
    case 'pr':
      return 'PR';
    case 'git':
      return 'Git';
  }
}
