export interface IWebhookEventRepository {
  recordEventIfNew(id: string, source: string, eventType: string, payload?: any): Promise<boolean>;
  record(data: { id: string; source: string; eventType: string; payload?: any }): Promise<void>;
  find(id: string): Promise<{ id: string; source: string; eventType: string; payload: any } | null>;
}

