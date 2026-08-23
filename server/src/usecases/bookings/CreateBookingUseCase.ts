import { IBookingRepository, CreateBookingData } from '../../domain/repositories/IBookingRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { Booking } from '../../domain/entities/Booking.entity.js';

export class CreateBookingUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly notificationGateway: INotificationGateway,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(data: CreateBookingData, actorId?: string): Promise<Booking> {
    const booking = await this.bookingRepo.createWithTransaction(data, actorId);

    // Realtime Notifications
    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'BOOKING_CREATED', booking);
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { type: 'BOOKING_CREATED', bookingId: booking.id });

    // WhatsApp Confirmation Message
    if (booking.customerPhone) {
      const clientName = booking.customerName || 'عزيزنا العميل';
      const srvName = booking.serviceName || 'خدمة الصالون';
      const barbName = booking.barberName || 'كابتن الصالون';
      const totalAmountVal = booking.totalAtBooking;
      const depositVal = booking.paymentProof?.transferred_amount ?? booking.bookingFeeAtBooking;
      const remainingVal = booking.calculateRemaining();

      const msg = `أهلاً بك يا ${clientName} في صالون TrimMind (الحداد VIP)! 💈✨\n\n` +
        `تم استلام طلب حجزك المبدئي وإيصال التحويل بنجاح! 📋\n` +
        `🎫 رقم الحجز: #${booking.id}\n` +
        `✂️ الخدمة: ${srvName}\n` +
        `💈 الكابتن: ${barbName}\n` +
        `📅 الموعد: ${booking.startsAt ? booking.startsAt.replace('T', ' ').substring(0, 16) : 'موعد اليوم'}\n` +
        `🔢 رقم الدور: رقم #${booking.queueNumber} في طابور اليوم\n\n` +
        `💵 تفاصيل الفاتورة والحساب:\n` +
        `• إجمالي الفاتورة: ${totalAmountVal} ج.م\n` +
        `• العربون المسدد: ${depositVal} ج.م ✓\n` +
        `• المتبقي للدفع بالصالون: ${remainingVal} ج.م\n\n` +
        `⏳ جاري مراجعة واعتماد إيصال التحويل من موظف الاستقبال في غضون 5 إلى 10 دقائق كحد أقصى.\n` +
        `بمجرد الموافقة سيصلك إشعار فوري هنا على الواتساب بتأكيد الحجز وموقعك المباشر في الطابور! 👑\n\n` +
        `📍 رابط تتبع حجزك:\n` +
        `https://trimmind.up.railway.app/track?q=${booking.id}`;

      this.notificationGateway.sendWhatsApp(booking.customerPhone, msg).catch(() => {});
    }

    return booking;
  }
}
