import { observer } from 'mobx-react-lite';
import {
  asMounted,
  getProjectStore,
  projectViewKind,
} from '@renderer/features/projects/stores/project-selectors';
import { OpenInMenu } from '@renderer/lib/components/titlebar/open-in-menu';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useParams } from '@renderer/lib/layout/navigation-provider';

/**
 * Project titlebar: the project identity lives in the sidebar and the scope's
 * Overview index tab — no breadcrumb here. Only the right-side controls remain.
 */
export const ProjectTitlebar = observer(function ProjectTitlebar() {
  const {
    params: { projectId },
  } = useParams('project');
  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);

  if (kind !== 'ready') {
    return <Titlebar />;
  }

  const mounted = asMounted(store);
  if (!mounted) return <Titlebar />;

  const isRemote = mounted.data.type === 'ssh';

  return (
    <Titlebar
      rightSlot={
        !isRemote ? (
          <div className="flex items-center gap-2 mr-2">
            <OpenInMenu
              path={mounted.data.path}
              isRemote={isRemote}
              sshConnectionId={null}
              className="h-7 bg-background"
            />
          </div>
        ) : undefined
      }
    />
  );
});
