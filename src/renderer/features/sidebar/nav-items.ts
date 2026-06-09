/**
 * Canonical definition of the secondary navigation items rendered at the bottom
 * of the left sidebar. The order here is the default order; users can reorder
 * and hide individual items via the "Customize sidebar" panel. Both the sidebar
 * renderer and the customize panel derive from this single source of truth.
 */

export type SidebarNavItemKey =
  | 'maas'
  | 'agents'
  | 'agentManager'
  | 'skills'
  | 'automation'
  | 'mobile';

/** Default ordering — also the full set of customizable nav items. */
export const SIDEBAR_NAV_ITEM_KEYS: readonly SidebarNavItemKey[] = [
  'maas',
  'agents',
  'agentManager',
  'skills',
  'automation',
  'mobile',
] as const;

const NAV_ITEM_KEY_SET = new Set<string>(SIDEBAR_NAV_ITEM_KEYS);

export function isSidebarNavItemKey(value: unknown): value is SidebarNavItemKey {
  return typeof value === 'string' && NAV_ITEM_KEY_SET.has(value);
}

/** i18n key for each nav item's label, mirroring left-sidebar usage. */
export const SIDEBAR_NAV_ITEM_LABEL_I18N: Record<SidebarNavItemKey, string> = {
  maas: 'sidebar.maas',
  agents: 'sidebar.agents',
  agentManager: 'sidebar.agentManager',
  skills: 'sidebar.skills',
  automation: 'sidebar.automation',
  mobile: 'sidebar.mobile',
};
