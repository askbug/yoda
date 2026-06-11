import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { UsageView } from './components/UsageView';

export function UsageTitlebar() {
  return <Titlebar />;
}

export function UsageMainPanel() {
  return <UsageView />;
}

export const usageView = {
  TitlebarSlot: UsageTitlebar,
  MainPanel: UsageMainPanel,
};
