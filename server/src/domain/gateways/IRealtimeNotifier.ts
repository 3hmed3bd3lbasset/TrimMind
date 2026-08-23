export interface IRealtimeNotifier {
  broadcastToBranch(branchId: string, event: string, payload?: any): void;
  broadcastGlobal(event: string, payload?: any): void;
}
