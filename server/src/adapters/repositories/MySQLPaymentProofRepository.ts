import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { IPaymentProofRepository, PaymentProofData } from '../../domain/repositories/IPaymentProofRepository.js';

export class MySQLPaymentProofRepository implements IPaymentProofRepository {
  public async submit(data: PaymentProofData): Promise<void> {
    const id = data.id || `pp-${uuidv4()}`;
    const status = data.status || 'pending_review';

    await query(
      `INSERT INTO payment_proofs 
       (id, booking_id, image_path, payment_method, sender_phone, transferred_amount, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         image_path = VALUES(image_path),
         payment_method = VALUES(payment_method),
         sender_phone = VALUES(sender_phone),
         transferred_amount = VALUES(transferred_amount),
         status = VALUES(status),
         submitted_at = NOW()`,
      [
        id,
        data.bookingId,
        data.imagePath,
        data.paymentMethod || 'instapay',
        data.senderPhone,
        data.transferredAmount || 0,
        status,
      ]
    );

    // Also update booking status
    await query(
      `UPDATE bookings 
       SET status = 'pending_review',
           updated_at = NOW()
       WHERE id = ?`,
      [data.bookingId]
    );
  }

  public async findByBookingId(bookingId: string): Promise<PaymentProofData | null> {
    const rows = await query<any[]>(
      'SELECT * FROM payment_proofs WHERE booking_id = ? LIMIT 1',
      [bookingId]
    );

    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      bookingId: r.booking_id,
      imagePath: r.image_path,
      paymentMethod: r.payment_method,
      senderPhone: r.sender_phone,
      transferredAmount: Number(r.transferred_amount || 0),
      status: r.status,
      submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : undefined,
      reviewedBy: r.reviewed_by,
      rejectionReason: r.rejection_reason,
    };
  }

  public async updateStatus(
    bookingId: string,
    status: 'pending_review' | 'approved' | 'rejected',
    reviewerId?: string,
    rejectionReason?: string
  ): Promise<void> {
    await query(
      `UPDATE payment_proofs 
       SET status = ?,
           reviewed_by = ?,
           rejection_reason = ?,
           reviewed_at = NOW()
       WHERE booking_id = ?`,
      [status, reviewerId || null, rejectionReason || null, bookingId]
    );
  }
}
