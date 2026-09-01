import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { query } from '../../config/database.js';

export interface ApplyCustomPricingPayload {
  bookingId: string;
  items: Array<{ name: string; price: number }>;
  subtotal: number;
  discount?: number;
  totalPrice: number;
  depositRequired: number;
  remainingBalance: number;
  barberId?: string;
  barberName?: string;
  serviceName?: string;
  actorName?: string;
}

export class ApplyCustomPricingUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly realtimeNotifier: IRealtimeNotifier,
    private readonly notificationGateway: INotificationGateway
  ) {}

  public async execute(payload: ApplyCustomPricingPayload): Promise<{ success: boolean; message: string; booking: any }> {
    const booking = await this.bookingRepo.findById(payload.bookingId);
    if (!booking) {
      throw new Error('لم يتم العثور على الحجز المطلوب للتسعير المخصص');
    }

    const itemsJson = JSON.stringify(payload.items || []);
    const finalServiceName = payload.serviceName || (payload.items.length > 0 ? payload.items.map((i) => i.name).join(' + ') : 'باقة خدمات مخصصة');
    const finalDiscount = Number(payload.discount || 0);
    const finalTotal = Math.max(0, Number(payload.totalPrice));
    const finalDeposit = Number(payload.depositRequired || 50);

    const updatedBooking = await this.bookingRepo.updateCustomPricing({
      bookingId: payload.bookingId,
      serviceName: finalServiceName,
      totalAmount: finalTotal,
      depositRequired: finalDeposit,
      discount: finalDiscount,
      customLineItems: payload.items || [],
      barberId: payload.barberId,
      barberName: payload.barberName,
    });

    // Broadcast Realtime Events
    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'CUSTOM_PRICING_APPLIED', {
      bookingId: payload.bookingId,
      totalPrice: finalTotal,
      depositRequired: finalDeposit,
      actorName: payload.actorName,
    });
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', {
      bookingId: payload.bookingId,
      status: 'confirmed',
    });

    // Send WhatsApp Invoice to Customer
    if (booking.customerPhone) {
      const itemsListStr = payload.items.map((i) => `• ${i.name}: ${i.price} ج.م`).join('\n');
      const waMessage = `🎉 *تم تسعير واعتماد باقتك المخصصة في صالون TrimMind VIP!* 💈👑\n\n` +
        `يا هلا بأستاذنا الفاضل *${booking.customerName || 'الكريم'}* 🌟\n\n` +
        `🧾 *تفاصيل الفاتورة المعتمدة من الاستقبال:*\n` +
        `${itemsListStr}\n\n` +
        `💵 *الإجمالي:* ${finalTotal} ج.م\n` +
        (finalDiscount > 0 ? `🎁 *الخصم المطبق:* ${finalDiscount} ج.م\n` : '') +
        `💳 *العربون المطلوب لتأكيد الحجز:* ${finalDeposit} ج.م\n` +
        `💰 *المتبقي للدفع بالصالون:* ${Math.max(0, finalTotal - finalDeposit)} ج.م\n\n` +
        `📲 *طرق تحويل العربون:*\n` +
        `• InstaPay: \`01005437633\`\n` +
        `• Vodafone Cash: \`01005437633\`\n\n` +
        `📸 *يرجى إرسال صورة إيصال التحويل هنا في المحادثة* ليتم اعتماد حجزك فوراً وتثبيت موعدك!\n\n` +
        `📍 *رابط متابعة الحجز والدور المباشر:*\n` +
        `https://trimmind.up.railway.app/track?q=${booking.id}`;

      this.notificationGateway.sendWhatsApp(booking.customerPhone, waMessage).catch(() => {});
    }

    return {
      success: true,
      message: 'تم تسعير الحجز واعتماده وإرسال الفاتورة للعميل على الواتساب بنجاح! 🚀',
      booking: updatedBooking,
    };
  }
}
