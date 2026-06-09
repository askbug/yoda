import { useQuery } from '@tanstack/react-query';
import { PanelRightClose } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { openTaskTopTab } from '@renderer/app/open-task-target';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import type { ConversationStore } from '@renderer/features/tasks/conversations/conversation-manager';
import { getResumeInitialSize } from '@renderer/features/tasks/conversations/conversations-panel';
import { FileDiffView } from '@renderer/features/tasks/diff-view/main-panel/file-diff-view';
import { OtherFileRenderer } from '@renderer/features/tasks/editor/editor-main-panel';
import { LeasedMonacoEditor } from '@renderer/features/tasks/editor/leased-monaco-editor';
import { MarkdownSourceToggleOverlay } from '@renderer/features/tasks/editor/markdown-editor-panel';
import { useIsActiveTask } from '@renderer/features/tasks/hooks/use-is-active-task';
import { getTaskStore } from '@renderer/features/tasks/stores/task-selectors';
import type { FileTabStore } from '@renderer/features/tasks/tabs/file-tab-store';
import { buildTaskWindowTarget, getTabMeta } from '@renderer/features/tasks/tabs/task-tab-strip';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { MarkdownEditorRenderer } from '@renderer/lib/editor/markdown-renderer';
import { rpc } from '@renderer/lib/ipc';
import { PaneSizingProvider } from '@renderer/lib/pty/pane-sizing-context';
import { PtyPane } from '@renderer/lib/pty/pty-pane';
import type { TerminalFileLinkOptions } from '@renderer/lib/pty/terminal-file-links';
import { appState } from '@renderer/lib/stores/app-state';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@renderer/lib/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';

/**
 * Right side pane holding a single tab moved out of the tab strip, so the user
 * can keep a session (or file/diff) in view while freely switching tabs in the
 * main area. Move semantics: the tab lives either in the strip or here, never
 * both; closing the pane returns the tab to the strip.
 */
export const TaskSidePane = observer(function TaskSidePane() {
  const { t } = useTranslation();
  const { projectId, taskId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const { tabManager } = provisioned.taskView;
  const tab = tabManager.sidePaneTab;

  if (!tab) return null;

  const meta = getTabMeta(tab);
  const moveBackLabel = t('tasks.sidePane.moveBack');

  // Returning the tab to the main area must also surface it as a top-level
  // app tab — the internal strip is no longer rendered, so without this the
  // entity would silently vanish from view.
  const moveBack = () => {
    const resolved = tabManager.sidePaneTab;
    tabManager.moveSidePaneTabBack();
    appState.sidePane.clear();
    if (resolved) {
      openTaskTopTab(projectId, taskId, buildTaskWindowTarget(projectId, taskId, resolved).tab);
    }
  };

  return (
    <div
      data-task-side-pane
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground',
        tabManager.sidePaneDropHover && 'ring-1 ring-inset ring-ring'
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger className="shrink-0">
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-background-secondary px-2">
            <span className="flex size-4 shrink-0 items-center justify-center">{meta.icon}</span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={meta.title}>
              <span className="min-w-0 truncate text-xs leading-none text-foreground">
                {meta.label}
              </span>
              {meta.detail && (
                <span className="min-w-0 truncate text-[10px] leading-none text-foreground-passive">
                  {meta.detail}
                </span>
              )}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={moveBackLabel}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-passive outline-none transition-colors hover:bg-background-2 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={moveBack}
                  >
                    <PanelRightClose className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent>{moveBackLabel}</TooltipContent>
            </Tooltip>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-max">
          <ContextMenuItem className="whitespace-nowrap" onClick={moveBack}>
            <PanelRightClose className="size-4" />
            {moveBackLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SidePaneContent />
      </div>
    </div>
  );
});

const SidePaneContent = observer(function SidePaneContent() {
  const { tabManager } = useProvisionedTask().taskView;
  const entry = tabManager.sidePaneEntry;

  if (!entry) return null;

  if (entry.kind === 'conversation') {
    const conversation = tabManager.sidePaneConversation;
    if (!conversation) return null;
    return <SidePaneConversation key={entry.tabId} conversation={conversation} />;
  }

  if (entry.kind === 'diff') {
    return (
      <FileDiffView
        key={entry.tabId}
        file={{
          path: entry.path,
          type: entry.diffGroup === 'disk' ? 'disk' : 'git',
          group: entry.diffGroup,
          originalRef: entry.originalRef,
          modifiedRef: entry.modifiedRef,
          prNumber: entry.prNumber,
        }}
      />
    );
  }

  if (entry.kind === 'file') {
    return <SidePaneFile key={entry.tabId} file={entry} />;
  }

  return null;
});

const SidePaneFile = observer(function SidePaneFile({ file }: { file: FileTabStore }) {
  switch (file.renderer.kind) {
    case 'text':
    case 'svg-source':
      return <LeasedMonacoEditor filePath={file.path} />;
    case 'markdown':
      return <MarkdownEditorRenderer filePath={file.path} />;
    case 'markdown-source':
      return (
        <LeasedMonacoEditor
          filePath={file.path}
          overlay={<MarkdownSourceToggleOverlay filePath={file.path} />}
        />
      );
    default:
      return (
        <div className="h-full overflow-hidden">
          <OtherFileRenderer file={file} />
        </div>
      );
  }
});

const SidePaneConversation = observer(function SidePaneConversation({
  conversation,
}: {
  conversation: ConversationStore;
}) {
  const { projectId, taskId } = useTaskViewContext();
  const provisioned = useProvisionedTask();
  const { conversations } = provisioned;
  const isActive = useIsActiveTask(taskId);
  const mountedProject = asMounted(getProjectStore(projectId));
  const remoteConnectionId =
    mountedProject?.data.type === 'ssh' ? mountedProject.data.connectionId : undefined;

  const session = conversation.session;
  const sessionId = session.sessionId;
  const sessionStatus = session.status;
  const sessionIds = useMemo(() => (sessionId ? [sessionId] : []), [sessionId]);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoResumeSessionRef = useRef<string | null>(null);

  // Auto-resume the session when it becomes visible here (mirrors ConversationsPanel).
  useEffect(() => {
    if (!isActive) {
      lastAutoResumeSessionRef.current = null;
      return;
    }
    if (!sessionId || sessionStatus !== 'ready' || !session.pty) return;
    if (lastAutoResumeSessionRef.current === sessionId) return;
    lastAutoResumeSessionRef.current = sessionId;
    const initialSize = getResumeInitialSize(session.pty, terminalContainerRef.current);
    void conversations.resumeConversation(conversation.data.id, initialSize);
  }, [conversation, conversations, isActive, session, sessionId, sessionStatus]);

  const markConversationSubmitted = (forceWorking = false) => {
    conversation.setWorking({ force: forceWorking });
    void conversations.touchConversation(conversation.data.id);
    void getTaskStore(projectId, taskId)?.setNeedsReview(false);
  };

  const { data: homeDir } = useQuery({
    queryKey: ['homeDir'],
    queryFn: () => rpc.app.getHomeDir(),
    staleTime: Infinity,
    enabled: !remoteConnectionId,
  });
  const fileLinks = useMemo<TerminalFileLinkOptions>(
    () => ({
      workspaceRoot: provisioned.path,
      homeDir: typeof homeDir === 'string' ? homeDir : undefined,
      isRemote: Boolean(remoteConnectionId),
      onOpen: ({ filePath, absolutePath, line, column }) => {
        if (filePath) {
          // Open into the MAIN area — the whole point of the side pane is
          // keeping this session visible while inspecting other content.
          provisioned.taskView.tabManager.openFile(filePath, { line, column });
          provisioned.taskView.setFocusedRegion('main');
          return;
        }
        if (absolutePath) {
          void rpc.app.openIn({ app: 'finder', path: absolutePath });
        }
      },
    }),
    [provisioned.path, provisioned.taskView, remoteConnectionId, homeDir]
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[var(--xterm-bg)] px-2 pt-2">
      <PaneSizingProvider paneId="side-pane" sessionIds={sessionIds}>
        {sessionId && sessionStatus === 'ready' && session.pty ? (
          <div
            ref={terminalContainerRef}
            className="relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden"
          >
            <PtyPane
              sessionId={sessionId}
              pty={session.pty}
              className="h-full w-full min-w-0"
              onEnterPress={() => {
                markConversationSubmitted(conversation.status === 'awaiting-input');
              }}
              onSubmittedInput={(_message, isTaskInput) => {
                if (isTaskInput || conversation.status !== 'awaiting-input') return;
                markConversationSubmitted(true);
              }}
              onInterruptPress={() => conversation.clearWorking()}
              mapShiftEnterToCtrlJ
              remoteConnectionId={remoteConnectionId}
              fileLinks={fileLinks}
            />
          </div>
        ) : null}
      </PaneSizingProvider>
    </div>
  );
});
