export interface IWebhookEventRepository {
  recordEventIfNew(id: string, source: string, eventType: string, payload?: any): Promise<boolean>;
}
