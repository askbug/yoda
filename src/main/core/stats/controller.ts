import { createRPCController } from '@shared/ipc/rpc';
import { getTaskStats } from './getTaskStats';
import { getUsageOverview } from './getUsageOverview';

export const statsController = createRPCController({
  getUsageOverview,
  getTaskStats,
});
