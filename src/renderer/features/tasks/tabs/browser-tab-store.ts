import { action, makeObservable, observable } from 'mobx';

/**
 * Observable store for a single in-app browser tab (sidebar-only).
 * Created when a smart web link is clicked in a workspace terminal; the
 * webview navigates internally and reports its location back here so the
 * persisted snapshot restores the latest page.
 */
export class BrowserTabStore {
  readonly tabId: string;
  readonly kind = 'browser' as const;

  /** Current page URL — follows webview navigation. */
  url: string;
  /** Page title from the webview; empty until the first page loads. */
  title: string;
  /** Browser tabs are never previews; the field exists for TabEntry uniformity. */
  isPreview: boolean;

  constructor(url: string, tabId?: string) {
    this.tabId = tabId ?? crypto.randomUUID();
    this.url = url;
    this.title = '';
    this.isPreview = false;

    makeObservable(this, {
      url: observable,
      title: observable,
      isPreview: observable,
      setLocation: action,
      setTitle: action,
      pin: action,
    });
  }

  setLocation(url: string): void {
    this.url = url;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  pin(): void {
    this.isPreview = false;
  }
}
