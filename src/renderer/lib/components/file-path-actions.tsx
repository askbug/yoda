import { Copy, ExternalLink, FolderOpen, MoreHorizontal, TerminalSquare } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppById, type OpenInAppId } from '@shared/openInApps';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { toast } from '@renderer/lib/hooks/use-toast';
import { useOpenInApps } from '@renderer/lib/hooks/useOpenInApps';
import { rpc } from '@renderer/lib/ipc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { cn } from '@renderer/utils/utils';

/**
 * Context-free file actions for any UI that references a path on disk:
 * copy relative/absolute path, open / reveal in the OS file manager, and an
 * SSH-aware terminal fallback. Task-scoped surfaces (open-in-editor,
 * reveal-in-file-tree) compose on top of this — see
 * features/tasks/components/file-actions.tsx.
 */
export type FilePathTarget = {
  absolutePath: string;
  /** Path relative to the project/workspace root, when one applies. */
  relativePath?: string | null;
  kind?: 'file' | 'directory';
  /** Set for SSH projects: disables Finder actions, enables terminal open. */
  sshConnectionId?: string | null;
};

export function useFilePathActions(target: FilePathTarget) {
  const { t } = useTranslation();
  const isRemote = target.sshConnectionId != null;

  return {
    isRemote,
    copyAbsolutePath: () => void copyPath(target.absolutePath, t),
    copyRelativePath: target.relativePath
      ? () => void copyPath(target.relativePath as string, t)
      : null,
    openFile: isRemote
      ? () =>
          void openIn(
            {
              app: 'terminal',
              path: target.absolutePath,
              isRemote: true,
              sshConnectionId: target.sshConnectionId ?? null,
            },
            t
          )
      : () => void openIn({ app: 'finder', path: target.absolutePath }, t),
    revealFile: isRemote
      ? null
      : () => void openIn({ app: 'finder', path: target.absolutePath, reveal: true }, t),
  };
}

/** Apps that are file managers or terminals — everything else counts as an editor. */
const NON_EDITOR_APP_IDS: OpenInAppId[] = [
  'finder',
  'terminal',
  'warp',
  'iterm2',
  'ghostty',
  'kitty',
];

/**
 * Resolves the user's preferred external editor (openIn.default setting,
 * falling back to the first installed editor). Returns null when none is
 * installed or none supports the remote target.
 */
function useEditorApp(isRemote: boolean) {
  const { icons, labels, installedApps, loading } = useOpenInApps();
  const { value: openInSettings } = useAppSettingsKey('openIn');

  if (loading) return null;
  const candidates = installedApps.filter(
    (app) => !NON_EDITOR_APP_IDS.includes(app.id) && (!isRemote || app.supportsRemote)
  );
  if (candidates.length === 0) return null;

  const preferred = candidates.find((app) => app.id === openInSettings?.default) ?? candidates[0];
  return {
    id: preferred.id,
    label: labels[preferred.id] ?? preferred.label,
    icon: icons[preferred.id],
    invertInDark: getAppById(preferred.id)?.invertInDark === true,
  };
}

type MenuPrimitives = {
  Item: ComponentType<{
    onClick?: (event: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
  }>;
  Separator: ComponentType<Record<string, never>>;
};

/**
 * The base file-action menu items, rendered through injected menu primitives so
 * both DropdownMenu and ContextMenu surfaces share one implementation.
 */
export function FilePathMenuItems({
  target,
  components: { Item, Separator },
}: {
  target: FilePathTarget;
  components: MenuPrimitives;
}) {
  const { t } = useTranslation();
  const actions = useFilePathActions(target);
  const editorApp = useEditorApp(actions.isRemote);

  return (
    <>
      {editorApp ? (
        <Item
          className="whitespace-nowrap"
          onClick={(event) => {
            event.stopPropagation();
            void openIn(
              {
                app: editorApp.id,
                path: target.absolutePath,
                isRemote: actions.isRemote,
                sshConnectionId: target.sshConnectionId ?? null,
              },
              t
            );
          }}
        >
          {editorApp.icon ? (
            <img
              src={editorApp.icon}
              alt={editorApp.label}
              className={cn('size-4 rounded', editorApp.invertInDark && 'dark:invert')}
            />
          ) : (
            <ExternalLink className="size-4" />
          )}
          {t('fileActions.openInApp', { app: editorApp.label })}
        </Item>
      ) : null}
      <Item
        className="whitespace-nowrap"
        onClick={(event) => {
          event.stopPropagation();
          actions.openFile();
        }}
      >
        {actions.isRemote ? (
          <TerminalSquare className="size-4" />
        ) : (
          <ExternalLink className="size-4" />
        )}
        {actions.isRemote ? t('fileActions.openInTerminal') : t('fileActions.openFile')}
      </Item>
      {actions.revealFile ? (
        <Item
          className="whitespace-nowrap"
          onClick={(event) => {
            event.stopPropagation();
            actions.revealFile?.();
          }}
        >
          <FolderOpen className="size-4" />
          {t('fileActions.revealInFolder')}
        </Item>
      ) : null}
      <Separator />
      {actions.copyRelativePath ? (
        <Item
          className="whitespace-nowrap"
          onClick={(event) => {
            event.stopPropagation();
            actions.copyRelativePath?.();
          }}
        >
          <Copy className="size-4" />
          {t('fileActions.copyRelativePath')}
        </Item>
      ) : null}
      <Item
        className="whitespace-nowrap"
        onClick={(event) => {
          event.stopPropagation();
          actions.copyAbsolutePath();
        }}
      >
        <Copy className="size-4" />
        {t('fileActions.copyAbsolutePath')}
      </Item>
    </>
  );
}

/**
 * Dropdown trigger (ellipsis button) with the base file actions. Extra
 * context-specific items can be prepended via `children`; they render above the
 * base items, separated automatically.
 */
export function FilePathActionsDropdown({
  target,
  className,
  children,
}: {
  target: FilePathTarget;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex size-5 items-center justify-center rounded-sm text-foreground-passive transition-colors hover:bg-background-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border',
              className
            )}
            aria-label={t('fileActions.label')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {children ? (
          <>
            {children}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <FilePathMenuItems
          target={target}
          components={{ Item: DropdownMenuItem, Separator: DropdownMenuSeparator }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function copyPath(path: string, t: (key: string) => string): Promise<void> {
  try {
    const res = await rpc.app.clipboardWriteText(path);
    if (res?.success) {
      toast({ title: t('fileActions.pathCopied') });
      return;
    }
  } catch {
    // handled below
  }
  toast({ title: t('common.copyFailed'), variant: 'destructive' });
}

async function openIn(
  args: {
    app: OpenInAppId;
    path: string;
    reveal?: boolean;
    isRemote?: boolean;
    sshConnectionId?: string | null;
  },
  t: (key: string) => string
): Promise<void> {
  try {
    const res = await rpc.app.openIn(args);
    if (!res?.success) {
      toast({
        title: t('fileActions.openFailed'),
        description: res?.error,
        variant: 'destructive',
      });
    }
  } catch (error) {
    toast({
      title: t('fileActions.openFailed'),
      description: error instanceof Error ? error.message : String(error),
      variant: 'destructive',
    });
  }
}
