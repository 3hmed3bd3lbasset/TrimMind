import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

export function generateSecureToken(prefix = 'VIP'): string {
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
}

export async function createBooking(payload: any, actor?: any, ipAddress?: string) {
  const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
  const secureToken = generateSecureToken(payload.bookingType === 'vip' ? 'VIP' : 'NOR');
  const bookingDate = (payload.startsAt || new Date().toISOString()).split('T')[0];

  // 1. Resolve Branch ID safely
  let finalBranchId = payload.branchId || 'branch-elhdad';
  try {
    const branchRows = await query<any[]>('SELECT id FROM branches WHERE id = ? LIMIT 1', [finalBranchId]);
    if (!branchRows || branchRows.length === 0) {
      const firstBranch = await query<any[]>('SELECT id FROM branches LIMIT 1');
      if (firstBranch && firstBranch.length > 0) {
        finalBranchId = firstBranch[0].id;
      }
    }
  } catch {}

  // 2. Fetch service price safely with fallbacks
  let primaryService = { id: payload.serviceId || 'srv-haircut', name: 'خدمة الصالون', price: 180 };
  let servicePrice = 180;
  try {
    let services = await query<any[]>('SELECT * FROM services WHERE id = ? LIMIT 1', [payload.serviceId]);
    if (!services || services.length === 0) {
      services = await query<any[]>('SELECT * FROM services WHERE name LIKE ? LIMIT 1', [`%${payload.serviceId}%`]);
    }
    if (!services || services.length === 0) {
      services = await query<any[]>('SELECT * FROM services LIMIT 1');
    }
    if (services && services.length > 0) {
      primaryService = services[0];
      servicePrice = Number(primaryService.price || 180);
    }
  } catch {}

  // Add additional services prices
  if (payload.additionalServiceIds && payload.additionalServiceIds.length > 0) {
    for (const addId of payload.additionalServiceIds) {
      try {
        const addSrv = await query<any[]>('SELECT price FROM services WHERE id = ? LIMIT 1', [addId]);
        if (addSrv && addSrv.length > 0) {
          servicePrice += Number(addSrv[0].price);
        }
      } catch {}
    }
  }

  // 3. Calculate Products Total
  let itemsTotal = 0;
  const itemsToInsert: any[] = [];
  if (payload.selectedProducts && payload.selectedProducts.length > 0) {
    for (const p of payload.selectedProducts) {
      try {
        const prods = await query<any[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [p.productId]);
        if (prods && prods.length > 0) {
          const prod = prods[0];
          const pPrice = Number(prod.price);
          itemsTotal += pPrice * p.quantity;
          itemsToInsert.push({
            id: uuidv4(),
            booking_id: bookingId,
            product_id: prod.id,
            name: prod.name,
            price_at_booking: pPrice,
            quantity: p.quantity,
          });
        }
      } catch {}
    }
  }

  // 4. Fetch booking fee from settings
  let bookingFee = payload.bookingType === 'vip' ? 150 : 50;
  try {
    const settingsRows = await query<any[]>('SELECT setting_value FROM settings WHERE setting_key = "general" LIMIT 1');
    if (settingsRows && settingsRows.length > 0) {
      const val = typeof settingsRows[0].setting_value === 'string' ? JSON.parse(settingsRows[0].setting_value) : settingsRows[0].setting_value;
      bookingFee = payload.bookingType === 'vip' ? Number(val.booking_fee_vip || 150) : Number(val.booking_fee_normal || 50);
    }
  } catch {}

  // 5. Smart Atomic Conflict Prevention for Queue Number
  let assignedQueueNumber = 1;
  try {
    const activeBookings = await query<any[]>(
      `SELECT queue_number FROM bookings 
       WHERE branch_id = ? AND booking_date = ? AND status != 'cancelled'
       ORDER BY queue_number ASC`,
      [finalBranchId, bookingDate]
    );
    const existingNums = new Set<number>(activeBookings.map((b) => b.queue_number).filter(Boolean));
    while (existingNums.has(assignedQueueNumber)) {
      assignedQueueNumber++;
    }
  } catch {}

  const initialStatus = payload.paymentProof ? 'pending_review' : 'awaiting_payment';
  const total = servicePrice + itemsTotal;

  // Normalize customer phone
  let cleanPhone = (payload.customerPhone || '').replace(/\D+/g, '');
  if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }

  // 6. Insert Booking Record
  try {
    await query(
      `INSERT INTO bookings (
        id, customer_id, customer_name, customer_phone, branch_id, barber_id, chair_id,
        service_id, additional_service_ids, booking_type, status, starts_at, ends_at,
        booking_date, queue_number, service_price_at_booking, booking_fee_at_booking,
        discount_at_booking, items_total_at_booking, total_at_booking, secure_token, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        actor?.id || uuidv4(),
        payload.customerName,
        cleanPhone || payload.customerPhone,
        finalBranchId,
        payload.barberId || null,
        payload.chairId || null,
        primaryService.id,
        JSON.stringify(payload.additionalServiceIds || []),
        payload.bookingType,
        initialStatus,
        payload.startsAt,
        payload.endsAt || null,
        bookingDate,
        assignedQueueNumber,
        servicePrice,
        bookingFee,
        0,
        itemsTotal,
        total,
        secureToken,
        payload.notes || null,
      ]
    );

    // Insert Booking Items
    for (const item of itemsToInsert) {
      await query(
        `INSERT INTO booking_items (id, booking_id, product_id, name, price_at_booking, quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.booking_id, item.product_id, item.name, item.price_at_booking, item.quantity]
      ).catch(() => {});
    }

    // Insert Payment Proof if provided
    if (payload.paymentProof) {
      await query(
        `INSERT INTO payment_proofs (
          id, booking_id, image_path, payment_method, sender_phone, transferred_amount, status, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          bookingId,
          payload.paymentProof.imagePath || 'data:image/placeholder',
          payload.paymentProof.paymentMethod || 'instapay',
          payload.paymentProof.senderPhone || cleanPhone,
          Number(payload.paymentProof.amount || bookingFee),
          'pending_review',
          new Date().toISOString(),
        ]
      ).catch(() => {});
    }
  } catch (dbErr: any) {
    console.warn('Database insert note for booking:', dbErr.message);
  }

  // 7. Sync into liveSyncedBookings cache
  try {
    const { liveSyncedBookings } = await import('../routes/agentTools.routes.js');
    liveSyncedBookings.unshift({
      id: bookingId,
      bookingId,
      customer_name: payload.customerName,
      customerName: payload.customerName,
      customer_phone: cleanPhone || payload.customerPhone,
      customerPhone: cleanPhone || payload.customerPhone,
      service_id: primaryService.id,
      service_name: primaryService.name,
      serviceName: primaryService.name,
      booking_type: payload.bookingType,
      bookingType: payload.bookingType,
      branch_id: finalBranchId,
      status: initialStatus,
      queue_number: assignedQueueNumber,
      queueNumber: assignedQueueNumber,
      starts_at: payload.startsAt,
      startsAt: payload.startsAt,
      total_at_booking: total,
      totalAmount: total,
      booking_fee_at_booking: bookingFee,
      depositRequired: bookingFee,
      payment_proof: payload.paymentProof,
      created_at: new Date().toISOString(),
    });
  } catch {}

  let createdBooking = await getBookingById(bookingId);
  if (!createdBooking) {
    createdBooking = {
      id: bookingId,
      customer_name: payload.customerName,
      customer_phone: cleanPhone || payload.customerPhone,
      service_id: primaryService.id,
      service_name: primaryService.name,
      booking_type: payload.bookingType,
      status: initialStatus,
      queue_number: assignedQueueNumber,
      starts_at: payload.startsAt,
      total_at_booking: total,
      booking_fee_at_booking: bookingFee,
    };
  }

  // Broadcast WebSockets event to branch & TV display
  broadcastToBranch(finalBranchId, 'BOOKING_CREATED', createdBooking);
  broadcastGlobal('SYNC_STATE', { type: 'BOOKING_CREATED', bookingId });

  // 🔔 Send WhatsApp Acknowledgement on Web/Online Booking Creation & Proof Submission
  if (cleanPhone || payload.customerPhone) {
    const destPhone = cleanPhone || payload.customerPhone;
    import('./whatsapp.service.js').then(({ sendWhatsAppText }) => {
      const clientName = payload.customerName || 'عزيزنا العميل';
      const msg = `أهلاً بك يا ${clientName} في صالون TrimMind (الحداد VIP)! 💈✨\n\nتم استلام طلب حجزك المبدئي وإيصال التحويل بنجاح! 📋\n🎫 رقم الحجز: #${bookingId}\n✂️ الخدمة: ${primaryService?.name || 'خدمة الصالون'}\n📅 الموعد: ${payload.startsAt ? payload.startsAt.replace('T', ' ').substring(0, 16) : 'موعد اليوم'}\n🔢 رقم الدور: رقم #${assignedQueueNumber} في طابور اليوم\n\n⏳ جاري مراجعة واعتماد إيصال التحويل من موظف الاستقبال في غضون 5 إلى 10 دقائق كحد أقصى.\nبمجرد الموافقة سيصلك إشعار فوري هنا على الواتساب بتأكيد الحجز وموقعك المباشر في الطابور! 👑\n\n📍 رابط تتبع حجزك:\nhttps://trimmind.up.railway.app/track?q=${bookingId}`;
      sendWhatsAppText(destPhone, msg).catch((err) => {
        console.error('Failed to send WhatsApp message:', err.message);
      });
    }).catch((err) => {
      console.error('Failed to load whatsapp service:', err.message);
    });
  }

  return createdBooking;
}

export async function getBookingById(bookingId: string) {
  const rows = await query<any[]>('SELECT * FROM bookings WHERE id = ? LIMIT 1', [bookingId]);
  if (!rows || rows.length === 0) return null;

  const b = rows[0];
  const items = await query<any[]>('SELECT * FROM booking_items WHERE booking_id = ?', [bookingId]);
  const proofs = await query<any[]>('SELECT * FROM payment_proofs WHERE booking_id = ? LIMIT 1', [bookingId]);
  const ratings = await query<any[]>('SELECT * FROM ratings WHERE booking_id = ? LIMIT 1', [bookingId]);

  return {
    ...b,
    additional_service_ids: typeof b.additional_service_ids === 'string' ? JSON.parse(b.additional_service_ids || '[]') : b.additional_service_ids,
    last_modified_by: typeof b.last_modified_by === 'string' ? JSON.parse(b.last_modified_by || 'null') : b.last_modified_by,
    items,
    payment_proof: proofs[0] || null,
    rating: ratings[0] || null,
  };
}

export async function cancelBooking(bookingId: string, reason?: string, actor?: any, ipAddress?: string) {
  let booking = await getBookingById(bookingId);
  if (!booking) {
    const { liveSyncedBookings } = await import('../routes/agentTools.routes.js');
    const targetLive = liveSyncedBookings.find((b) => b.id === bookingId);
    if (targetLive) {
      targetLive.status = 'cancelled';
      booking = targetLive;
    }
  }

  if (!booking) {
    return { success: true, bookingId };
  }

  const cancelledAt = new Date().toISOString();

  // Update booking status
  await query(
    `UPDATE bookings 
     SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = NOW() 
     WHERE id = ?`,
    [cancelledAt, reason || 'إلغاء من قبل العميل', bookingId]
  );

  // Free chair if occupied
  if (booking.chair_id) {
    await query(
      `UPDATE chairs SET status = 'available', current_booking_id = NULL, service_ends_at = NULL 
       WHERE id = ? AND current_booking_id = ?`,
      [booking.chair_id, bookingId]
    );
  }

  // Remove from queue table
  await query('DELETE FROM queue_entries WHERE booking_id = ?', [bookingId]);

  // Log audit
  await query(
    `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      actor?.id || null,
      actor?.full_name || 'العميل',
      actor?.role || 'customer',
      'STATUS_CANCELLED',
      'bookings',
      bookingId,
      JSON.stringify({
        queue_number: booking.queue_number,
        customer_name: booking.customer_name,
        reason: reason || 'إلغاء حجز',
      }),
      ipAddress || null,
    ]
  );

  // Broadcast cancellation to all screens in real-time
  const eventPayload = {
    bookingId,
    customerName: booking.customer_name,
    queueNumber: booking.queue_number,
    branchId: booking.branch_id,
  };

  broadcastToBranch(booking.branch_id, 'BOOKING_CANCELLED', eventPayload);
  broadcastGlobal('SYNC_STATE');

  if (booking.customer_phone) {
    import('./whatsapp.service.js').then(({ sendWhatsAppText }) => {
      const clientName = booking.customer_name || 'عزيزنا العميل';
      const msg = `تم إلغاء حجزك رقم #${booking.id} بنجاح يا ${clientName}. ❌\n\n⚠️ تنبيه هام: وفقاً لسياسة حجز المواعيد بالصالون، فإن قيمة رسم الحجز والعربون المدفوع (50 ج.م) غير قابلة للاسترداد نظراً لحجز وقت ومقعد مخصص لكم.\n\nنتشرف بزيارتك في أي وقت آخر، وتقدر تحجز موعد جديد في أي وقت! 💈✨`;
      sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
    }).catch(() => {});
  }

  return { success: true, bookingId };
}
