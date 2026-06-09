import { observer } from 'mobx-react-lite';
import { asProvisioned, getTaskStore } from '@renderer/features/tasks/stores/task-selectors';
import {
  ProvisionedTaskProvider,
  TaskViewWrapper,
} from '@renderer/features/tasks/task-view-context';
import { TaskSidePane } from '@renderer/features/tasks/view/task-side-pane';
import { appState } from '@renderer/lib/stores/app-state';

/**
 * Whether the shell should render the right side pane column. True only when
 * a task is attached, provisioned, and actually holds a pinned entity — the
 * column collapses entirely otherwise.
 */
export function isSidePaneVisible(): boolean {
  const attachment = appState.sidePane.attachment;
  if (!attachment) return false;
  const provisioned = asProvisioned(getTaskStore(attachment.projectId, attachment.taskId));
  return provisioned?.taskView.tabManager.sidePaneTabId !== undefined && provisioned !== undefined;
}

/**
 * Shell-level host for the task side pane: a first-class workspace column.
 * Navigating the main area (other tasks, Runtime, MaaS, Settings, …) never
 * unmounts it — the pinned session/file keeps running.
 */
export const AppSidePane = observer(function AppSidePane() {
  const attachment = appState.sidePane.attachment;
  if (!attachment) return null;

  return (
    <TaskViewWrapper projectId={attachment.projectId} taskId={attachment.taskId}>
      <ProvisionedTaskProvider projectId={attachment.projectId} taskId={attachment.taskId}>
        <TaskSidePane />
      </ProvisionedTaskProvider>
    </TaskViewWrapper>
  );
});
