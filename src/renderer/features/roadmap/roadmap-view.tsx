import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { RoadmapView } from './components/RoadmapView';

export function RoadmapTitlebar() {
  return <Titlebar />;
}

export function RoadmapMainPanel() {
  return <RoadmapView />;
}

export const roadmapView = {
  TitlebarSlot: RoadmapTitlebar,
  MainPanel: RoadmapMainPanel,
};
