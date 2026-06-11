import { eq } from 'drizzle-orm';
import { BrowserWindow, Notification } from 'electron';
import { isAttentionNotification, type AgentEvent } from '@shared/events/agentEvents';
import { notificationFocusTaskChannel } from '@shared/events/appEvents';
import { getRuntime, type RuntimeId } from '@shared/runtime-registry';
import { getMainWindow } from '@main/app/window';
import { appSettingsService } from '@main/core/settings/settings-service';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';

function getNotificationBody(event: AgentEvent): string | null {
  if (event.type === 'stop') return 'Your agent has finished working';
  if (event.type === 'awaiting-input') return 'Your agent is waiting for input';
  if (event.type === 'notification') {
    const { notificationType } = event.payload;
    if (!notificationType) return null;
    if (isAttentionNotification(notificationType)) {
      return 'Your agent is waiting for input';
    }
  }
  return null;
}

async function getTaskName(taskId: string | undefined): Promise<string | null> {
  if (!taskId) return null;
  const [row] = await db
    .select({ name: tasks.name })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row?.name ?? null;
}

export async function maybeShowNotification(event: AgentEvent, appFocused: boolean): Promise<void> {
  try {
    const { enabled, osNotifications } = await appSettingsService.get('notifications');
    if (!enabled || !osNotifications || appFocused || !Notification.isSupported()) return;

    const body = getNotificationBody(event);
    if (!body) return;

    const runtimeName = getRuntime(event.runtimeId as RuntimeId)?.name ?? event.runtimeId;
    const taskName = await getTaskName(event.taskId);
    const title = taskName ? `${runtimeName} — ${taskName}` : runtimeName;

    const notification = new Notification({ title, body, silent: true });

    notification.on('click', () => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (event.taskId) {
        events.emit(notificationFocusTaskChannel, {
          projectId: event.projectId,
          taskId: event.taskId,
          conversationId: event.conversationId,
        });
      }
    });

    notification.show();
  } catch (error) {
    log.warn('notification: failed to show OS notification', { error: String(error) });
  }
}

export function isAppFocused(): boolean {
  const windows = BrowserWindow.getAllWindows();
  return windows.some((w) => !w.isDestroyed() && w.isFocused());
}
