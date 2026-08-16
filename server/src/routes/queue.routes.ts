import { Router, Response } from 'express';
import { getBranchQueue, callNextCustomerForBarber } from '../services/queue.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// GET /api/queue/:branchId (Public & TV display)
router.get('/:branchId', async (req, res: Response) => {
  try {
    const queue = await getBranchQueue(req.params.branchId);
    return res.json({ success: true, data: queue });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/queue/call-next (Barber calling next)
router.post('/call-next', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const barberId = req.body.barberId || req.user?.barber_id;
    if (!barberId) {
      return res.status(400).json({ success: false, error: 'معرف الحلاق مطلوب' });
    }

    const event = await callNextCustomerForBarber(barberId, req.user);
    if (!event) {
      return res.status(404).json({ success: false, error: 'لا يوجد عملاء في قائمة الانتظار حالياً' });
    }

    return res.json({ success: true, message: 'تم استدعاء العميل بنجاح', data: event });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/queue/call-entry (Receptionist calling specific customer)
router.post('/call-entry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId, chairId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'معرف الحجز مطلوب' });
    }

    const bookings = await query<any[]>('SELECT * FROM bookings WHERE id = ? LIMIT 1', [bookingId]);
    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود' });
    }
    const b = bookings[0];

    await query('UPDATE bookings SET status = "in_service", chair_id = ?, updated_at = NOW() WHERE id = ?', [
      chairId || b.chair_id,
      bookingId,
    ]);

    if (chairId || b.chair_id) {
      await query(
        'UPDATE chairs SET status = "in_service", current_booking_id = ?, service_ends_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?',
        [bookingId, chairId || b.chair_id]
      );
    }

    const eventPayload = {
      customerName: b.customer_name,
      ticketNumber: `#${b.queue_number || ''}`,
      bookingId: b.id,
      timestamp: Date.now(),
    };

    broadcastToBranch(b.branch_id, 'CUSTOMER_CALLED', eventPayload);
    broadcastGlobal('CUSTOMER_CALLED', eventPayload);

    return res.json({ success: true, message: 'تم استدعاء العميل وتسكينه على الكرسي' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
