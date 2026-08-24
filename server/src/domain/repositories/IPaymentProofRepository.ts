export interface PaymentProofData {
  id?: string;
  bookingId: string;
  imagePath: string;
  paymentMethod: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
  senderPhone: string;
  transferredAmount: number;
  status?: 'pending_review' | 'approved' | 'rejected';
  submittedAt?: string;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
}

export interface IPaymentProofRepository {
  submit(data: PaymentProofData): Promise<void>;
  findByBookingId(bookingId: string): Promise<PaymentProofData | null>;
  updateStatus(
    bookingId: string,
    status: 'pending_review' | 'approved' | 'rejected',
    reviewerId?: string,
    rejectionReason?: string
  ): Promise<void>;
}
