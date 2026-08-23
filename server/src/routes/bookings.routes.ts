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
import { requireAuth, requireRoles, optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

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

    // 2. Search in liveSyncedBookings (in-memory created via WhatsApp)
    const memMatches = liveSyncedBookings.filter(
      (b) =>
        b.id?.toLowerCase() === cleanQuery ||
        b.bookingId?.toLowerCase() === cleanQuery ||
        (b.customer_phone && b.customer_phone.includes(cleanPhone)) ||
        (b.secure_token && b.secure_token.toLowerCase() === cleanQuery)
    );

    const merged = [...detailedBookings, ...memMatches.filter(m => !detailedBookings.some(d => d && d.id === m.id))];

    return res.json({
      success: true,
      data: merged,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings (Staff & Live Sync view)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
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
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }

    if (date) {
      sql += ' AND booking_date = ?';
      params.push(date);
    }

    sql += ' ORDER BY created_at DESC LIMIT 200';

    let detailed: any[] = [];
    try {
      const rows = await query<any[]>(sql, params);
      if (rows && rows.length > 0) {
        detailed = await Promise.all(rows.map((b) => getBookingById(b.id)));
      }
    } catch {}

    // Merge in-memory liveSyncedBookings (created via WhatsApp)
    const merged = [...detailed, ...liveSyncedBookings.filter((m) => !detailed.some((d) => d && d.id === m.id))];

    return res.json({ success: true, data: merged });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings/:id
router.get('/:id', async (req, res: Response) => {
  try {
    const booking = await getBookingById(req.params.id);
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
    return res.status(201).json({
      success: true,
      message: 'تم تسجيل الحجز وتعيين رقم الدور بنجاح',
      data: booking,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
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

// PATCH /api/bookings/:id/status (Staff status change)
router.patch(
  '/:id/status',
  requireAuth,
  requireRoles('manager', 'receptionist', 'barber'),
  validateBody(updateBookingStatusSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, note } = req.body;
      let booking = await getBookingById(req.params.id);
      const targetLive = liveSyncedBookings.find((b) => b.id === req.params.id);

      if (targetLive) {
        targetLive.status = status;
        if (!booking) booking = targetLive;
      } else if (!booking) {
        const autoBooking = {
          id: req.params.id,
          bookingId: req.params.id,
          customer_name: 'عميل الصالون',
          customer_phone: '01005437633',
          service_id: 'srv-haircut',
          branch_id: 'branch-elhdad',
          status: status,
          starts_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        liveSyncedBookings.unshift(autoBooking);
        booking = autoBooking;
      }

      await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]).catch(() => {});

      // Free chair if completed or cancelled
      if ((status === 'completed' || status === 'cancelled') && booking.chair_id) {
        await query(
          'UPDATE chairs SET status = "available", current_booking_id = NULL, service_ends_at = NULL WHERE id = ?',
          [booking.chair_id]
        ).catch(() => {});
      }

      // Record Audit
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
          req.ip,
        ]
      ).catch(() => {});

      let updated = await getBookingById(req.params.id);
      if (!updated) updated = booking;
      broadcastToBranch(booking.branch_id || 'branch-elhdad', 'SYNC_STATE', updated);
      broadcastGlobal('SYNC_STATE', { bookingId: req.params.id, status });

      // Automatic WhatsApp Notification on Confirmation / Payment Approval + Add Revenue to Manager Financials
      if (status === 'confirmed') {
        const depositFee = booking.booking_fee_at_booking || 50;

        // Record revenue in financial_records table
        query(
          `INSERT INTO financial_records (id, branch_id, type, category, amount, payment_method, reference_id, notes, recorded_by, created_at)
           VALUES (?, ?, 'income', 'booking_fee', ?, 'online', ?, 'عربون حجز مؤكد عبر واتساب', 'system', NOW())`,
          [uuidv4(), booking.branch_id || 'branch-elhdad', depositFee, booking.id]
        ).catch(() => {});

        if (booking.customer_phone) {
          import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
            const clientName = booking.customer_name || 'عزيزنا العميل';
            const totalVal = booking.total_at_booking || 180;
            const depositVal = booking.booking_fee_at_booking || 50;
            const remainingVal = Math.max(0, totalVal - depositVal);
            const msg = `ألف مبروك يا ${clientName}! 🎉👑\nتم اعتماد إيصال التحويل وتأكيد حجزك رقم #${booking.id} بنجاح لدى صالون الحداد VIP!\n\n📋 تفاصيل الحجز المؤكد:\n✂️ الخدمة: ${booking.service_name || 'خدمة الصالون'}\n💈 الكابتن: ${booking.barber_name || 'كابتن الصالون الرئيسي'}\n📅 الموعد: ${booking.starts_at ? booking.starts_at.replace('T', ' ').substring(0, 16) : 'موعد فوري'}\n🔢 رقم الدور: رقم #${booking.queue_number || 1} في طابور اليوم\n\n💵 تفاصيل الفاتورة والحساب:\n• إجمالي الفاتورة: ${totalVal} ج.م\n• العربون المسدد: ${depositVal} ج.م ✓\n• المتبقي للدفع بالصالون: ${remainingVal} ج.م\n\n📍 رابط متابعة دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${booking.id}\n\nأول ما يقرب دورك في نفس اليوم هنبعتلك تذكير فوري لتجهيز الكرسي لك! نتشرف بزيارتك 💈✨`;
            sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
          }).catch(() => {});
        }
      } else if (status === 'completed' && booking.customer_phone) {
        import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
          const clientName = booking.customer_name || 'عزيزنا العميل';
          const msg = `نعيماً يا ${clientName}! 💈✂️✨\nسعدنا جداً بزيارتك وتشريفك لنا في صالون TrimMind (الحداد VIP) اليوم.\n\nنتمنى تكون الحلاقة وتجربتك معنا نالت إعجابك ورضاك التام 👑\n\n⭐ يسعدنا جداً مشاركتنا تقييمك ورأيك في الخدمة والكابتن عبر الرابط التالي:\nhttps://trimmind.up.railway.app/track?q=${booking.id}\n\nمع تحيات فريق عمل وكباتن صالون الحداد VIP! ننتظر زيارتك القادمة دائماً 💈❤️`;
          sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
        }).catch(() => {});
      } else if ((status === 'cancelled' || status === 'rejected') && booking.customer_phone) {
        import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
          const clientName = booking.customer_name || 'عزيزنا العميل';
          const msg = `عزيزنا ${clientName}، نعتذر منك، لم يتم اعتماد إيصال التحويل للحجز رقم #${booking.id}.\nيرجى التواصل مع إدارة الصالون أو إعادة إرسال الإيصال الصحيح. 💈`;
          sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
        }).catch(() => {});
      }

      return res.json({ success: true, message: 'تم تحديث حالة الحجز بنجاح', data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
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
router.patch('/:id/payment-proof', requireAuth, requireRoles('manager', 'receptionist'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, reason } = req.body;
    let booking = await getBookingById(req.params.id);
    if (!booking) {
      const targetLive = liveSyncedBookings.find((b) => b.id === req.params.id);
      if (targetLive) {
        booking = targetLive;
      } else {
        return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
      }
    }

    const nextBookingStatus = status === 'approved' ? 'confirmed' : 'rejected';
    const reviewedAt = new Date().toISOString();

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

    // Add financial deposit if approved
    if (status === 'approved') {
      const depositFee = booking.booking_fee_at_booking || 50;
      query(
        `INSERT INTO financial_records (id, branch_id, type, category, amount, payment_method, reference_id, notes, recorded_by, created_at)
         VALUES (?, ?, 'income', 'booking_fee', ?, 'online', ?, 'عربون حجز معتمد', 'receptionist', NOW())`,
        [uuidv4(), booking.branch_id || 'branch-elhdad', depositFee, booking.id]
      ).catch(() => {});

      if (booking.customer_phone) {
        import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
          const clientName = booking.customer_name || 'عزيزنا العميل';
          const totalVal = booking.total_at_booking || 180;
          const depositVal = booking.booking_fee_at_booking || 50;
          const remainingVal = Math.max(0, totalVal - depositVal);
          const msg = `ألف مبروك يا ${clientName}! 🎉👑\nتم اعتماد إيصال التحويل وتأكيد حجزك رقم #${booking.id} بنجاح لدى صالون الحداد VIP!\n\n📋 تفاصيل الحجز المؤكد:\n✂️ الخدمة: ${booking.service_name || 'خدمة الصالون'}\n💈 الكابتن: ${booking.barber_name || 'كابتن الصالون الرئيسي'}\n📅 الموعد: ${booking.starts_at ? booking.starts_at.replace('T', ' ').substring(0, 16) : 'موعد فوري'}\n🔢 رقم الدور: رقم #${booking.queue_number || 1} في طابور اليوم\n\n💵 تفاصيل الفاتورة والحساب:\n• إجمالي الفاتورة: ${totalVal} ج.م\n• العربون المسدد: ${depositVal} ج.م ✓\n• المتبقي للدفع بالصالون: ${remainingVal} ج.م\n\n📍 رابط متابعة دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${booking.id}\n\nأول ما يقرب دورك في نفس اليوم هنبعتلك تذكير فوري لتجهيز الكرسي لك! نتشرف بزيارتك 💈✨`;
          sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
        }).catch(() => {});
      }
    } else if (status === 'rejected' && booking.customer_phone) {
      import('../services/whatsapp.service.js').then(({ sendWhatsAppText }) => {
        const clientName = booking.customer_name || 'عزيزنا العميل';
        const msg = `عزيزنا ${clientName}، نعتذر منك، لم يتم اعتماد إيصال التحويل للحجز رقم #${booking.id}.\nالسبب: ${reason || 'المبلغ أو الصورة غير واضحة'}\nيرجى التواصل مع إدارة الصالون أو إعادة إرسال الإيصال. 💈`;
        sendWhatsAppText(booking.customer_phone, msg).catch(() => {});
      }).catch(() => {});
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

export default router;
