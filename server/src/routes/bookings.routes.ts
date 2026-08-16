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
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// GET /api/bookings/track?q=... (Public Search & Track Booking)
router.get('/track', async (req, res: Response) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الهاتف أو رقم الحجز' });
    }

    const cleanPhone = q.replace(/\s+/g, '');

    // Search by ID, Phone, or Secure Token
    const rows = await query<any[]>(
      `SELECT * FROM bookings 
       WHERE id = ? OR customer_phone = ? OR secure_token = ?
       ORDER BY created_at DESC LIMIT 5`,
      [q, cleanPhone, q]
    );

    const detailedBookings = await Promise.all(rows.map((b) => getBookingById(b.id)));

    return res.json({
      success: true,
      data: detailedBookings,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bookings (Protected / Staff view)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    const rows = await query<any[]>(sql, params);
    const detailed = await Promise.all(rows.map((b) => getBookingById(b.id)));

    return res.json({ success: true, data: detailed });
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
  validateBody(updateBookingStatusSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, note } = req.body;
      const booking = await getBookingById(req.params.id);
      if (!booking) {
        return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
      }

      await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);

      // Free chair if completed or cancelled
      if ((status === 'completed' || status === 'cancelled') && booking.chair_id) {
        await query(
          'UPDATE chairs SET status = "available", current_booking_id = NULL, service_ends_at = NULL WHERE id = ?',
          [booking.chair_id]
        );
      }

      // Record Audit
      await query(
        `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user?.id,
          req.user?.full_name,
          req.user?.role,
          `STATUS_${status.toUpperCase()}`,
          'bookings',
          req.params.id,
          JSON.stringify({ to_status: status, note }),
          req.ip,
        ]
      );

      const updated = await getBookingById(req.params.id);
      broadcastToBranch(booking.branch_id, 'SYNC_STATE', updated);
      broadcastGlobal('SYNC_STATE', { bookingId: req.params.id, status });

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

// PATCH /api/bookings/:id/payment-proof (Review Payment Proof)
router.patch('/:id/payment-proof', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, reason } = req.body;
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
    }

    const reviewedAt = new Date().toISOString();

    await query(
      `UPDATE payment_proofs 
       SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = ? 
       WHERE booking_id = ?`,
      [status, req.user?.id, reason || null, reviewedAt, req.params.id]
    );

    // If approved, update booking status to confirmed
    const nextBookingStatus = status === 'approved' ? 'confirmed' : 'rejected';
    await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [
      nextBookingStatus,
      req.params.id,
    ]);

    broadcastToBranch(booking.branch_id, 'PAYMENT_PROOF_REVIEWED', {
      bookingId: req.params.id,
      status,
    });
    broadcastGlobal('SYNC_STATE');

    return res.json({ success: true, message: 'تمت مراجعة وتحديث حالة الإيصال بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
