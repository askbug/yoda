import { observer } from 'mobx-react-lite';
import { Activity } from 'react';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import { ContextPanel } from '../context-panel';
import { SidebarConversationsList } from '../conversations/sidebar-conversations-list';
import { ChangesPanel } from '../diff-view/changes-panel/changes-panel';
import { EditorFileTree } from '../editor/editor-file-tree';
import { RenamePanel } from '../rename-panel';
import { TaskPanel } from '../task-panel';

export const TaskSidebar = observer(function TaskSidebar() {
  const { taskView } = useProvisionedTask();
  const { isSidebarCollapsed, sidebarTab: activeTab } = taskView;
  return (
    <Activity mode={isSidebarCollapsed ? 'hidden' : 'visible'}>
      <div className="min-h-0 h-full overflow-hidden">
        <Activity mode={activeTab === 'task' ? 'visible' : 'hidden'}>
          <TaskPanel />
        </Activity>
        <Activity mode={activeTab === 'conversations' ? 'visible' : 'hidden'}>
          <SidebarConversationsList />
        </Activity>
        <Activity mode={activeTab === 'changes' ? 'visible' : 'hidden'}>
          <ChangesPanel />
        </Activity>
        <Activity mode={activeTab === 'files' ? 'visible' : 'hidden'}>
          <EditorFileTree />
        </Activity>
        <Activity mode={activeTab === 'context' ? 'visible' : 'hidden'}>
          <ContextPanel />
        </Activity>
        <Activity mode={activeTab === 'rename' ? 'visible' : 'hidden'}>
          <RenamePanel active={activeTab === 'rename'} />
        </Activity>
      </div>
    </Activity>
  );
});
