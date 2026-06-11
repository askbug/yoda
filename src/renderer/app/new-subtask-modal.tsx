import { useTranslation } from 'react-i18next';
import { HomeComposer } from '@renderer/app/home-view';
import { getTaskStore, taskDisplayName } from '@renderer/features/tasks/stores/task-selectors';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { DialogContentArea, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';

/**
 * Hosts the home page's new-task composer in a modal to create a subtask:
 * the project is locked to the parent's, the new task branches off the
 * parent's branch and is linked via parentTaskId. The composer navigates to
 * the new task on submit; the modal just closes behind it.
 */
export function NewSubtaskModal({
  onClose,
  projectId,
  parentTaskId,
}: BaseModalProps & {
  projectId: string;
  parentTaskId: string;
}) {
  const { t } = useTranslation();
  const parentName = taskDisplayName(getTaskStore(projectId, parentTaskId)) ?? parentTaskId;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('home.newSubtaskInTaskTitle', { name: parentName })}</DialogTitle>
      </DialogHeader>
      <DialogContentArea>
        <HomeComposer
          submitTarget={{ kind: 'new-task', parentTask: { projectId, taskId: parentTaskId } }}
          onSubmitted={onClose}
        />
      </DialogContentArea>
    </>
  );
}
