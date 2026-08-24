import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { IConversationSessionRepository } from '../../domain/repositories/IConversationSessionRepository.js';
import { ConversationSession } from '../../domain/entities/ConversationSession.entity.js';

export class MySQLConversationSessionRepository implements IConversationSessionRepository {
  private static processedMessageIds = new Set<string>();

  private mapRowToEntity(row: any): ConversationSession {
    let pendingEntities = null;
    if (row.pending_entities) {
      pendingEntities = typeof row.pending_entities === 'string'
        ? JSON.parse(row.pending_entities)
        : row.pending_entities;
    }

    return new ConversationSession({
      id: row.id,
      customerPhone: row.customer_phone,
      whatsappRemoteJid: row.whatsapp_remote_jid,
      channel: row.channel || 'whatsapp',
      state: row.state || 'IDLE',
      activeBookingId: row.active_booking_id,
      pendingEntities,
      lastIntent: row.last_intent,
      humanHandoffActive: Boolean(row.human_handoff_active),
      humanHandoffExpiresAt: row.human_handoff_expires_at ? new Date(row.human_handoff_expires_at).toISOString() : null,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : new Date().toISOString(),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    });
  }

  private tableEnsured = false;

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;
    this.tableEnsured = true;

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id VARCHAR(128) PRIMARY KEY,
          source VARCHAR(64) NOT NULL,
          event_type VARCHAR(64),
          payload JSON,
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch {}

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS conversation_sessions (
          id VARCHAR(64) PRIMARY KEY,
          customer_phone VARCHAR(20) NOT NULL,
          whatsapp_remote_jid VARCHAR(64) NULL,
          channel ENUM('whatsapp') DEFAULT 'whatsapp',
          state VARCHAR(40) NOT NULL DEFAULT 'IDLE',
          active_booking_id VARCHAR(64) NULL,
          pending_entities JSON NULL,
          last_intent VARCHAR(40) NULL,
          human_handoff_active TINYINT(1) DEFAULT 0,
          human_handoff_expires_at TIMESTAMP NULL,
          last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_cs_phone (customer_phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch {}

    try {
      await query('ALTER TABLE conversation_sessions ADD COLUMN whatsapp_remote_jid VARCHAR(64) NULL AFTER customer_phone');
    } catch {}

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS conversation_messages (
          id VARCHAR(64) PRIMARY KEY,
          session_id VARCHAR(64) NOT NULL,
          whatsapp_message_id VARCHAR(128) NULL,
          role ENUM('customer','assistant','system') NOT NULL,
          content TEXT NOT NULL,
          extracted_intent JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_cm_session (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch {}

    try {
      await query('ALTER TABLE conversation_messages ADD COLUMN whatsapp_message_id VARCHAR(128) NULL AFTER session_id');
    } catch {}
  }

  public async getOrCreate(customerPhone: string, remoteJid?: string): Promise<ConversationSession> {
    await this.ensureTable();
    const cleanPhone = customerPhone ? customerPhone.replace(/\D+/g, '') : '';
    
    // 1. Search by immutable remoteJid first (supports @lid, international, and standard JIDs)
    let rows: any[] = [];
    if (remoteJid) {
      try {
        rows = await query<any[]>(
          'SELECT * FROM conversation_sessions WHERE whatsapp_remote_jid = ? ORDER BY created_at DESC LIMIT 1',
          [remoteJid]
        );
      } catch {}
    }

    // 2. Fallback to clean phone search if not matched by remoteJid
    if ((!rows || rows.length === 0) && cleanPhone) {
      try {
        rows = await query<any[]>(
          'SELECT * FROM conversation_sessions WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 1',
          [cleanPhone]
        );
      } catch {}
    }

    if (rows && rows.length > 0) {
      // If remoteJid was missing in the existing session, backfill it now
      if (remoteJid && !rows[0].whatsapp_remote_jid) {
        await query(
          'UPDATE conversation_sessions SET whatsapp_remote_jid = ? WHERE id = ?',
          [remoteJid, rows[0].id]
        ).catch(() => {});
        rows[0].whatsapp_remote_jid = remoteJid;
      }
      return this.mapRowToEntity(rows[0]);
    }

    // 3. Create fresh persistent session
    const newId = `cs-${uuidv4()}`;
    const storedPhone = cleanPhone || (remoteJid ? remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '') : 'guest');
    try {
      await query(
        `INSERT INTO conversation_sessions 
         (id, customer_phone, whatsapp_remote_jid, channel, state, created_at, updated_at, last_message_at)
         VALUES (?, ?, ?, 'whatsapp', 'IDLE', NOW(), NOW(), NOW())`,
        [newId, storedPhone, remoteJid || null]
      );
    } catch {
      await query(
        `INSERT INTO conversation_sessions 
         (id, customer_phone, channel, state, created_at, updated_at, last_message_at)
         VALUES (?, ?, 'whatsapp', 'IDLE', NOW(), NOW(), NOW())`,
        [newId, storedPhone]
      );
    }

    const createdRows = await query<any[]>(
      'SELECT * FROM conversation_sessions WHERE id = ?',
      [newId]
    );

    return this.mapRowToEntity(createdRows[0]);
  }

  public async getByPhone(customerPhone: string): Promise<ConversationSession | null> {
    const cleanPhone = customerPhone.replace(/\D+/g, '');
    const rows = await query<any[]>(
      'SELECT * FROM conversation_sessions WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 1',
      [cleanPhone]
    );

    if (!rows || rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  public async getById(sessionId: string): Promise<ConversationSession | null> {
    const rows = await query<any[]>(
      'SELECT * FROM conversation_sessions WHERE id = ?',
      [sessionId]
    );

    if (!rows || rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  public async update(sessionId: string, updates: Partial<{
    state: string;
    activeBookingId: string | null;
    pendingEntities: Record<string, any> | null;
    lastIntent: string | null;
    humanHandoffActive: boolean;
    humanHandoffExpiresAt: string | null;
    lastMessageAt: string;
  }>): Promise<void> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    if (updates.state !== undefined) {
      setClauses.push('state = ?');
      params.push(updates.state);
    }
    if (updates.activeBookingId !== undefined) {
      setClauses.push('active_booking_id = ?');
      params.push(updates.activeBookingId);
    }
    if (updates.pendingEntities !== undefined) {
      setClauses.push('pending_entities = ?');
      params.push(updates.pendingEntities ? JSON.stringify(updates.pendingEntities) : null);
    }
    if (updates.lastIntent !== undefined) {
      setClauses.push('last_intent = ?');
      params.push(updates.lastIntent);
    }
    if (updates.humanHandoffActive !== undefined) {
      setClauses.push('human_handoff_active = ?');
      params.push(updates.humanHandoffActive ? 1 : 0);
    }
    if (updates.humanHandoffExpiresAt !== undefined) {
      setClauses.push('human_handoff_expires_at = ?');
      params.push(updates.humanHandoffExpiresAt ? new Date(updates.humanHandoffExpiresAt) : null);
    }
    if (updates.lastMessageAt !== undefined) {
      setClauses.push('last_message_at = ?');
      params.push(new Date(updates.lastMessageAt));
    }

    params.push(sessionId);
    await query(
      `UPDATE conversation_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  public async recordMessage(sessionId: string, message: {
    whatsappMessageId?: string;
    role: 'customer' | 'assistant' | 'system';
    content: string;
    extractedIntent?: any;
  }): Promise<{ isDuplicate: boolean; messageId: string }> {
    await this.ensureTable();
    const messageId = `cm-${uuidv4()}`;
    const intentJson = message.extractedIntent ? JSON.stringify(message.extractedIntent) : null;

    // 1. Idempotency Gate via in-memory Set & webhook_events DB
    if (message.whatsappMessageId) {
      if (MySQLConversationSessionRepository.processedMessageIds.has(message.whatsappMessageId)) {
        return { isDuplicate: true, messageId: message.whatsappMessageId };
      }
      MySQLConversationSessionRepository.processedMessageIds.add(message.whatsappMessageId);
      if (MySQLConversationSessionRepository.processedMessageIds.size > 10000) {
        const first = MySQLConversationSessionRepository.processedMessageIds.values().next().value;
        if (first) MySQLConversationSessionRepository.processedMessageIds.delete(first);
      }

      try {
        const existingEvent = await query<any[]>(
          'SELECT id FROM webhook_events WHERE id = ? LIMIT 1',
          [message.whatsappMessageId]
        );
        if (existingEvent && existingEvent.length > 0) {
          return { isDuplicate: true, messageId: message.whatsappMessageId };
        }

        // Record in webhook_events with PRIMARY KEY constraint
        await query(
          'INSERT INTO webhook_events (id, source, event_type, processed_at) VALUES (?, ?, ?, NOW())',
          [message.whatsappMessageId, 'whatsapp_chat', 'customer_message']
        );
      } catch (evtErr: any) {
        if (evtErr?.code === 'ER_DUP_ENTRY' || evtErr?.errno === 1062 || String(evtErr?.message || '').includes('Duplicate entry')) {
          return { isDuplicate: true, messageId: message.whatsappMessageId };
        }
      }
    }

    try {
      await query(
        `INSERT INTO conversation_messages 
         (id, session_id, whatsapp_message_id, role, content, extracted_intent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [messageId, sessionId, message.whatsappMessageId || null, message.role, message.content, intentJson]
      );

      await query(
        'UPDATE conversation_sessions SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
        [sessionId]
      ).catch(() => {});

      return { isDuplicate: false, messageId };
    } catch (err: any) {
      // Fallback insert without whatsapp_message_id column if table was from older migration
      try {
        await query(
          `INSERT INTO conversation_messages 
           (id, session_id, role, content, extracted_intent, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [messageId, sessionId, message.role, message.content, intentJson]
        );
        return { isDuplicate: false, messageId };
      } catch {}

      throw err;
    }
  }

  public async getRecentMessages(sessionId: string, limit = 20): Promise<Array<{
    id: string;
    whatsappMessageId?: string;
    role: 'customer' | 'assistant' | 'system';
    content: string;
    extractedIntent?: any;
    createdAt: string;
  }>> {
    await this.ensureTable();
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    try {
      const rows = await query<any[]>(
        `SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
        [sessionId]
      );

      if (!rows || rows.length === 0) return [];

      return rows.reverse().map((r) => ({
        id: r.id,
        whatsappMessageId: r.whatsapp_message_id || null,
        role: r.role,
        content: r.content,
        extractedIntent: r.extracted_intent ? (typeof r.extracted_intent === 'string' ? JSON.parse(r.extracted_intent) : r.extracted_intent) : null,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
