import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { broadcastToBranch, broadcastGlobal } from '../../socket/realtime.js';

export class SocketRealtimeNotifier implements IRealtimeNotifier {
  public broadcastToBranch(branchId: string, event: string, payload?: any): void {
    try {
      broadcastToBranch(branchId, event, payload);
    } catch {}
  }

  public broadcastGlobal(event: string, payload?: any): void {
    try {
      broadcastGlobal(event, payload);
    } catch {}
  }
}
