export type ConversationState =
  | 'IDLE'
  | 'NEW_CONTACT'
  | 'DISCOVERING_INTENT'
  | 'COLLECTING_INFORMATION'
  | 'CONFIRMING_REQUEST'
  | 'CHECKING_AVAILABILITY'
  | 'BOOKING_DRAFT'
  | 'AWAITING_CUSTOM_PRICING'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'QUEUE_TRACKING'
  | 'ARRIVAL'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'HUMAN_HANDOFF';

export interface ConversationSessionProps {
  id: string;
  customerPhone: string;
  whatsappRemoteJid?: string | null;
  channel: 'whatsapp';
  state: ConversationState | string;
  activeBookingId?: string | null;
  pendingEntities?: Record<string, any> | null;
  lastIntent?: string | null;
  humanHandoffActive: boolean;
  humanHandoffExpiresAt?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export class ConversationSession {
  public readonly id: string;
  public readonly customerPhone: string;
  public readonly whatsappRemoteJid?: string | null;
  public readonly channel: 'whatsapp';
  public state: ConversationState | string;
  public activeBookingId?: string | null;
  public pendingEntities?: Record<string, any> | null;
  public lastIntent?: string | null;
  public humanHandoffActive: boolean;
  public humanHandoffExpiresAt?: string | null;
  public lastMessageAt: string;
  public readonly createdAt: string;
  public updatedAt: string;

  constructor(props: ConversationSessionProps) {
    this.id = props.id;
    this.customerPhone = props.customerPhone;
    this.whatsappRemoteJid = props.whatsappRemoteJid;
    this.channel = props.channel;
    this.state = props.state;
    this.activeBookingId = props.activeBookingId;
    this.pendingEntities = props.pendingEntities;
    this.lastIntent = props.lastIntent;
    this.humanHandoffActive = props.humanHandoffActive;
    this.humanHandoffExpiresAt = props.humanHandoffExpiresAt;
    this.lastMessageAt = props.lastMessageAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
