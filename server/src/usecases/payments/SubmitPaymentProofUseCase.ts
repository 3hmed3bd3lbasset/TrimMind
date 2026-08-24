import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IPaymentProofRepository, PaymentProofData } from '../../domain/repositories/IPaymentProofRepository.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';

function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D+/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

export class SubmitPaymentProofUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly paymentProofRepo: IPaymentProofRepository,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(data: {
    bookingId: string;
    senderPhone: string;
    imagePath: string;
    paymentMethod?: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
    transferredAmount?: number;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    const cleanPhone = normalizePhone(data.senderPhone);
    const booking = await this.bookingRepo.findById(data.bookingId);

    if (!booking) {
      return {
        success: false,
        message: 'لم يتم العثور على الحجز المطلوب لإرفاق إثبات الدفع.',
      };
    }

    const bookingPhone = normalizePhone(booking.customerPhone);
    if (bookingPhone !== cleanPhone) {
      return {
        success: false,
        message: 'رقم الهاتف المسجل على هذا الحجز غير مطابق لرقم الواتساب الحالي. يرجى التأكد من رقم الحجز.',
      };
    }

    if (booking.status === 'confirmed' || booking.status === 'completed') {
      return {
        success: true,
        message: 'الحجز مؤكد بالفعل ومسدد مسبقاً بنجاح! 👑',
        data: { bookingId: booking.id, status: booking.status },
      };
    }

    if (booking.status === 'cancelled') {
      return {
        success: false,
        message: 'هذا الحجز ملغي مسبقاً، يرجى إنشاء طلب حجز جديد.',
      };
    }

    const proofData: PaymentProofData = {
      bookingId: booking.id,
      imagePath: data.imagePath,
      paymentMethod: data.paymentMethod || 'instapay',
      senderPhone: cleanPhone,
      transferredAmount: data.transferredAmount || Number(booking.bookingFeeAtBooking || 50),
      status: 'pending_review',
    };

    await this.paymentProofRepo.submit(proofData);

    // Notify Branch Staff in realtime
    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'PAYMENT_PROOF_SUBMITTED', {
      bookingId: booking.id,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      proof: proofData,
      timestamp: new Date().toISOString(),
    });
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { bookingId: booking.id, status: 'pending_review' });

    return {
      success: true,
      message: 'تم استلام وتوثيق إثبات الدفع بنجاح، وجارٍ اعتماده من موظف الاستقبال.',
      data: {
        bookingId: booking.id,
        status: 'pending_review',
        depositAmount: proofData.transferredAmount,
      },
    };
  }
}
