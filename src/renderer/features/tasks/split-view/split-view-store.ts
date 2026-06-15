import { makeAutoObservable } from 'mobx';
// Resolved at call-site (not at module init); circular with app-state is safe.
import { appState } from '@renderer/lib/stores/app-state';

export interface SplitPaneRef {
  projectId: string;
  taskId: string;
}

/**
 * Extra task panes tiled beside the primary (routed) task in the main content
 * area. The primary pane is always the currently routed task — these are the
 * additional tasks shown alongside it for side-by-side comparison.
 *
 * Panes are SCOPED to the primary task they were opened beside: opening task B
 * beside task A binds B to A, so routing away to task C hides B (C has its own,
 * separate extras) and returning to A restores it. Without this scoping a pane
 * opened beside one task would stay glued to whatever task you switched to next.
 *
 * The current primary is read live from navigation, so add/replace/remove always
 * act on the task in view at call time. The routed task is never stored as an
 * extra; the `panes` getter de-dupes it out.
 *
 * Module singleton (not persisted): the tiling is an ephemeral comparison
 * workspace, cleared when the user is done.
 */
class SplitViewStore {
  /** Extra panes keyed by the primary (routed) task they belong to. */
  private byPrimary = new Map<string, SplitPaneRef[]>();

  constructor() {
    makeAutoObservable(this);
  }

  /** The routed task the extras hang off of, or undefined when off the task view. */
  private get primaryTaskId(): string | undefined {
    if (appState.navigation.currentViewId !== 'task') return undefined;
    const params = appState.navigation.viewParamsStore.task as { taskId?: string } | undefined;
    return params?.taskId;
  }

  /** Extras for the current primary task, de-duped against the primary itself. */
  get panes(): SplitPaneRef[] {
    const primary = this.primaryTaskId;
    if (!primary) return [];
    return (this.byPrimary.get(primary) ?? []).filter((pane) => pane.taskId !== primary);
  }

  get count(): number {
    return this.panes.length;
  }

  has(taskId: string): boolean {
    return this.panes.some((pane) => pane.taskId === taskId);
  }

  add(ref: SplitPaneRef): void {
    const primary = this.primaryTaskId;
    if (!primary || ref.taskId === primary) return;
    const list = this.byPrimary.get(primary) ?? [];
    if (list.some((pane) => pane.taskId === ref.taskId)) return;
    this.byPrimary.set(primary, [...list, ref]);
  }

  /** Replace the current primary's set in one shot (used by "tile all candidates"). */
  replace(refs: SplitPaneRef[]): void {
    const primary = this.primaryTaskId;
    if (!primary) return;
    const seen = new Set<string>();
    const list = refs.filter((ref) => {
      if (ref.taskId === primary || seen.has(ref.taskId)) return false;
      seen.add(ref.taskId);
      return true;
    });
    if (list.length === 0) this.byPrimary.delete(primary);
    else this.byPrimary.set(primary, list);
  }

  remove(taskId: string): void {
    const primary = this.primaryTaskId;
    if (!primary) return;
    const list = this.byPrimary.get(primary);
    if (!list) return;
    const next = list.filter((pane) => pane.taskId !== taskId);
    if (next.length === 0) this.byPrimary.delete(primary);
    else this.byPrimary.set(primary, next);
  }

  clear(): void {
    const primary = this.primaryTaskId;
    if (primary) this.byPrimary.delete(primary);
  }
}

export const splitViewStore = new SplitViewStore();
