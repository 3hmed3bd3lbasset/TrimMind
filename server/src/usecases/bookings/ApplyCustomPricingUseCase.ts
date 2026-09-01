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
    let booking = await this.bookingRepo.findById(payload.bookingId);
    if (!booking) {
      const { getPersistentDb } = await import('../../services/persistentStorage.service.js');
      const pMatch = (getPersistentDb().bookings || []).find(
        (b: any) => b.id === payload.bookingId || b.bookingId === payload.bookingId
      );
      if (pMatch) {
        booking = pMatch as any;
      }
    }

    if (!booking) {
      throw new Error('لم يتم العثور على الحجز المطلوب للتسعير المخصص');
    }

    const itemsJson = JSON.stringify(payload.items || []);
    const finalServiceName = payload.serviceName || (payload.items.length > 0 ? payload.items.map((i) => i.name).join(' + ') : 'باقة خدمات مخصصة');
    const finalDiscount = Number(payload.discount || 0);
    const finalTotal = Math.max(0, Number(payload.totalPrice));
    const finalDeposit = Number(payload.depositRequired || 50);

    let updatedBooking: any = null;
    try {
      updatedBooking = await this.bookingRepo.updateCustomPricing({
        bookingId: payload.bookingId,
        serviceName: finalServiceName,
        totalAmount: finalTotal,
        depositRequired: finalDeposit,
        discount: finalDiscount,
        customLineItems: payload.items || [],
        barberId: payload.barberId,
        barberName: payload.barberName,
      });
    } catch {
      updatedBooking = {
        ...booking,
        id: payload.bookingId,
        bookingId: payload.bookingId,
        service_name: finalServiceName,
        total_at_booking: finalTotal,
        discount_at_booking: finalDiscount,
        booking_fee_at_booking: finalDeposit,
        custom_line_items: payload.items || [],
        status: 'confirmed',
      };
    }

    // Sync to Persistent Storage
    const { addOrUpdatePersistentBooking } = await import('../../services/persistentStorage.service.js');
    addOrUpdatePersistentBooking({
      ...(booking || {}),
      id: payload.bookingId,
      bookingId: payload.bookingId,
      service_name: finalServiceName,
      serviceName: finalServiceName,
      total_at_booking: finalTotal,
      totalAmount: finalTotal,
      service_price_at_booking: finalTotal,
      booking_fee_at_booking: finalDeposit,
      discount_at_booking: finalDiscount,
      custom_line_items: payload.items || [],
      barber_id: payload.barberId || (booking as any)?.barberId || (booking as any)?.barber_id,
      barber_name: payload.barberName || (booking as any)?.barberName || (booking as any)?.barber_name,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
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

    // Send Clean WhatsApp Invoice to Customer
    const phoneToNotify = (booking as any).customer_phone || (booking as any).customerPhone;
    if (phoneToNotify) {
      const { sendCustomPricingApprovedWhatsApp } = await import('../../services/whatsapp.service.js');
      sendCustomPricingApprovedWhatsApp(
        {
          ...(booking || {}),
          id: payload.bookingId,
          bookingId: payload.bookingId,
          customer_name: (booking as any).customer_name || (booking as any).customerName,
          customer_phone: phoneToNotify,
          barber_name: payload.barberName || (booking as any).barber_name || (booking as any).barberName,
          starts_at: (booking as any).starts_at || (booking as any).startsAt,
          queue_number: (booking as any).queue_number || (booking as any).queueNumber,
        },
        payload.items,
        finalTotal,
        finalDeposit,
        finalDiscount
      ).catch((err) => console.warn('Custom pricing WA error:', err));
    }

    return {
      success: true,
      message: 'تم تسعير الحجز واعتماده وإرسال الفاتورة للعميل على الواتساب بنجاح',
      booking: updatedBooking,
    };
  }
}
