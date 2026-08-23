import { IWebhookEventRepository } from '../../domain/repositories/IWebhookEventRepository.js';
import { query } from '../../config/database.js';

export class MySQLWebhookEventRepository implements IWebhookEventRepository {
  public async recordEventIfNew(id: string, source: string, eventType: string, payload?: any): Promise<boolean> {
    try {
      await query(
        'INSERT INTO webhook_events (id, source, event_type, payload, processed_at) VALUES (?, ?, ?, ?, NOW())',
        [id, source, eventType, payload ? JSON.stringify(payload) : null]
      );
      return true;
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
        return false;
      }
      throw err;
    }
  }
}
