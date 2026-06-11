import { BrowserWindow, screen } from 'electron';
import type { uIOhook as UiohookInstance } from 'uiohook-napi';
import { taskWindowDockHoverChannel, taskWindowDockRequestChannel } from '@shared/events/appEvents';
import { isTaskWindowTarget, type TaskWindowTarget } from '@shared/task-window';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { getMainWindow } from './window';

/**
 * A rectangle, in the main window's CSS/content coordinate space, that a
 * detached task window can be dropped onto to dock its tab back into the strip.
 * The renderer reports this whenever the active task's tab strip mounts, scrolls,
 * or resizes; `null` clears it (no strip visible).
 */
export type TaskStripDropZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DockEntry = {
  win: BrowserWindow;
  target: TaskWindowTarget;
  sourceWindowId: number;
  dispose: () => void;
};

const entries = new Map<number, DockEntry>();
let dropZone: TaskStripDropZone | null = null;
let lastHovering = false;

// uiohook is a process-global hook, so it is reference-counted across all
// currently-dragging windows and only runs while a drag is in flight. The
// native binary is loaded lazily and guarded: if it can't load (ABI mismatch)
// or can't start (missing macOS Input Monitoring permission), we fall back to
// the `moved` window event.
type Uiohook = typeof UiohookInstance;
let uiohook: Uiohook | null = null;
let hookListeners = 0;
let hookRunning = false;
let hookFailed = false;

function loadUiohook(): Uiohook | null {
  if (uiohook || hookFailed) return uiohook;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    uiohook = (require('uiohook-napi') as { uIOhook: Uiohook }).uIOhook;
  } catch (error) {
    hookFailed = true;
    log.warn('TaskWindowDock: failed to load uiohook-napi native module', { error });
  }
  return uiohook;
}

export function setTaskStripDropZone(zone: TaskStripDropZone | null): void {
  dropZone = zone;
}

/**
 * Begin tracking a detached task window so that dragging it over the main
 * window's tab strip docks the tab back. `sourceWindowId` is the renderer's own
 * window id, used to address the close/return handshake.
 */
export function registerTaskWindowDock(sourceWindowId: number, target: TaskWindowTarget): void {
  if (!isTaskWindowTarget(target)) throw new Error('Invalid task window target');
  const win = BrowserWindow.fromId(sourceWindowId);
  if (!win || win.isDestroyed()) return;

  unregisterTaskWindowDock(sourceWindowId);

  // A real OS window drag gives no "mouse released" event, so we can't tell a
  // hover-pause from a true drop with window events alone. The fix: while the
  // window is being dragged, start a global input hook and commit the dock only
  // on a real hardware `mouseup`. `move` only updates the hover highlight.
  let onMouseUp: (() => void) | null = null;
  let watching = false;

  const commitDrop = () => {
    watching = false;
    stopWatchingMouse();
    if (isOverDropZone()) dockBack(sourceWindowId, target);
    else setHover(false);
  };

  const stopWatchingMouse = () => {
    if (onMouseUp) {
      releaseGlobalMouseHook(onMouseUp);
      onMouseUp = null;
    }
  };

  const startWatchingMouse = () => {
    if (watching) return;
    watching = true;
    const listener = commitDrop;
    // Only keep the listener if the hook actually started; otherwise the `moved`
    // fallback (gated on hookFailed) takes over.
    if (acquireGlobalMouseHook(listener)) onMouseUp = listener;
  };

  const onMove = () => {
    // The first move of a drag begins watching for the release.
    startWatchingMouse();
    updateHover();
  };
  // macOS fallback: `moved` fires once a drag settles. Only used when the global
  // hook is unavailable (e.g. missing Input Monitoring permission).
  const onMoved = () => {
    if (!hookFailed) return;
    watching = false;
    commitDrop();
  };

  win.on('move', onMove);
  win.on('moved', onMoved);

  const dispose = () => {
    stopWatchingMouse();
    win.off('move', onMove);
    win.off('moved', onMoved);
  };
  win.once('closed', () => {
    dispose();
    entries.delete(sourceWindowId);
  });

  entries.set(sourceWindowId, { win, target, sourceWindowId, dispose });
}

export function unregisterTaskWindowDock(sourceWindowId: number): void {
  const entry = entries.get(sourceWindowId);
  if (!entry) return;
  entry.dispose();
  entries.delete(sourceWindowId);
  if (lastHovering) setHover(false);
}

/** @returns true if the global hook is active; false means use the fallback. */
function acquireGlobalMouseHook(listener: () => void): boolean {
  const hook = loadUiohook();
  if (!hook) return false;
  hook.on('mouseup', listener);
  hookListeners += 1;
  if (hookRunning) return true;
  try {
    hook.start();
    hookRunning = true;
    return true;
  } catch (error) {
    hook.off('mouseup', listener);
    hookListeners = Math.max(0, hookListeners - 1);
    hookFailed = true;
    log.warn('TaskWindowDock: global mouse hook unavailable, falling back to moved event', {
      error,
    });
    return false;
  }
}

function releaseGlobalMouseHook(listener: () => void): void {
  const hook = uiohook;
  if (!hook) return;
  hook.off('mouseup', listener);
  hookListeners = Math.max(0, hookListeners - 1);
  if (hookListeners === 0 && hookRunning) {
    try {
      hook.stop();
    } catch (error) {
      log.warn('TaskWindowDock: failed to stop global mouse hook', { error });
    }
    hookRunning = false;
  }
}

function updateHover(): void {
  setHover(isOverDropZone());
}

function setHover(hovering: boolean): void {
  if (hovering === lastHovering) return;
  lastHovering = hovering;
  events.emit(taskWindowDockHoverChannel, { hovering });
}

/** Whether the OS cursor currently sits inside the main window's strip drop zone. */
function isOverDropZone(): boolean {
  if (!dropZone) return false;
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return false;
  if (!mainWindow.isVisible()) return false;

  const cursor = screen.getCursorScreenPoint();
  const content = mainWindow.getContentBounds();
  // Drop zone is reported in content-relative CSS pixels; translate to screen.
  const left = content.x + dropZone.x;
  const top = content.y + dropZone.y;
  return (
    cursor.x >= left &&
    cursor.x <= left + dropZone.width &&
    cursor.y >= top &&
    cursor.y <= top + dropZone.height
  );
}

function dockBack(sourceWindowId: number, target: TaskWindowTarget): void {
  setHover(false);
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    // The main window re-opens the tab and acks; the ack closes this window.
    events.emit(taskWindowDockRequestChannel, { sourceWindowId, target });
    mainWindow.focus();
  } catch (error) {
    log.warn('TaskWindowDock: failed to dock window back', { sourceWindowId, error });
  }
}
