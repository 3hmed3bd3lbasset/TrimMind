export type BookingStatus =
  | 'draft'
  | 'custom_pricing_requested'
  | 'awaiting_payment'
  | 'payment_submitted'
  | 'pending_review'
  | 'confirmed'
  | 'customer_arrived'
  | 'in_service'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'no_show';

export type BookingType = 'normal' | 'vip';

export interface BookingItem {
  id: string;
  booking_id: string;
  product_id: string;
  name: string;
  price_at_booking: number;
  quantity: number;
}

export interface PaymentProof {
  id: string;
  booking_id: string;
  image_path: string;
  payment_method: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
  sender_phone: string;
  transferred_amount: number;
  status: 'pending_review' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
}

export class Booking {
  constructor(
    public readonly id: string,
    public readonly customerId: string | null,
    public customerName: string,
    public customerPhone: string,
    public readonly branchId: string,
    public barberId: string | null,
    public chairId: string | null,
    public readonly serviceId: string,
    public readonly additionalServiceIds: string[],
    public readonly bookingType: BookingType,
    public status: BookingStatus,
    public startsAt: string,
    public endsAt: string | null,
    public readonly bookingDate: string,
    public queueNumber: number,
    public readonly servicePriceAtBooking: number,
    public readonly bookingFeeAtBooking: number,
    public readonly discountAtBooking: number,
    public readonly itemsTotalAtBooking: number,
    public readonly totalAtBooking: number,
    public readonly secureToken: string,
    public notes: string | null = null,
    public readonly createdAt: string = new Date().toISOString(),
    public items: BookingItem[] = [],
    public paymentProof: PaymentProof | null = null,
    public serviceName?: string,
    public barberName?: string,
    public branchName?: string,
    public source: 'web' | 'whatsapp' = 'web',
    public aiBrief?: string,
    public confidenceScore: number = 90,
    public needsHumanAttention: boolean = false,
    public handoffExpiresAt?: string | null,
    public customLineItems: any[] = []
  ) {}

  public calculateRemaining(): number {
    const depositPaid = this.paymentProof?.transferred_amount ?? this.bookingFeeAtBooking;
    return Math.max(0, this.totalAtBooking - depositPaid);
  }

  public canBeCancelled(): boolean {
    return this.status !== 'completed' && this.status !== 'cancelled';
  }

  public isOverdueForNoShow(gracePeriodMinutes = 35): boolean {
    if (this.status !== 'confirmed' || !this.startsAt) return false;
    const startTime = new Date(this.startsAt).getTime();
    const now = Date.now();
    const diffMinutes = (now - startTime) / (1000 * 60);
    return diffMinutes >= gracePeriodMinutes;
  }
}
