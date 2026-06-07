import { makeAutoObservable } from 'mobx';
import type { TaskSidebarViewSnapshot, TaskViewSnapshot } from '@shared/view-state';
import { type SidebarTab } from '@renderer/features/tasks/types';
import { rpc } from '@renderer/lib/ipc';
import { viewStateCache } from '@renderer/lib/stores/view-state-cache';

export const TASK_SIDEBAR_VIEW_STATE_KEY = 'task-sidebar';

const DEFAULT_SIDEBAR_TAB: SidebarTab = 'conversations';
const DEFAULT_SIDEBAR_COLLAPSED = true;
const DEFAULT_CONTEXT_PANEL_OPEN_SECTION_IDS = [
  'llm-context',
  'session-prompts',
  'injected-context',
];

type LegacyTaskSidebarSnapshot = Pick<TaskViewSnapshot, 'sidebarTab' | 'isSidebarCollapsed'>;

function isSidebarTab(value: unknown): value is SidebarTab {
  return (
    value === 'task' ||
    value === 'conversations' ||
    value === 'changes' ||
    value === 'files' ||
    value === 'context' ||
    value === 'rename'
  );
}

function hasSidebarSnapshotValue(
  snapshot: TaskSidebarViewSnapshot | LegacyTaskSidebarSnapshot | null
): boolean {
  return isSidebarTab(snapshot?.sidebarTab) || typeof snapshot?.isSidebarCollapsed === 'boolean';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasContextPanelSnapshotValue(snapshot: TaskSidebarViewSnapshot | null): boolean {
  return isStringArray(snapshot?.contextPanelOpenSectionIds);
}

function resolveSidebarTab(
  sharedSnapshot: TaskSidebarViewSnapshot | null,
  legacySnapshot: LegacyTaskSidebarSnapshot | null
): SidebarTab {
  if (isSidebarTab(sharedSnapshot?.sidebarTab)) return sharedSnapshot.sidebarTab;
  if (isSidebarTab(legacySnapshot?.sidebarTab)) return legacySnapshot.sidebarTab;
  return DEFAULT_SIDEBAR_TAB;
}

function resolveSidebarCollapsed(
  sharedSnapshot: TaskSidebarViewSnapshot | null,
  legacySnapshot: LegacyTaskSidebarSnapshot | null
): boolean {
  if (typeof sharedSnapshot?.isSidebarCollapsed === 'boolean') {
    return sharedSnapshot.isSidebarCollapsed;
  }
  if (typeof legacySnapshot?.isSidebarCollapsed === 'boolean') {
    return legacySnapshot.isSidebarCollapsed;
  }
  return DEFAULT_SIDEBAR_COLLAPSED;
}

function normalizeOpenSectionIds(value: string[]): string[] {
  return Array.from(new Set(value));
}

function resolveContextPanelOpenSectionIds(
  sharedSnapshot: TaskSidebarViewSnapshot | null
): string[] {
  if (isStringArray(sharedSnapshot?.contextPanelOpenSectionIds)) {
    return normalizeOpenSectionIds(sharedSnapshot.contextPanelOpenSectionIds);
  }
  return [...DEFAULT_CONTEXT_PANEL_OPEN_SECTION_IDS];
}

export class TaskSidebarPreferenceStore {
  sidebarTab: SidebarTab = DEFAULT_SIDEBAR_TAB;
  isSidebarCollapsed: boolean = DEFAULT_SIDEBAR_COLLAPSED;
  contextPanelOpenSectionIds: string[] = [...DEFAULT_CONTEXT_PANEL_OPEN_SECTION_IDS];
  private isHydrated: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  get snapshot(): TaskSidebarViewSnapshot {
    return {
      sidebarTab: this.sidebarTab,
      isSidebarCollapsed: this.isSidebarCollapsed,
      contextPanelOpenSectionIds: [...this.contextPanelOpenSectionIds],
    };
  }

  hydrate(
    sharedSnapshot: TaskSidebarViewSnapshot | null,
    legacySnapshot: LegacyTaskSidebarSnapshot | null
  ): void {
    if (this.isHydrated) return;

    this.sidebarTab = resolveSidebarTab(sharedSnapshot, legacySnapshot);
    this.isSidebarCollapsed = resolveSidebarCollapsed(sharedSnapshot, legacySnapshot);
    this.contextPanelOpenSectionIds = resolveContextPanelOpenSectionIds(sharedSnapshot);
    this.isHydrated = true;

    viewStateCache.set(TASK_SIDEBAR_VIEW_STATE_KEY, this.snapshot);

    if (
      (!hasSidebarSnapshotValue(sharedSnapshot) && hasSidebarSnapshotValue(legacySnapshot)) ||
      !hasContextPanelSnapshotValue(sharedSnapshot)
    ) {
      this.persist();
    }
  }

  setSidebarTab(tab: SidebarTab): void {
    if (this.sidebarTab === tab) return;
    this.sidebarTab = tab;
    this.persist();
  }

  setSidebarCollapsed(collapsed: boolean): void {
    if (this.isSidebarCollapsed === collapsed) return;
    this.isSidebarCollapsed = collapsed;
    this.persist();
  }

  setContextPanelOpenSectionIds(sectionIds: string[]): void {
    const next = normalizeOpenSectionIds(sectionIds);
    if (arraysEqual(this.contextPanelOpenSectionIds, next)) return;
    this.contextPanelOpenSectionIds = next;
    this.persist();
  }

  setContextPanelSectionOpen(sectionId: string, open: boolean): void {
    const sectionIds = new Set(this.contextPanelOpenSectionIds);
    if (open) {
      sectionIds.add(sectionId);
    } else {
      sectionIds.delete(sectionId);
    }
    this.setContextPanelOpenSectionIds([...sectionIds]);
  }

  private persist(): void {
    const snapshot = this.snapshot;
    viewStateCache.set(TASK_SIDEBAR_VIEW_STATE_KEY, snapshot);
    void rpc.viewState.save(TASK_SIDEBAR_VIEW_STATE_KEY, snapshot);
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export const taskSidebarPreferenceStore = new TaskSidebarPreferenceStore();
