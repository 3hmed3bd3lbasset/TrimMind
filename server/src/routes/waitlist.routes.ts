import { Router, Request, Response } from 'express';
import {
  joinWaitlist,
  getBranchWaitlist,
  claimWaitlistOffer,
  promoteWaitlistEntry,
} from '../services/waitlist.service.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimiter.js';
import { query } from '../config/database.js';

const router = Router();

// 1. POST /api/waitlist (Public - Join Waitlist)
router.post('/', bookingLimiter, async (req: Request, res: Response) => {
  try {
    const { branchId, barberId, customerName, customerPhone, preferredDate, preferredTimeWindow, serviceId } = req.body;

    if (!customerName || !customerPhone || !preferredDate) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الاسم ورقم الهاتف والتاريخ المطلوب.' });
    }

    const entry = await joinWaitlist({
      branchId: branchId || 'branch-elhdad',
      barberId,
      customerName,
      customerPhone,
      preferredDate,
      preferredTimeWindow,
      serviceId,
    });

    return res.status(201).json({
      success: true,
      message: 'تم تسجيلك بنجاح في قائمة الانتظار الذكية. سنقوم بإشعارك فور فتح أي موعد شاغر!',
      data: entry,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// 2. GET /api/waitlist/branch/:branchId (Staff only - List Waitlist)
router.get('/branch/:branchId', requireAuth, requireRoles('manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;
    const date = req.query.date as string;
    const entries = await getBranchWaitlist(branchId, date);
    return res.json({ success: true, data: entries });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /api/waitlist/:id/promote (Staff only - Manually promote entry to offer)
router.post('/:id/promote', requireAuth, requireRoles('manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const result = await promoteWaitlistEntry(req.params.id);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// 4. GET /api/waitlist/claim/:token (Public - Check Claim Offer)
router.get('/claim/:token', async (req: Request, res: Response) => {
  try {
    const cleanToken = req.params.token.trim().toUpperCase();
    const rows = await query<any[]>(
      `SELECT w.*, b.name as branch_name, bar.full_name as barber_name, s.name as service_name, s.price as service_price
       FROM waitlist_entries w
       LEFT JOIN branches b ON w.branch_id = b.id
       LEFT JOIN barbers bar ON w.barber_id = bar.id
       LEFT JOIN services s ON w.service_id = s.id
       WHERE w.offer_token = ? AND w.status = 'offered' AND w.offer_expires_at > NOW() LIMIT 1`,
      [cleanToken]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'عرض حجز الموعد غير متاح أو انتهت صلاحيته.' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST /api/waitlist/claim/:token (Public - Claim Offer and Create Booking)
router.post('/claim/:token', bookingLimiter, async (req: Request, res: Response) => {
  try {
    const result = await claimWaitlistOffer(req.params.token);
    return res.status(201).json({
      success: true,
      message: 'تم حجز الموعد بنجاح وتأكيده من قائمة الانتظار!',
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
