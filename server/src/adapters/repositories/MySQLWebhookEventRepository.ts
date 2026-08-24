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

  public async record(data: { id: string; source: string; eventType: string; payload?: any }): Promise<void> {
    await query(
      `INSERT INTO webhook_events (id, source, event_type, payload, processed_at) 
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE processed_at = NOW(), payload = VALUES(payload)`,
      [data.id, data.source, data.eventType, data.payload ? JSON.stringify(data.payload) : null]
    );
  }

  public async find(id: string): Promise<{ id: string; source: string; eventType: string; payload: any } | null> {
    const rows = await query<any[]>('SELECT * FROM webhook_events WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      source: r.source,
      eventType: r.event_type,
      payload: r.payload ? (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) : null,
    };
  }
}
