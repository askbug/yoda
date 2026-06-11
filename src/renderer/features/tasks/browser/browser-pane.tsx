import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BrowserTabStore } from '@renderer/features/tasks/tabs/browser-tab-store';
import { rpc } from '@renderer/lib/ipc';
import { cn } from '@renderer/utils/utils';

/** Normalize address-bar input to a loadable URL (bare hosts get https://). */
function normalizeAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-muted',
        disabled
          ? 'opacity-40'
          : 'hover:bg-background-2 hover:text-foreground [-webkit-app-region:no-drag]'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * In-app browser pane for a sidebar-pinned browser tab. The webview owns
 * navigation; location/title changes are mirrored back into the store so the
 * chip label and the persisted snapshot follow the current page.
 */
export const BrowserPane = observer(function BrowserPane({ tab }: { tab: BrowserTabStore }) {
  const { t } = useTranslation();
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  // Initial URL only — re-rendering `src` on store changes would reload the page.
  const initialUrlRef = useRef(tab.url);
  const [draftAddress, setDraftAddress] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const handleNavigate = () => {
      tab.setLocation(webview.getURL());
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
    const handleTitle = (event: Event) => {
      const { title } = event as Event & { title?: string };
      if (title) tab.setTitle(title);
    };
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('page-title-updated', handleTitle);
    return () => {
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('page-title-updated', handleTitle);
    };
  }, [tab]);

  const submitAddress = () => {
    const url = draftAddress === null ? null : normalizeAddress(draftAddress);
    setDraftAddress(null);
    if (url && url !== tab.url) void webviewRef.current?.loadURL(url);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-background-secondary px-1.5">
        <ToolbarButton
          label={t('tasks.browser.back')}
          disabled={!canGoBack}
          onClick={() => webviewRef.current?.goBack()}
        >
          <ArrowLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label={t('tasks.browser.forward')}
          disabled={!canGoForward}
          onClick={() => webviewRef.current?.goForward()}
        >
          <ArrowRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label={t('tasks.browser.reload')}
          onClick={() => webviewRef.current?.reload()}
        >
          <RotateCw className="size-3.5" />
        </ToolbarButton>
        <input
          value={draftAddress ?? tab.url}
          spellCheck={false}
          aria-label={t('tasks.browser.address')}
          className="h-6 min-w-0 flex-1 rounded-md border border-transparent bg-background-2 px-2 font-mono text-xs text-foreground-muted outline-none focus:border-border focus:text-foreground [-webkit-app-region:no-drag]"
          onChange={(event) => setDraftAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitAddress();
            if (event.key === 'Escape') setDraftAddress(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setDraftAddress(null)}
        />
        <ToolbarButton
          label={t('tasks.browser.openExternal')}
          onClick={() => void rpc.app.openExternal(tab.url)}
        >
          <ExternalLink className="size-3.5" />
        </ToolbarButton>
      </div>
      <webview ref={webviewRef} src={initialUrlRef.current} className="min-h-0 w-full flex-1" />
    </div>
  );
});
