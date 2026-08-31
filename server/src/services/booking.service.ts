import { container } from '../container.js';
import { query } from '../config/database.js';

export function generateSecureToken(prefix = 'VIP'): string {
  const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${randomHex}`;
}

export async function createBooking(payload: any, actor?: any, ipAddress?: string): Promise<any> {
  // Check weekly off days from MySQL settings
  if (payload.startsAt && payload.source !== 'walk_in') {
    try {
      const settingsRows = await query<any[]>('SELECT setting_value FROM settings WHERE setting_key = "general" LIMIT 1');
      if (settingsRows && settingsRows.length > 0) {
        const val = typeof settingsRows[0].setting_value === 'string' ? JSON.parse(settingsRows[0].setting_value) : settingsRows[0].setting_value;
        const offDays: number[] = Array.isArray(val?.weekly_off_days) ? val.weekly_off_days : [1];
        const bookingDate = new Date(payload.startsAt);
        const dayOfWeek = bookingDate.getDay();
        if (offDays.includes(dayOfWeek)) {
          const daysMap: Record<number, string> = { 0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
          throw new Error(`عفواً، يوم (${daysMap[dayOfWeek] || 'المحدد'}) إجازة رسمية للصالون، يرجى اختيار موعد في أيام العمل.`);
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('إجازة رسمية')) {
        throw err;
      }
    }
  }

  const booking = await container.createBookingUseCase.execute({
    id: payload.id || payload.bookingId,
    branchId: payload.branchId || 'branch-elhdad',
    barberId: payload.barberId || null,
    chairId: payload.chairId || null,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    serviceId: payload.serviceId || 'srv-haircut',
    serviceName: payload.serviceName,
    servicePrice: payload.servicePrice,
    additionalServiceIds: payload.additionalServiceIds || [],
    selectedProducts: payload.selectedProducts || [],
    bookingType: payload.bookingType || 'normal',
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    notes: payload.notes,
    paymentProof: payload.paymentProof,
    totalAmount: payload.totalAmount,
    source: payload.source || 'web',
    aiBrief: payload.aiBrief,
    confidenceScore: payload.confidenceScore,
    needsHumanAttention: payload.needsHumanAttention,
    customLineItems: payload.customLineItems,
  }, actor?.id);

  const resObj = {
    ...booking,
    id: booking.id,
    bookingId: booking.id,
    booking_id: booking.id,
    customer_id: booking.customerId,
    customer_name: booking.customerName,
    customerName: booking.customerName,
    customer_phone: booking.customerPhone,
    customerPhone: booking.customerPhone,
    branch_id: booking.branchId,
    branchId: booking.branchId,
    barber_id: booking.barberId,
    barberId: booking.barberId,
    chair_id: booking.chairId,
    chairId: booking.chairId,
    service_id: booking.serviceId,
    serviceId: booking.serviceId,
    booking_type: booking.bookingType,
    bookingType: booking.bookingType,
    queue_number: booking.queueNumber,
    queueNumber: booking.queueNumber,
    starts_at: booking.startsAt,
    startsAt: booking.startsAt,
    ends_at: booking.endsAt,
    endsAt: booking.endsAt,
    total_at_booking: booking.totalAtBooking,
    totalAmount: booking.totalAtBooking,
    booking_fee_at_booking: booking.bookingFeeAtBooking,
    depositRequired: booking.bookingFeeAtBooking,
    service_price_at_booking: booking.servicePriceAtBooking,
    items_total_at_booking: booking.itemsTotalAtBooking,
    secure_token: booking.secureToken,
    secureToken: booking.secureToken,
    service_name: booking.serviceName,
    serviceName: booking.serviceName,
    barber_name: booking.barberName,
    barberName: booking.barberName,
    branch_name: booking.branchName,
    branchName: booking.branchName,
    payment_proof: booking.paymentProof,
    paymentProof: booking.paymentProof,
    created_at: booking.createdAt,
  };

  return resObj;
}

export async function getBookingById(bookingId: string): Promise<any> {
  try {
    const b = await container.bookingRepo.findById(bookingId);
    if (!b) return null;
    return {
    ...b,
    id: b.id,
    bookingId: b.id,
    booking_id: b.id,
    customer_id: b.customerId,
    customer_name: b.customerName,
    customerName: b.customerName,
    customer_phone: b.customerPhone,
    customerPhone: b.customerPhone,
    branch_id: b.branchId,
    branchId: b.branchId,
    barber_id: b.barberId,
    barberId: b.barberId,
    chair_id: b.chairId,
    chairId: b.chairId,
    service_id: b.serviceId,
    serviceId: b.serviceId,
    booking_type: b.bookingType,
    bookingType: b.bookingType,
    queue_number: b.queueNumber,
    queueNumber: b.queueNumber,
    starts_at: b.startsAt,
    startsAt: b.startsAt,
    ends_at: b.endsAt,
    endsAt: b.endsAt,
    total_at_booking: b.totalAtBooking,
    totalAmount: b.totalAtBooking,
    booking_fee_at_booking: b.paymentProof?.transferred_amount ?? b.bookingFeeAtBooking,
    depositRequired: b.paymentProof?.transferred_amount ?? b.bookingFeeAtBooking,
    service_price_at_booking: b.servicePriceAtBooking,
    items_total_at_booking: b.itemsTotalAtBooking,
    secure_token: b.secureToken,
    secureToken: b.secureToken,
    service_name: b.serviceName,
    serviceName: b.serviceName,
    barber_name: b.barberName,
    barberName: b.barberName,
    branch_name: b.branchName,
    branchName: b.branchName,
    payment_proof: b.paymentProof,
    paymentProof: b.paymentProof,
    source: b.source || 'web',
    ai_brief: b.aiBrief || undefined,
    confidence_score: b.confidenceScore || 90,
    needs_human_attention: Boolean(b.needsHumanAttention),
    handoff_expires_at: b.handoffExpiresAt || null,
    custom_line_items: b.customLineItems || [],
    created_at: b.createdAt,
  };
  } catch (err) {
    console.warn('getBookingById error ignored:', err);
    return null;
  }
}

export async function cancelBooking(bookingId: string, reason?: string, actor?: any, ipAddress?: string): Promise<{ success: boolean; bookingId: string }> {
  const success = await container.cancelBookingUseCase.execute(bookingId, reason, actor?.id);
  return { success, bookingId };
}
