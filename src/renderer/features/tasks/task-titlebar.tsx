import { Cpu, FileDiff, FolderOpen, Info, Terminal } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { getTaskStore, taskViewKind } from '@renderer/features/tasks/stores/task-selectors';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { OpenInMenu } from '@renderer/lib/components/titlebar/open-in-menu';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { Separator } from '@renderer/lib/ui/separator';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { Toggle } from '@renderer/lib/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { DevServerPills } from './components/dev-server-pills';
import { type SidebarTab } from './types';

/**
 * Task titlebar: the task identity lives in the top-level tab strip (the
 * scope's Overview index tab) — no breadcrumb here. Only the right-side
 * controls remain (dev servers, open-in, terminal drawer, sidebar toggles).
 */
export const TaskTitlebar = observer(function TaskTitlebar() {
  const { projectId, taskId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);

  if (kind !== 'ready') {
    return <Titlebar />;
  }

  return <ActiveTaskTitlebar projectId={projectId} taskId={taskId} />;
});

const ActiveTaskTitlebar = observer(function ActiveTaskTitlebar({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const { t } = useTranslation();
  const provisionedTask = useProvisionedTask();
  const { taskView } = provisionedTask;
  const projectStore = asMounted(getProjectStore(projectId));
  const isRemoteProject = projectStore?.data.type === 'ssh';

  return (
    <Titlebar
      rightSlot={
        <div className="flex items-center gap-2">
          <DevServerPills projectId={projectId} taskId={taskId} />
          {!isRemoteProject && (
            <OpenInMenu path={provisionedTask.path} className="h-7 bg-background" borderless />
          )}
          <Separator orientation="vertical" className="h-5 self-center!" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  pressed={taskView.isTerminalDrawerOpen}
                  className="border-none"
                  onPressedChange={() =>
                    taskView.setTerminalDrawerOpen(!taskView.isTerminalDrawerOpen)
                  }
                >
                  <Terminal className="size-3.5" />
                </Toggle>
              }
            />
            <TooltipContent>
              {t('tasks.toggleTerminal')} <ShortcutHint settingsKey="toggleTerminalDrawer" />
            </TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-5 self-center!" />
          <ToggleGroup
            value={taskView.isSidebarCollapsed ? [] : [titlebarTabValue(taskView.sidebarTab)]}
            onValueChange={([tab]) => {
              if (!tab) {
                taskView.setSidebarCollapsed(true);
                return;
              }
              if (!isTitlebarTab(tab)) return;
              taskView.setSidebarTab(sidebarTabForTitlebar(tab));
              taskView.setSidebarCollapsed(false);
            }}
            size="icon-sm"
            className="border-none"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    size="icon-sm"
                    value="session"
                    aria-label={t('tasks.sessionPanel.title')}
                  >
                    <Info className="size-3.5" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>{t('tasks.sessionPanel.title')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    size="icon-sm"
                    value="harness"
                    aria-label={t('tasks.sessionPanel.harness')}
                  >
                    <Cpu className="size-3.5" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>{t('tasks.sessionPanel.harness')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem size="icon-sm" value="changes" aria-label={t('tasks.changes')}>
                    <FileDiff className="size-3.5" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>{t('tasks.changes')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem size="icon-sm" value="files" aria-label={t('tasks.files')}>
                    <FolderOpen className="size-3.5" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>{t('tasks.files')}</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </div>
      }
    />
  );
});

/** The icons the titlebar exposes after merging the session-family tabs. */
type TitlebarTab = 'session' | 'harness' | 'changes' | 'files';

function isTitlebarTab(value: string): value is TitlebarTab {
  return value === 'session' || value === 'harness' || value === 'changes' || value === 'files';
}

/** Which titlebar toggle is active for the current sidebar tab. */
function titlebarTabValue(tab: SidebarTab): TitlebarTab {
  if (tab === 'changes' || tab === 'files') return tab;
  if (tab === 'context' || tab === 'hooks') return 'harness';
  return 'session';
}

/** The canonical sidebar tab a titlebar toggle activates. */
function sidebarTabForTitlebar(tab: TitlebarTab): SidebarTab {
  return tab === 'harness' ? 'context' : tab;
}
