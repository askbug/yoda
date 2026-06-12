import { action, observable } from 'mobx';
import { useState, type DragEvent, type HTMLAttributes } from 'react';
import type { TaskWindowTabTarget } from '@shared/task-window';
import type { SidebarTabGroup } from '@renderer/features/tasks/types';
import type { AppTabEntry } from '@renderer/lib/stores/app-tabs-store';

/**
 * Cross-area tab dragging (top strip ↔ task sidebar strip ↔ shell side pane),
 * built on native HTML5 drag-and-drop: the strips live in unrelated React
 * subtrees, so a shared module-level payload replaces a common DnD context.
 * Each strip declares what it accepts and performs the move with the same
 * store methods its context menu uses.
 */
export type TabDragPayload =
  | {
      kind: 'task-entity';
      from: 'strip' | 'taskSidebar' | 'shellPane';
      projectId: string;
      taskId: string;
      /** Always a non-overview target — the overview tab never moves. */
      target: TaskWindowTabTarget;
      /** Top-level tab entry when dragged from the strip (closed after the move). */
      appTab?: AppTabEntry;
      /** Internal TabManagerStore id when dragged from the task sidebar or shell pane. */
      tabId?: string;
      /** Shell pane pin id when dragged from there. */
      pinId?: string;
    }
  /** Any non-entity top-level tab — copy-pinned into the shell pane on drop. */
  | { kind: 'view'; from: 'strip'; appTab: AppTabEntry }
  /** A copy-semantics shell pin (view / overview) — reorders within the pane only. */
  | { kind: 'shell-pin'; pinId: string }
  /** A task-sidebar feature card — reorders within the sidebar strip only. */
  | { kind: 'sidebar-group'; group: SidebarTabGroup };

const TAB_DRAG_MIME = 'application/x-yoda-tab';

/** Observable so strips can react (e.g. lift the window drag region) while a drag runs. */
const currentDrag = observable.box<TabDragPayload | null>(null, { deep: false });
const setCurrentDrag = action((payload: TabDragPayload | null) => currentDrag.set(payload));

/** The payload of the in-flight tab drag, if any. Observable. */
export function activeTabDrag(): TabDragPayload | null {
  return currentDrag.get();
}

export type TabDragSourceProps = Pick<
  HTMLAttributes<HTMLElement>,
  'draggable' | 'onDragStart' | 'onDragEnd'
>;

/** Drag-source DOM props for a chip/tab. The payload is built lazily at drag start. */
export function tabDragSource(payload: () => TabDragPayload): TabDragSourceProps {
  return {
    draggable: true,
    onDragStart: (event) => {
      const data = payload();
      setCurrentDrag(data);
      event.dataTransfer.effectAllowed = 'move';
      // Marks the native session as ours; drop logic reads the module state.
      event.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(data));
    },
    onDragEnd: () => setCurrentDrag(null),
  };
}

/**
 * Drop-zone DOM props for a strip container. `canDrop` gates the dragover
 * highlight and the drop; `onDrop` performs the move (use `tabDropIndex` for
 * the insertion position among the container's marked chips).
 */
export function useTabDropZone({
  canDrop,
  onDrop,
}: {
  canDrop: (payload: TabDragPayload) => boolean;
  onDrop: (payload: TabDragPayload, event: DragEvent<HTMLDivElement>) => void;
}): {
  isOver: boolean;
  dropProps: Pick<HTMLAttributes<HTMLDivElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>;
} {
  const [isOver, setIsOver] = useState(false);
  return {
    isOver,
    dropProps: {
      onDragOver: (event) => {
        const payload = activeTabDrag();
        if (!payload || !canDrop(payload)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setIsOver(true);
      },
      onDragLeave: (event) => {
        // dragleave fires when crossing into children — only real exits count.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsOver(false);
      },
      onDrop: (event) => {
        setIsOver(false);
        const payload = activeTabDrag();
        if (!payload || !canDrop(payload)) return;
        event.preventDefault();
        setCurrentDrag(null);
        onDrop(payload, event);
      },
    },
  };
}

/**
 * Raw insertion index at the pointer among the container's chips carrying
 * `data-tab-drop-marker={marker}` — computed BEFORE any removal, so reorder
 * methods must adjust when the dragged item precedes the index.
 */
export function tabDropIndex(event: DragEvent<HTMLElement>, marker: string): number {
  const chips = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(`[data-tab-drop-marker="${marker}"]`)
  );
  for (let i = 0; i < chips.length; i++) {
    const rect = chips[i].getBoundingClientRect();
    if (event.clientX < rect.left + rect.width / 2) return i;
  }
  return chips.length;
}
