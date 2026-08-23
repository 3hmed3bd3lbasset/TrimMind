import { container } from '../container.js';

export function generateSecureToken(prefix = 'VIP'): string {
  const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${randomHex}`;
}

export async function createBooking(payload: any, actor?: any, ipAddress?: string): Promise<any> {
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

  // Dispatch rich WhatsApp booking confirmation notification
  if (booking.customerPhone) {
    const startsAtDate = new Date(booking.startsAt || Date.now());
    const formattedDate = startsAtDate.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' });
    const formattedTime = startsAtDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const confirmationMsg = `🎉 *تم استلام طلب حجزك بنجاح في صالون TrimMind VIP!* 💈👑

يا هلا يا أستاذ *${booking.customerName || 'الفاضل'}* نورتنا! 🌟

🧾 *فاتورة وبيانات الحجز:*
• *رقم الحجز:* \`#${booking.id}\`
• *الخدمة:* ${booking.serviceName || 'خدمة VIP'}
• *الكابتن:* ${booking.barberName || 'حسب التوفر بالصالون'} ✂️
• *الميعاد:* ${formattedDate} الساعة ${formattedTime}
• *إجمالي الفاتورة:* ${booking.totalAtBooking || booking.servicePriceAtBooking || 150} جنيه
• *العربون المطلوب:* ${booking.bookingFeeAtBooking || 50} جنيه

💳 *بيانات تحويل وتأكيد العربون:*
• *InstaPay:* 01005437633
• *Vodafone Cash:* 01005437633

📸 *يرجى إرسال صورة إيصال التحويل هنا على الواتساب* ليتم اعتماد الحجز فوراً من الاستقبال!

📍 *رابط متابعة دورك المباشر في الطابور:*
https://trimmind.up.railway.app/track?q=${booking.id}

تنورنا وتطلع أحلى عريس يا باشا! ✨`;

    import('./whatsapp.service.js')
      .then((m) => m.sendWhatsAppText(booking.customerPhone, confirmationMsg))
      .catch((e) => console.error('Failed to send auto WhatsApp booking confirmation:', e.message));
  }

  return resObj;
}

export async function getBookingById(bookingId: string): Promise<any> {
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
    created_at: b.createdAt,
  };
}

export async function cancelBooking(bookingId: string, reason?: string, actor?: any, ipAddress?: string): Promise<{ success: boolean; bookingId: string }> {
  const success = await container.cancelBookingUseCase.execute(bookingId, reason, actor?.id);
  return { success, bookingId };
}
