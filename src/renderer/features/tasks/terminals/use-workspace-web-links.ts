import { useMemo } from 'react';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import type { TerminalWebLinkOptions } from '@renderer/lib/pty/terminal-web-links';

/**
 * Web-link options for workspace-bound PTY panes: clicking a smart URL link
 * opens it in the task sidebar's in-app browser so the pane stays visible.
 * The right-click link menu keeps the system-browser escape hatch.
 */
export function useWorkspaceWebLinks(): TerminalWebLinkOptions {
  const provisionedTask = useProvisionedTask();

  return useMemo<TerminalWebLinkOptions>(
    () => ({
      onOpen: (url) => {
        provisionedTask.taskView.tabManager.openUrlInSidebar(url);
        provisionedTask.taskView.setSidebarCollapsed(false);
      },
    }),
    [provisionedTask.taskView]
  );
}
