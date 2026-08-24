import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { IConversationSessionRepository } from '../../domain/repositories/IConversationSessionRepository.js';
import { ConversationSession } from '../../domain/entities/ConversationSession.entity.js';

export class MySQLConversationSessionRepository implements IConversationSessionRepository {
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

  public async getOrCreate(customerPhone: string, remoteJid?: string): Promise<ConversationSession> {
    const cleanPhone = customerPhone.replace(/\D+/g, '');
    const rows = await query<any[]>(
      'SELECT * FROM conversation_sessions WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 1',
      [cleanPhone]
    );

    if (rows && rows.length > 0) {
      return this.mapRowToEntity(rows[0]);
    }

    const newId = `cs-${uuidv4()}`;
    await query(
      `INSERT INTO conversation_sessions 
       (id, customer_phone, whatsapp_remote_jid, channel, state, created_at, updated_at, last_message_at)
       VALUES (?, ?, ?, 'whatsapp', 'IDLE', NOW(), NOW(), NOW())`,
      [newId, cleanPhone, remoteJid || null]
    );

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
    const messageId = `cm-${uuidv4()}`;
    const intentJson = message.extractedIntent ? JSON.stringify(message.extractedIntent) : null;

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
      );

      return { isDuplicate: false, messageId };
    } catch (err: any) {
      // Check for MySQL UNIQUE duplicate entry error (ER_DUP_ENTRY / 1062)
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062 || String(err?.message || '').includes('Duplicate entry')) {
        return { isDuplicate: true, messageId: message.whatsappMessageId || '' };
      }
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
    const rows = await query<any[]>(
      'SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
      [sessionId, limit]
    );

    if (!rows || rows.length === 0) return [];

    return rows.reverse().map((r) => ({
      id: r.id,
      whatsappMessageId: r.whatsapp_message_id,
      role: r.role,
      content: r.content,
      extractedIntent: r.extracted_intent ? (typeof r.extracted_intent === 'string' ? JSON.parse(r.extracted_intent) : r.extracted_intent) : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
}
