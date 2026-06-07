import { LeftSidebar } from '@renderer/features/sidebar/left-sidebar';
import { CommandShortcutBinder } from '@renderer/lib/commands/command-shortcut-binder';
import { AppKeyboardShortcuts } from '@renderer/lib/components/app-keyboard-shortcuts';
import { ErrorBoundary } from '@renderer/lib/components/error-boundary';
import { MonacoKeyboardBridge } from '@renderer/lib/components/monaco-keyboard-bridge';
import { QuitAgentSessionsPrompt } from '@renderer/lib/components/quit-agent-sessions-prompt';
import { TmuxUnavailableNotifier } from '@renderer/lib/components/tmux-unavailable-notifier';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import {
  useWorkspaceSlots,
  useWorkspaceWrapParams,
} from '@renderer/lib/layout/navigation-provider';
import { WorkspaceContentLayout, WorkspaceLayout } from '@renderer/lib/layout/workspace-layout';
import { ModalRenderer } from '@renderer/lib/modal/modal-renderer';
import { Toaster } from '@renderer/lib/ui/toaster';

export function Workspace() {
  useTheme();
  const { WrapView } = useWorkspaceSlots();
  const { wrapParams } = useWorkspaceWrapParams();

  return (
    <>
      <AppKeyboardShortcuts />
      <CommandShortcutBinder />
      <MonacoKeyboardBridge />
      <TmuxUnavailableNotifier />
      <QuitAgentSessionsPrompt />
      <WorkspaceLayout
        leftSidebar={
          <ErrorBoundary variant="inline" componentName="LeftSidebar">
            <LeftSidebar />
          </ErrorBoundary>
        }
        mainContent={
          <WrapView {...wrapParams}>
            <ErrorBoundary variant="inline" componentName="ModalRenderer">
              <ModalRenderer />
            </ErrorBoundary>
            <ErrorBoundary variant="inline" componentName="WorkspaceView">
              <WorkspaceViewContent />
            </ErrorBoundary>
          </WrapView>
        }
      />
      <Toaster />
    </>
  );
}

function WorkspaceViewContent() {
  const { TitlebarSlot, MainPanel } = useWorkspaceSlots();
  return <WorkspaceContentLayout titlebarSlot={<TitlebarSlot />} mainPanel={<MainPanel />} />;
}
