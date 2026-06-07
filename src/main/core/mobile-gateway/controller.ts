import { createRPCController } from '@shared/ipc/rpc';
import { mobileGatewayService } from './mobile-gateway-service';

export const mobileGatewayController = createRPCController({
  getConnectionInfo: () => mobileGatewayService.getConnectionInfo(),
});
