import { ConversationSession } from '../entities/ConversationSession.entity.js';

export interface IConversationSessionRepository {
  getOrCreate(customerPhone: string, remoteJid?: string): Promise<ConversationSession>;
  getByPhone(customerPhone: string): Promise<ConversationSession | null>;
  getById(sessionId: string): Promise<ConversationSession | null>;
  update(sessionId: string, updates: Partial<{
    state: string;
    activeBookingId: string | null;
    pendingEntities: Record<string, any> | null;
    lastIntent: string | null;
    humanHandoffActive: boolean;
    humanHandoffExpiresAt: string | null;
    lastMessageAt: string;
  }>): Promise<void>;
  recordMessage(sessionId: string, message: {
    whatsappMessageId?: string;
    role: 'customer' | 'assistant' | 'system';
    content: string;
    extractedIntent?: any;
  }): Promise<{ isDuplicate: boolean; messageId: string }>;
  getRecentMessages(sessionId: string, limit?: number): Promise<Array<{
    id: string;
    whatsappMessageId?: string;
    role: 'customer' | 'assistant' | 'system';
    content: string;
    extractedIntent?: any;
    createdAt: string;
  }>>;
}
