import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { createBooking, cancelBooking, getBookingById } from '../services/booking.service.js';
import { validateBody } from '../middleware/validate.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  updateBookingStatusSchema,
  rateBookingSchema,
} from '../validators/booking.schema.js';
import { bookingLimiter } from '../middleware/rateLimiter.js';
import { optionalAuth, requireAuth, requireRoles, AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';
import {
  getPersistentDb,
  addOrUpdatePersistentBooking,
} from '../services/persistentStorage.service.js';
import { notifyTelegramNewBooking } from '../services/telegramBot.service.js';

import { liveSyncedBookings } from './agentTools.routes.js';

const router = Router();

// GET /api/bookings/track?q=... (Public Search & Track Booking)
router.get('/track', async (req, res: Response) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الهاتف أو رقم الحجز' });
    }

    const cleanPhone = q.replace(/\s+/g, '');
    const cleanQuery = q.toLowerCase();

    // 1. Search in MySQL
    let detailedBookings: any[] = [];
    try {
      const rows = await query<any[]>(
        `SELECT * FROM bookings 
         WHERE id = ? OR customer_phone = ? OR secure_token = ?
         ORDER BY created_at DESC LIMIT 5`,
        [q, cleanPhone, q]
      );
      if (rows && rows.length > 0) {
        detailedBookings = await Promise.all(rows.map((b) => getBookingById(b.id)));
      }
    } catch {}

    // 2. Search in Persistent Volume DB
    const persistentBookings = getPersistentDb().bookings || [];
    const pMatches = persistentBookings.filter(
      (b) =>
        b.id?.toLowerCase() === cleanQuery ||
        b.bookingId?.toLowerCase() === cleanQuery ||
        (b.customer_phone && b.customer_phone.includes(cleanPhone)) ||
        (b.secure_token && b.secure_token.toLowerCase() === cleanQuery)
    );

    // 3. Search in liveSyncedBookings (in-memory created via WhatsApp)
    const memMatches = liveSyncedBookings.filter(
      (b) =>
        b.id?.toLowerCase() === cleanQuery ||
        b.bookingId?.toLowerCase() === cleanQuery ||
        (b.customer_phone && b.customer_phone.includes(cleanPhone)) ||
        (b.secure_token && b.secure_token.toLowerCase() === cleanQuery)
    );

    const merged = [
      ...detailedBookings,
      ...pMatches.filter((p) => !detailedBookings.some((d) => d && d.id === p.id)),
      ...memMatches.filter((m) => !detailedBookings.some((d) => d && d.id === m.id) && !pMatches.some((p) => p && p.id === m.id)),
    ];

    return res.json({
      success: true,
      data: merged,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings (Staff & Live Sync view - STRICT AUTHENTICATION REQUIRED)
router.get('/', requireAuth, requireRoles('manager', 'receptionist', 'barber'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branchId = (req.query.branchId as string) || req.user?.branch_id;
    const date = req.query.date as string;

    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params: any[] = [];

    // Receptionists only see their branch
    if (req.user?.role === 'receptionist') {
      sql += ' AND branch_id = ?';
      params.push(req.user.branch_id);
    } else if (req.user?.role === 'barber') {
      sql += ' AND (barber_id = ? OR branch_id = ?)';
      params.push(req.user.barber_id, req.user.branch_id);
    } else if (branchId) {
      sql += ' AND (branch_id = ? OR branch_id = "branch-elhdad" OR branch_id = "branch-1")';
      params.push(branchId);
    }

    if (date) {
      sql += ' AND (booking_date = ? OR starts_at LIKE ?)';
      params.push(date, `${date}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT 200';

    let detailed: any[] = [];
    try {
      const rows = await query<any[]>(sql, params);
      if (rows && rows.length > 0) {
        detailed = await Promise.all(rows.map((b) => getBookingById(b.id)));
      }
    } catch {}

    // Merge persistent volume bookings
    const pBookings = getPersistentDb().bookings || [];

    // Merge in-memory liveSyncedBookings
    const merged = [
      ...detailed,
      ...pBookings.filter((p) => !detailed.some((d) => d && d.id === p.id)),
      ...liveSyncedBookings.filter((m) => !detailed.some((d) => d && d.id === m.id) && !pBookings.some((p) => p && p.id === m.id)),
    ];

    // Sort strictly from newest to oldest
    merged.sort((a, b) => {
      const timeA = new Date(a.created_at || a.starts_at || 0).getTime();
      const timeB = new Date(b.created_at || b.starts_at || 0).getTime();
      return timeB - timeA;
    });

    return res.json({ success: true, data: merged });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bookings/:id (Update Booking details, services, prices, invoice - Staff only)
router.patch('/:id', requireAuth, requireRoles('manager', 'receptionist', 'barber'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = req.params.id;
    const {
      serviceId,
      service_id,
      serviceName,
      service_name,
      additionalServiceIds,
      additional_service_ids,
      servicePrice,
      service_price_at_booking,
      totalAmount,
      total_at_booking,
      discount,
      discount_at_booking,
      customerName,
      customer_name,
      customerPhone,
      customer_phone,
      barberId,
      barber_id,
      barberName,
      barber_name,
      notes,
      status,
      items,
      customLineItems,
      custom_line_items,
    } = req.body;

    const finalServiceId = serviceId || service_id;
    const finalServiceName = serviceName || service_name;
    const finalAdditionalIds = additionalServiceIds || additional_service_ids || [];
    const finalTotal = Number(totalAmount !== undefined ? totalAmount : (total_at_booking !== undefined ? total_at_booking : undefined));
    const finalDiscount = Number(discount !== undefined ? discount : (discount_at_booking !== undefined ? discount_at_booking : 0));
    const finalCustomerName = customerName || customer_name;
    const finalCustomerPhone = customerPhone || customer_phone;
    const finalBarberId = barberId || barber_id;
    const finalBarberName = barberName || barber_name;

    let booking = await getBookingById(bookingId).catch(() => null);
    if (!booking) {
      const pBookings = getPersistentDb().bookings || [];
      booking = pBookings.find((b) => b.id === bookingId || b.bookingId === bookingId);
    }
    if (!booking) {
      booking = liveSyncedBookings.find((b) => b.id === bookingId);
    }

    const updatedTotal = !isNaN(finalTotal) ? finalTotal : (booking?.total_at_booking || 180);
    const updatedCustName = finalCustomerName || booking?.customer_name || booking?.customerName || 'عميل محترم';
    const updatedCustPhone = finalCustomerPhone || booking?.customer_phone || booking?.customerPhone || '';
    const updatedSrvName = finalServiceName || booking?.service_name || booking?.serviceName;
    const updatedBarberName = finalBarberName || booking?.barber_name || booking?.barberName;

    // 1. Update in MySQL
    await query(
      `UPDATE bookings 
       SET customer_name = COALESCE(?, customer_name),
           customer_phone = COALESCE(?, customer_phone),
           service_id = COALESCE(?, service_id),
           service_name = COALESCE(?, service_name),
           additional_service_ids = ?,
           total_at_booking = ?,
           service_price_at_booking = ?,
           discount_at_booking = ?,
           barber_id = COALESCE(?, barber_id),
           barber_name = COALESCE(?, barber_name),
           notes = COALESCE(?, notes),
           status = COALESCE(?, status),
           custom_line_items = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        finalCustomerName || null,
        finalCustomerPhone || null,
        finalServiceId || null,
        updatedSrvName || null,
        JSON.stringify(finalAdditionalIds),
        updatedTotal,
        Number(servicePrice || service_price_at_booking || updatedTotal),
        finalDiscount,
        finalBarberId || null,
        updatedBarberName || null,
        notes || null,
        status || null,
        customLineItems || custom_line_items ? JSON.stringify(customLineItems || custom_line_items) : null,
        bookingId,
      ]
    ).catch(() => {});

    // 2. Update persistent DB
    const updatedObj = {
      ...(booking || {}),
      id: bookingId,
      customer_name: updatedCustName,
      customerName: updatedCustName,
      customer_phone: updatedCustPhone,
      customerPhone: updatedCustPhone,
      service_id: finalServiceId || booking?.service_id,
      service_name: updatedSrvName,
      additional_service_ids: finalAdditionalIds,
      service_price_at_booking: Number(servicePrice || service_price_at_booking || updatedTotal),
      total_at_booking: updatedTotal,
      discount_at_booking: finalDiscount,
      barber_id: finalBarberId || booking?.barber_id,
      barber_name: updatedBarberName,
      notes: notes !== undefined ? notes : booking?.notes,
      status: status || booking?.status || 'confirmed',
      custom_line_items: customLineItems || custom_line_items || booking?.custom_line_items,
      items: items || booking?.items,
      updated_at: new Date().toISOString(),
    };

    addOrUpdatePersistentBooking(updatedObj);

    // Update in-memory liveSyncedBookings
    const memIdx = liveSyncedBookings.findIndex((b) => b.id === bookingId);
    if (memIdx >= 0) {
      liveSyncedBookings[memIdx] = { ...liveSyncedBookings[memIdx], ...updatedObj };
    }

    broadcastToBranch(updatedObj.branch_id || 'branch-elhdad', 'SYNC_STATE', updatedObj);
    broadcastGlobal('SYNC_STATE', { bookingId, updated: true });

    return res.json({ success: true, message: 'تم تحديث بيانات وفاتورة الحجز بنجاح', data: updatedObj });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings/:id
router.get('/:id', async (req, res: Response) => {
  try {
    let booking: any = null;
    try {
      booking = await getBookingById(req.params.id);
    } catch {}

    if (!booking) {
      const pBookings = getPersistentDb().bookings || [];
      booking = pBookings.find((b) => b.id === req.params.id || b.bookingId === req.params.id);
    }

    if (!booking) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
    }
    return res.json({ success: true, data: booking });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bookings (Create booking - Public with rate limiting)
router.post('/', bookingLimiter, validateBody(createBookingSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const booking = await createBooking(req.body, req.user, ip);
    addOrUpdatePersistentBooking(booking);
    
    // 1. Broadcast real-time event to Receptionist & Manager screens
    broadcastToBranch(booking.branch_id || booking.branchId || 'branch-elhdad', 'BOOKING_CREATED', booking);
    broadcastGlobal('SYNC_STATE', { type: 'BOOKING_CREATED', bookingId: booking.id });

    // 2. Alert Telegram Bot subscribers
    notifyTelegramNewBooking(booking).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'تم تسجيل الحجز وتعيين رقم الدور بنجاح',
      data: booking,
    });
  } catch (error: any) {
    console.error('[POST /api/bookings Exception]:', error);
    return res.status(400).json({ success: false, error: error?.message || error?.sqlMessage || String(error) });
  }
});

// POST /api/bookings/:id/cancel (Cancel booking)
router.post('/:id/cancel', validateBody(cancelBookingSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const result = await cancelBooking(req.params.id, req.body.reason, req.user, ip);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// PATCH /api/bookings/:id/status (Staff status change & WhatsApp Dispatch - Staff only)
router.patch(
  '/:id/status',
  requireAuth,
  requireRoles('manager', 'receptionist', 'barber'),
  validateBody(updateBookingStatusSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, note, booking: payloadBooking } = req.body;
      let booking: any = null;
      try {
        booking = await getBookingById(req.params.id);
      } catch (err) {
        console.warn('getBookingById error in status patch:', err);
      }

      if (!booking) {
        const pBookings = getPersistentDb().bookings || [];
        booking = pBookings.find((b) => b.id === req.params.id || b.bookingId === req.params.id);
      }

      const targetLive = liveSyncedBookings.find((b) => b.id === req.params.id);
      if (targetLive) {
        targetLive.status = status;
        if (!booking) booking = targetLive;
      }

      if (payloadBooking) {
        booking = booking ? { ...booking, ...payloadBooking } : payloadBooking;
      }

      if (!booking) {
        const autoBooking: any = {
          id: req.params.id,
          bookingId: req.params.id,
          customer_name: payloadBooking?.customer_name || payloadBooking?.customerName || 'عميل محترم',
          customer_phone: payloadBooking?.customer_phone || payloadBooking?.customerPhone || '',
          service_id: payloadBooking?.service_id || 'srv-haircut',
          branch_id: payloadBooking?.branch_id || 'branch-elhdad',
          status: status,
          starts_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        liveSyncedBookings.unshift(autoBooking);
        booking = autoBooking;
      }

      booking.status = status;
      addOrUpdatePersistentBooking(booking);

      await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]).catch(() => {});

      // Free chair if completed or cancelled
      if ((status === 'completed' || status === 'cancelled') && booking.chair_id) {
        await query(
          'UPDATE chairs SET status = "available", current_booking_id = NULL, service_ends_at = NULL WHERE id = ?',
          [booking.chair_id]
        ).catch(() => {});
      }

      // Record Audit safely
      try {
        await query(
          `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            req.user?.id || 'usr-receptionist',
            req.user?.full_name || 'موظف الاستقبال',
            req.user?.role || 'receptionist',
            `STATUS_${status.toUpperCase()}`,
            'bookings',
            req.params.id,
            JSON.stringify({ to_status: status, note }),
            req.ip || '127.0.0.1',
          ]
        );
      } catch {}

      let updated = booking;
      try {
        const fresh = await getBookingById(req.params.id);
        if (fresh) updated = fresh;
      } catch {}

      // Broadcast real-time events
      broadcastToBranch(booking.branch_id || 'branch-elhdad', 'SYNC_STATE', updated);
      broadcastGlobal('SYNC_STATE', { bookingId: req.params.id, status });

      const customerPhone = booking.customer_phone || booking.customerPhone;

      // 1. WhatsApp Notification on Confirmation / Acceptance
      if (status === 'confirmed') {
        const depositFee = booking.booking_fee_at_booking || (booking.booking_type === 'vip' ? 100 : 50);
        let pMethod = 'vodafone_cash';
        try {
          if (booking.payment_proof) {
            const parsed = typeof booking.payment_proof === 'string' ? JSON.parse(booking.payment_proof) : booking.payment_proof;
            if (parsed?.payment_method === 'instapay') pMethod = 'instapay';
            else if (parsed?.payment_method === 'cash') pMethod = 'cash';
          }
        } catch {}

        query(
          `INSERT INTO financial_records (id, booking_id, branch_id, barber_id, amount, type, payment_method, reference_number, notes, recorded_by, created_at)
           VALUES (?, ?, ?, ?, ?, 'deposit', ?, ?, 'عربون حجز مؤكد عبر واتساب', 'receptionist', NOW())`,
          [
            uuidv4(),
            booking.id,
            booking.branch_id || 'branch-elhdad',
            booking.barber_id || null,
            depositFee,
            pMethod,
            booking.id
          ]
        ).catch((err) => console.warn('Financial record insert error:', err));
      }

      // 2. WhatsApp Notification on Calling Customer to Chair (دورك جه الآن) + Proactive Queue Approaching (باقي 1 أو 2)
      else if (status === 'in_service') {
        const clientName = booking.customer_name || booking.customerName || 'يا باشا';
        const barberName = booking.barber_name || booking.barberName || 'كابتن الصالون';
        const chairName = booking.chair_name || 'الكرسي المخصص';

        broadcastToBranch(booking.branch_id || 'branch-elhdad', 'CUSTOMER_CALLED', {
          bookingId: booking.id,
          customerName: clientName,
          barberName,
          chairName,
        });

        // 1. Notify the customer whose turn is NOW (اللي عليه الدور)
        if (customerPhone) {
          import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
            const callMsg = `🔔 *يا أستاذ ${clientName}! دورك جه الآن والكرسي جاهز لحضرتك في صالون TrimMind VIP!* 💈👑\n\n✂️ *الكابتن:* ${barberName}\n🪑 *الكرسي:* ${chairName}\n\nتفضل بالدخول لصالون الحلاقة الآن، والكابتن في انتظارك لتجهيزك بأعلى مستوى! ✨\n📍 رابط تتبع دورك: https://trimmind.up.railway.app/track?q=${booking.id}`;
            sendWhatsAppText(customerPhone, callMsg).catch((e) => console.error('WA Call Send Error:', e));
          }).catch(() => {});
        }

        // 2. Query Waiting Customers in Queue (العميل التالي والعميل الذي بعده)
        query<any[]>(
          `SELECT id, customer_name, customer_phone, barber_name, service_name, queue_number 
           FROM bookings 
           WHERE (branch_id = ? OR branch_id = 'branch-elhdad' OR branch_id = 'branch-1')
             AND status IN ('confirmed', 'pending_review', 'awaiting_payment')
             AND id != ?
           ORDER BY queue_number ASC, created_at ASC LIMIT 2`,
          [booking.branch_id || 'branch-elhdad', booking.id]
        ).then((waitingList) => {
          if (!waitingList || waitingList.length === 0) return;

          // Customer #1: The next in line (أنت التالي مباشرة)
          const nextBooking = waitingList[0];
          if (nextBooking && nextBooking.customer_phone) {
            import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
              const nextName = nextBooking.customer_name || 'يا فندم';
              const nextBarber = nextBooking.barber_name || 'كابتن الصالون';
              const reminderMsg = `⏳ *يا أستاذ ${nextName}! أنت العميل التالي مباشرة في الطابور!* 💈👑\n\nالكابتن *${nextBarber}* هيستقبلك على الكرسي بعد العميل الحالي مباشرة (باقي عميل واحد فقط أمامك).\n\n📍 يرجى التواجد في صالة الانتظار والاستعداد للدخول ✂️✨\nرابط متابعة دورك: https://trimmind.up.railway.app/track?q=${nextBooking.id}`;
              sendWhatsAppText(nextBooking.customer_phone, reminderMsg).catch(() => {});
            }).catch(() => {});
          }

          // Customer #2: Two ahead in line (باقي أمامك شخصين)
          const secondBooking = waitingList[1];
          if (secondBooking && secondBooking.customer_phone) {
            import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
              const secondName = secondBooking.customer_name || 'يا فندم';
              const reminderMsg = `⏳ *تنبيه باقتراب دورك يا أستاذ ${secondName}!* 💈👑\n\nدورك قرب في صالون TrimMind VIP (باقي أمامك عميلين فقط في الطابور ⏳).\n\n📍 يرجى التوجه للصالون لتجهيز موعدك بالوقت المحدد ✂️✨\nرابط متابعة دورك: https://trimmind.up.railway.app/track?q=${secondBooking.id}`;
              sendWhatsAppText(secondBooking.customer_phone, reminderMsg).catch(() => {});
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      // 3. WhatsApp Notification on Completed Service (Thank You & Rating)
      else if (status === 'completed' && customerPhone) {
        import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
          const barberName = booking.barber_name || booking.barberName || 'محمد الحداد';
          const msg = `👑 شكرًا لزيارتك TrimMind! 💈✨\n\nنتمنى تكون استمتعت بتجربتك مع الكابتن ${barberName} ❤️\n\n⭐ قيّم تجربتك:\nhttps://trimmind.up.railway.app/track?q=${booking.id}\n\nشكرًا لاختيارك TrimMind، ونستناك دايمًا! 💈❤️`;
          sendWhatsAppText(customerPhone, msg).catch((e) => console.error('WA Completed Send Error:', e));
        }).catch(() => {});
      }

      // 4. WhatsApp Notification on Cancelled / Rejected
      else if ((status === 'cancelled' || status === 'rejected') && customerPhone) {
        import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
          const clientName = booking.customer_name || booking.customerName || 'عزيزنا العميل';
          const msg = `عزيزنا ${clientName}، نعتذر منك، تم إلغاء الحجز رقم #${booking.id}.\nيرجى التواصل مع إدارة الصالون أو حجز موعد جديد عبر الرابط: https://trimmind.up.railway.app 💈`;
          sendWhatsAppText(customerPhone, msg).catch(() => {});
        }).catch(() => {});
      }

      return res.json({ success: true, message: 'تم تحديث حالة الحجز بنجاح', data: updated });
    } catch (error: any) {
      console.error('PATCH /:id/status Error:', error);
      return res.status(500).json({ success: false, error: String(error?.stack || error?.message || error) });
    }
  }
);

// POST /api/bookings/:id/rate (Customer Rating)
router.post('/:id/rate', validateBody(rateBookingSchema), async (req, res: Response) => {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
    }

    const { stars, barber_score, place_score, experience_score, comment } = req.body;
    const ratingId = uuidv4();

    await query(
      `INSERT INTO ratings (id, booking_id, customer_id, customer_name, barber_id, branch_id, stars, barber_score, place_score, experience_score, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         stars = VALUES(stars), barber_score = VALUES(barber_score), place_score = VALUES(place_score),
         experience_score = VALUES(experience_score), comment = VALUES(comment)`,
      [
        ratingId,
        booking.id,
        booking.customer_id || null,
        booking.customer_name,
        booking.barber_id || 'unassigned',
        booking.branch_id,
        stars,
        barber_score || 5.0,
        place_score || 5.0,
        experience_score || 5.0,
        comment || null,
      ]
    );

    // Recalculate Barber average rating if assigned
    if (booking.barber_id) {
      const avgRows = await query<any[]>(
        'SELECT AVG(stars) as avg_stars, COUNT(*) as cnt FROM ratings WHERE barber_id = ?',
        [booking.barber_id]
      );
      if (avgRows && avgRows[0]) {
        await query('UPDATE barbers SET rating = ?, rating_count = ? WHERE id = ?', [
          Number(avgRows[0].avg_stars).toFixed(2),
          avgRows[0].cnt,
          booking.barber_id,
        ]);
      }
    }

    return res.json({ success: true, message: 'شكراً لمشاركتنا تقييمك!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/bookings/:id/payment-proof (Review Payment Proof - Staff Only)
router.patch('/:id/payment-proof', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, reason, booking: payloadBooking } = req.body;
    const nextBookingStatus = status === 'approved' ? 'confirmed' : 'rejected';
    const reviewedAt = new Date().toISOString();

    let booking: any = null;
    try {
      booking = await getBookingById(req.params.id);
    } catch {}

    if (!booking) {
      const pBookings = getPersistentDb().bookings || [];
      booking = pBookings.find((b) => b.id === req.params.id || b.bookingId === req.params.id);
    }

    if (!booking) {
      booking = liveSyncedBookings.find((b) => b.id === req.params.id || b.bookingId === req.params.id);
    }

    if (payloadBooking) {
      booking = booking ? { ...booking, ...payloadBooking } : payloadBooking;
    }

    if (!booking) {
      booking = {
        id: req.params.id,
        bookingId: req.params.id,
        customer_name: payloadBooking?.customer_name || payloadBooking?.customerName || 'عميل محترم',
        customer_phone: payloadBooking?.customer_phone || payloadBooking?.customerPhone || '',
        service_name: payloadBooking?.service_name || payloadBooking?.serviceName || 'خدمة صالون',
        barber_name: payloadBooking?.barber_name || payloadBooking?.barberName || 'محمد الحداد',
        branch_id: payloadBooking?.branch_id || payloadBooking?.branchId || 'branch-elhdad',
        status: nextBookingStatus,
      };
      liveSyncedBookings.unshift(booking);
    }

    booking.status = nextBookingStatus;
    addOrUpdatePersistentBooking(booking);

    const targetLive = liveSyncedBookings.find((b) => b.id === req.params.id);
    if (targetLive) {
      targetLive.status = nextBookingStatus;
      if (typeof targetLive.payment_proof === 'string') {
        try {
          const parsed = JSON.parse(targetLive.payment_proof);
          parsed.status = status;
          parsed.reviewed_at = reviewedAt;
          targetLive.payment_proof = JSON.stringify(parsed);
        } catch {}
      } else if (targetLive.payment_proof) {
        targetLive.payment_proof.status = status;
        targetLive.payment_proof.reviewed_at = reviewedAt;
      }
    }

    await query(
      `UPDATE payment_proofs 
       SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = ? 
       WHERE booking_id = ?`,
      [status, req.user?.id || 'usr-receptionist', reason || null, reviewedAt, req.params.id]
    ).catch(() => {});

    // Update booking status to confirmed/rejected
    await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [
      nextBookingStatus,
      req.params.id,
    ]).catch(() => {});

    const customerPhone = booking.customer_phone || booking.customerPhone;

    // Add financial deposit if approved
    if (status === 'approved') {
      const depositFee = booking.booking_fee_at_booking || (booking.booking_type === 'vip' ? 100 : 50);
      let pMethod = 'vodafone_cash';
      try {
        if (booking.payment_proof) {
          const parsed = typeof booking.payment_proof === 'string' ? JSON.parse(booking.payment_proof) : booking.payment_proof;
          if (parsed?.payment_method === 'instapay') pMethod = 'instapay';
          else if (parsed?.payment_method === 'cash') pMethod = 'cash';
        }
      } catch {}

      query(
        `INSERT INTO financial_records (id, booking_id, branch_id, barber_id, amount, type, payment_method, reference_number, notes, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'deposit', ?, ?, 'عربون حجز معتمد', 'receptionist', NOW())`,
        [
          uuidv4(),
          booking.id,
          booking.branch_id || 'branch-elhdad',
          booking.barber_id || null,
          depositFee,
          pMethod,
          booking.id
        ]
      ).catch((err) => console.warn('Financial record insert error:', err));

      if (customerPhone) {
        try {
          const { sendBookingConfirmationWhatsApp } = await import('../services/whatsapp.service.js');
          await sendBookingConfirmationWhatsApp(booking);
          console.log('WA Proof Approved message sent successfully to:', customerPhone);
        } catch (e) {
          console.error('WA Proof Send Error:', e);
        }
      }
    } else if (status === 'rejected' && customerPhone) {
      try {
        const { sendWhatsAppText } = await import('../services/whatsapp.service.js');
        const clientName = booking.customer_name || booking.customerName || 'عزيزنا العميل';
        const msg = `عزيزنا ${clientName}، نعتذر منك، لم يتم اعتماد إيصال التحويل للحجز رقم #${booking.id}.\nالسبب: ${reason || 'المبلغ أو الصورة غير واضحة'}\nيرجى التواصل مع إدارة الصالون أو إعادة إرسال الإيصال. 💈`;
        await sendWhatsAppText(customerPhone, msg);
      } catch (e) {
        console.error('WA Reject Send Error:', e);
      }
    }

    broadcastToBranch(booking.branch_id || 'branch-elhdad', 'PAYMENT_PROOF_REVIEWED', {
      bookingId: req.params.id,
      status,
    });
    broadcastGlobal('SYNC_STATE');

    return res.json({ success: true, message: 'تمت مراجعة وتحديث حالة الإيصال وتأكيد الحجز بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bookings/:id/customize-and-dispatch (Receptionist Dynamic Pricing & Instant WhatsApp Invoice)
router.post('/:id/customize-and-dispatch', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = req.params.id;
    const {
      customLineItems = [],
      totalAmount,
      discount = 0,
      notes,
      barberId,
      barberName,
      serviceName,
      depositRequired = 50,
    } = req.body;

    const { container } = await import('../index.js');
    const result = await container.applyCustomPricingUseCase.execute({
      bookingId,
      items: customLineItems,
      subtotal: Number(totalAmount || 0) + Number(discount || 0),
      discount: Number(discount || 0),
      totalPrice: Number(totalAmount || 180),
      depositRequired: Number(depositRequired || 50),
      remainingBalance: Math.max(0, Number(totalAmount || 180) - Number(depositRequired || 50)),
      barberId,
      barberName,
      serviceName,
      actorName: (req as any).user?.name || 'موظف الاستقبال',
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.booking,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bookings/toggle-handoff (Toggle Human Handoff Mode for a Customer)
router.post('/toggle-handoff', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone, enable } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
    const { toggleHumanHandoff } = await import('../services/whatsapp.service.js');
    await toggleHumanHandoff(phone, Boolean(enable));
    return res.json({ success: true, message: enable ? 'تم تحويل المحادثة للتدخل البشري وإيقاف الـ AI' : 'تم استئناف رد الذكاء الاصطناعي بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings/analytics/whatsapp (WhatsApp ROI & Conversion Analytics)
router.get('/analytics/whatsapp', optionalAuth, async (_req, res: Response) => {
  try {
    const { getWhatsAppAnalytics } = await import('../services/whatsapp.service.js');
    const analytics = await getWhatsAppAnalytics();
    return res.json({ success: true, data: analytics });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
