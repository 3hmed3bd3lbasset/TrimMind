import { Booking, BookingStatus } from '../entities/Booking.entity.js';

export interface CreateBookingData {
  id?: string;
  branchId: string;
  barberId?: string | null;
  chairId?: string | null;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName?: string;
  servicePrice?: number;
  additionalServiceIds?: string[];
  selectedProducts?: Array<{ productId: string; quantity: number }>;
  bookingType: 'normal' | 'vip';
  startsAt?: string;
  endsAt?: string | null;
  notes?: string | null;
  paymentProof?: {
    imagePath?: string;
    paymentMethod?: string;
    senderPhone?: string;
    amount?: number;
  };
  totalAmount?: number;
  source?: 'web' | 'whatsapp';
  aiBrief?: string;
  confidenceScore?: number;
  needsHumanAttention?: boolean;
  customLineItems?: any[];
}

export interface IBookingRepository {
  createWithTransaction(data: CreateBookingData, actorId?: string): Promise<Booking>;
  findById(bookingId: string): Promise<Booking | null>;
  findBySecureToken(token: string): Promise<Booking | null>;
  search(query: string, branchId?: string): Promise<Booking[]>;
  updateStatus(bookingId: string, status: BookingStatus, note?: string, actorId?: string): Promise<Booking>;
  reviewPaymentProof(bookingId: string, status: 'approved' | 'rejected', reason?: string, reviewerId?: string): Promise<Booking>;
  findOverdueConfirmed(graceMinutes: number): Promise<Booking[]>;
  markNoShow(bookingId: string): Promise<void>;
  cancel(bookingId: string, reason?: string, actorId?: string): Promise<void>;
}
