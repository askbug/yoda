import { makeAutoObservable, toJS } from 'mobx';
import type { AppSidePaneSnapshot } from '@shared/view-state';
import type { Snapshottable } from './snapshottable';

export type AppSidePaneAttachment = {
  projectId: string;
  taskId: string;
};

/**
 * Shell-level right side pane state. The pane is a first-class workspace
 * column (sibling of the left sidebar and the main panel): navigating the
 * main area — other tasks, Runtime, MaaS, Settings — never unmounts it.
 *
 * It only records WHICH task's pinned entity is showing; the entity itself
 * (sidePaneTabId + entry) lives in that task's TabManagerStore, which stays
 * alive independent of navigation.
 */
export class AppSidePaneStore implements Snapshottable<AppSidePaneSnapshot> {
  attachment: AppSidePaneAttachment | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  show(projectId: string, taskId: string): void {
    this.attachment = { projectId, taskId };
  }

  clear(): void {
    this.attachment = null;
  }

  get snapshot(): AppSidePaneSnapshot {
    return { attachment: toJS(this.attachment) };
  }

  restoreSnapshot(snapshot: Partial<AppSidePaneSnapshot>): void {
    const attachment = snapshot.attachment;
    if (
      attachment &&
      typeof attachment.projectId === 'string' &&
      typeof attachment.taskId === 'string'
    ) {
      this.attachment = { projectId: attachment.projectId, taskId: attachment.taskId };
    }
  }
}
