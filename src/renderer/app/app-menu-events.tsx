import { useEffect } from 'react';
import {
  deepLinkOpenChannel,
  menuOpenSettingsChannel,
  notificationFocusTaskChannel,
} from '@shared/events/appEvents';
import { events, rpc } from '@renderer/lib/ipc';
import { useNavigate, useWorkspaceSlots } from '@renderer/lib/layout/navigation-provider';
import { log } from '@renderer/utils/logger';
import { openTaskTarget } from './open-task-target';

export function AppMenuEvents({ onOpenSettings }: { onOpenSettings?: () => boolean | void }) {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();

  useEffect(() => {
    return events.on(menuOpenSettingsChannel, () => {
      const shouldOpen = onOpenSettings?.() ?? true;
      if (shouldOpen === false) return;
      if (currentView === 'settings') return;

      navigate('settings');
    });
  }, [navigate, onOpenSettings, currentView]);

  useEffect(() => {
    const disposers = new Set<() => void>();

    const unlistenNotifications = events.on(notificationFocusTaskChannel, (target) =>
      openTaskTarget(target, navigate, disposers)
    );
    const unlistenDeepLinks = events.on(deepLinkOpenChannel, (target) =>
      openTaskTarget(target, navigate, disposers)
    );

    void rpc.app
      .consumePendingDeepLinks()
      .then((targets) => {
        for (const target of targets) openTaskTarget(target, navigate, disposers);
      })
      .catch((error: unknown) => {
        log.warn('AppMenuEvents: failed to consume pending deep links', { error });
      });

    return () => {
      unlistenNotifications();
      unlistenDeepLinks();
      disposers.forEach((dispose) => dispose());
      disposers.clear();
    };
  }, [navigate]);

  return null;
}
