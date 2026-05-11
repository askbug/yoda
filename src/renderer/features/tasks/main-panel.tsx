import { Eye, Loader2, Pencil } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Activity, useEffect, useRef } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import {
  getTaskStore,
  taskErrorMessage,
  taskViewKind,
} from '@renderer/features/tasks/stores/task-selectors';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { panelDragStore } from '@renderer/lib/layout/panel-drag-store';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/lib/ui/resizable';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { ConversationsPanel } from './conversations/conversations-panel';
import { DiffView } from './diff-view/main-panel/diff-view';
import { EditorMainPanel } from './editor/editor-main-panel';
import { useEditorContext } from './editor/editor-provider';
import { MarkdownEditorPanel } from './editor/markdown-editor-panel';
import { TerminalsPanel } from './terminals/terminal-panel';
import { TaskSidebar } from './view/task-sidebar';

export const TaskMainPanel = observer(function TaskMainPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);

  if (kind === 'creating') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
        <p className="text-xs font-mono text-foreground-muted">Creating task</p>
      </div>
    );
  }

  if (kind === 'create-error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-foreground-destructive">
            Error creating task
          </p>
          <p className="text-xs font-mono text-foreground-passive">{taskErrorMessage(taskStore)}</p>
        </div>
      </div>
    );
  }

  if (kind === 'project-mounting' || kind === 'provisioning') {
    const progressMessage = taskStore?.provisionProgressMessage ?? 'Setting up workspace…';
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
        <p className="text-xs font-mono text-foreground-muted">{progressMessage}</p>
      </div>
    );
  }

  if (kind === 'provision-error' || kind === 'project-error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-foreground-destructive">
            Failed to set up workspace
          </p>
          <p className="text-xs font-mono text-foreground-muted">{taskErrorMessage(taskStore)}</p>
        </div>
      </div>
    );
  }

  if (kind === 'idle' || kind === 'teardown') {
    const progressMessage = taskStore?.provisionProgressMessage ?? 'Setting up workspace…';
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
        <p className="text-xs font-mono text-foreground-muted">{progressMessage}</p>
      </div>
    );
  }

  if (kind === 'teardown-error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-foreground-destructive">
            Failed to tear down workspace
          </p>
          <p className="text-xs font-mono text-foreground-muted">{taskErrorMessage(taskStore)}</p>
        </div>
      </div>
    );
  }

  if (kind === 'missing') {
    return null;
  }

  return <ReadyTaskMainPanel />;
});

const SIDEBAR_COLLAPSED_SIZE = '0px';

const ReadyTaskMainPanel = observer(function ReadyTaskMainPanel() {
  const { taskView } = useProvisionedTask();
  const sidebarPanelRef = usePanelRef();

  useEffect(() => {
    if (taskView.isSidebarCollapsed) {
      sidebarPanelRef.current?.collapse();
    } else {
      sidebarPanelRef.current?.expand();
    }
  }, [taskView.isSidebarCollapsed, sidebarPanelRef]);

  return (
    <ResizablePanelGroup orientation="horizontal" id="task-sidebar-layout">
      <ResizablePanel id="task-main-area">
        <TaskMainColumn />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="task-sidebar"
        panelRef={sidebarPanelRef}
        defaultSize="25%"
        minSize="280px"
        maxSize="50%"
        collapsible
        collapsedSize={SIDEBAR_COLLAPSED_SIZE}
        onResize={() =>
          taskView.setSidebarCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false)
        }
      >
        <TaskSidebar />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

const TaskMainColumn = observer(function TaskMainColumn() {
  const { taskView } = useProvisionedTask();
  const bottomPanelRef = usePanelRef();
  const draggingRef = useRef(false);

  useEffect(() => {
    if (taskView.isTerminalDrawerOpen) {
      bottomPanelRef.current?.expand();
    } else {
      bottomPanelRef.current?.collapse();
    }
  }, [taskView.isTerminalDrawerOpen, bottomPanelRef]);

  return (
    <ResizablePanelGroup orientation="vertical" id="task-main-vertical">
      <ResizablePanel id="task-main-content" minSize="30%">
        <UnifiedMainContent />
      </ResizablePanel>
      <ResizableHandle
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!draggingRef.current) {
            draggingRef.current = true;
            panelDragStore.setDragging(true);
          }
        }}
        onPointerUp={() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            panelDragStore.setDragging(false);
          }
        }}
        onPointerCancel={() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            panelDragStore.setDragging(false);
          }
        }}
        className={taskView.isTerminalDrawerOpen ? 'flex' : 'hidden'}
      />
      <ResizablePanel
        id="task-terminal-drawer"
        panelRef={bottomPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="25%"
        minSize="15%"
        onResize={() => taskView.setTerminalDrawerOpen(!bottomPanelRef.current?.isCollapsed())}
      >
        <TerminalsPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

const UnifiedMainContent = observer(function UnifiedMainContent() {
  const { taskView } = useProvisionedTask();
  const { setEditorHost, triggerLayout } = useEditorContext();

  const renderer = taskView.activeRenderer;

  // Re-run Monaco layout whenever the Monaco slot becomes visible so the editor
  // fills the host after transitioning from hidden to flex.
  useEffect(() => {
    if (renderer === 'monaco') triggerLayout();
  }, [renderer, triggerLayout]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        {/*
         * Persistent Monaco host — always in the DOM, never inside an Activity.
         * CSS display controls visibility so Monaco is never measured at 0×0.
         * triggerLayout() is called above whenever this transitions to visible.
         */}
        <div
          ref={setEditorHost}
          className="absolute inset-0"
          style={{ display: renderer === 'monaco' ? 'flex' : 'none' }}
        />
        {/* SVG source toggle — floats over the Monaco host when editing an SVG file */}
        {renderer === 'monaco' && <SvgSourceToggleOverlay />}

        <Activity mode={renderer === 'markdown' ? 'visible' : 'hidden'}>
          <MarkdownEditorPanel />
        </Activity>
        <Activity mode={renderer === 'diff' ? 'visible' : 'hidden'}>
          <DiffView />
        </Activity>
        <Activity mode={renderer === 'agents' ? 'visible' : 'hidden'}>
          <ConversationsPanel />
        </Activity>
        <Activity mode={renderer === 'other-file' ? 'visible' : 'hidden'}>
          <EditorMainPanel />
        </Activity>
      </div>
    </div>
  );
});

/**
 * Shown over the Monaco host when the active tab is an SVG file in source mode.
 * Lets the user toggle back to the SVG preview renderer.
 */
const SvgSourceToggleOverlay = observer(function SvgSourceToggleOverlay() {
  const { taskView } = useProvisionedTask();
  const { tabManager } = taskView;
  const activeTab = tabManager.activeFileEntry;

  if (!activeTab || activeTab.renderer.kind !== 'svg-source') return null;

  return (
    <ToggleGroup
      value={['svg-source']}
      onValueChange={(value) => {
        if (value.includes('svg')) {
          tabManager.updateRenderer(activeTab.path, () => ({ kind: 'svg' }));
        }
      }}
      size="sm"
      className="absolute right-3 top-3 z-10"
    >
      <ToggleGroupItem value="svg" aria-label="View rendered">
        <Eye className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="svg-source" aria-label="Edit source">
        <Pencil className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
});
