import { observable, runInAction } from 'mobx';
import {
  parseTaskWindowTargetSearch,
  TASK_WINDOW_WARM_PARAM,
  type TaskWindowTarget,
} from '@shared/task-window';

function isWarmLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(TASK_WINDOW_WARM_PARAM) === '1';
}

const initialTarget: TaskWindowTarget | null =
  typeof window === 'undefined' ? null : parseTaskWindowTargetSearch(window.location.search);

/**
 * Reactive launch target. A cold task window starts with its target already set
 * from the URL. A warm (pre-booted) window starts null and gets a target later
 * via {@link assignTaskWindowTarget}. Observers re-render when it arrives.
 */
// `deep: false` keeps the target a plain object (not a MobX proxy) so it can be
// sent over IPC via structured clone; only the box reference needs reactivity.
const box = observable.box<TaskWindowTarget | null>(initialTarget, { deep: false });

/** True for a window launched in warm mode (boot shell, wait for a target). */
export const isWarmTaskWindow = isWarmLaunch();

/** Either a real task window (has/awaits a target) or a warm one parked empty. */
export const isTaskWindowLaunch = initialTarget !== null || isWarmTaskWindow;

export function getTaskWindowLaunchTarget(): TaskWindowTarget | null {
  return box.get();
}

export function assignTaskWindowTarget(target: TaskWindowTarget): void {
  runInAction(() => box.set(target));
}
