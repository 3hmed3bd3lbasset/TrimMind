import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { createBooking, cancelBooking, getBookingById } from '../services/booking.service.js';
import { getBranchQueue } from '../services/queue.service.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';
import { AGENT_API_SECRET } from '../config/jwt.js';
import { agentToolsLimiter } from '../middleware/rateLimiter.js';
import { container } from '../index.js';

const router = Router();

// ============================================================================
// Security & Authentication Middleware for Agent Tools (Constant-Time Verification)
// ============================================================================
function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-agent-secret'] || req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const providedKey = ((secretHeader as string) || bearerToken || '').trim();

  if (!providedKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized access to Agent Tools API. Secret token required.',
    });
    return;
  }

  try {
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(AGENT_API_SECRET);

    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      res.status(401).json({
        success: false,
        error: 'Invalid secret token for Agent Tools API.',
      });
      return;
    }
  } catch {
    res.status(401).json({
      success: false,
      error: 'Authentication failed for Agent Tools API.',
    });
    return;
  }

  next();
}

router.use(requireAgentAuth);
router.use(agentToolsLimiter);

// Helper function to clean and normalize Egyptian phone numbers
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D+/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

// In-memory live mirror for backward compatibility and fast access
export const liveSyncedBookings: any[] = [];
export const liveSyncedState: {
  branches: any[];
  services: any[];
  barbers: any[];
  settings: any;
} = {
  branches: [],
  services: [],
  barbers: [],
  settings: null,
};

// ============================================================================
// 1. Session Persistence & Context Resolution (Database-First Single Source of Truth)
// ============================================================================

// POST /api/agent-tools/session/resolve
router.post('/session/resolve', async (req: Request, res: Response) => {
  try {
    const { phone, remoteJid, pushName } = req.body;
    const cleanPhone = normalizePhone(phone || remoteJid || '');

    if (!cleanPhone && !remoteJid) {
      return res.status(400).json({ success: false, error: 'Phone number or remoteJid is required' });
    }

    const session = await container.conversationSessionRepo.getOrCreate(cleanPhone || remoteJid, remoteJid);
    const recentMessages = await container.conversationSessionRepo.getRecentMessages(session.id, 15);

    // Fetch active booking if linked or find latest pending/awaiting_payment booking in DB
    let activeBooking = null;
    if (session.activeBookingId) {
      activeBooking = await getBookingById(session.activeBookingId).catch(() => null);
    }

    if (!activeBooking && cleanPhone) {
      const activeRows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?) 
           AND status IN ('draft', 'custom_pricing_requested', 'awaiting_payment', 'payment_submitted', 'pending_review', 'confirmed', 'customer_arrived', 'in_service')
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, cleanPhone.replace(/^0/, '20')]
      ).catch(() => []);

      if (activeRows && activeRows.length > 0) {
        activeBooking = await getBookingById(activeRows[0].id).catch(() => null);
        if (activeBooking) {
          await container.conversationSessionRepo.update(session.id, { activeBookingId: activeBooking.id });
          session.activeBookingId = activeBooking.id;
        }
      }
    }

    // Customer summary
    const pastBookings = cleanPhone ? await query<any[]>(
      `SELECT status, booking_date FROM bookings WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 10`,
      [cleanPhone]
    ).catch(() => []) : [];

    const visitsCount = pastBookings.filter((b) => b.status === 'completed').length;
    const isCustomerKnown = visitsCount > 0 || (pastBookings.length > 0 && Boolean(pastBookings[0]?.customer_name));

    return res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          phone: session.customerPhone,
          remoteJid: session.whatsappRemoteJid,
          state: session.state,
          activeBookingId: session.activeBookingId,
          pendingEntities: session.pendingEntities || {},
          lastIntent: session.lastIntent,
          humanHandoffActive: session.humanHandoffActive,
          humanHandoffExpiresAt: session.humanHandoffExpiresAt,
          lastMessageAt: session.lastMessageAt,
        },
        activeBooking,
        customer: {
          phone: cleanPhone,
          pushName: pushName || '',
          isKnown: isCustomerKnown,
          totalVisits: visitsCount,
        },
        recentMessages,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent-tools/session/record-message
router.post('/session/record-message', async (req: Request, res: Response) => {
  try {
    const { sessionId, phone, whatsappMessageId, role = 'customer', content, extractedIntent } = req.body;

    let targetSessionId = sessionId;
    if (!targetSessionId && phone) {
      const cleanPhone = normalizePhone(phone);
      const session = await container.conversationSessionRepo.getOrCreate(cleanPhone);
      targetSessionId = session.id;
    }

    if (!targetSessionId) {
      return res.status(400).json({ success: false, error: 'sessionId or phone is required' });
    }

    const result = await container.conversationSessionRepo.recordMessage(targetSessionId, {
      whatsappMessageId,
      role,
      content: content || '',
      extractedIntent,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent-tools/session/update-state
router.post('/session/update-state', async (req: Request, res: Response) => {
  try {
    const { sessionId, phone, state, activeBookingId, pendingEntities, lastIntent } = req.body;

    let targetSessionId = sessionId;
    if (!targetSessionId && phone) {
      const cleanPhone = normalizePhone(phone);
      const session = await container.conversationSessionRepo.getOrCreate(cleanPhone);
      targetSessionId = session.id;
    }

    if (!targetSessionId) {
      return res.status(400).json({ success: false, error: 'sessionId or phone is required' });
    }

    await container.conversationSessionRepo.update(targetSessionId, {
      state,
      activeBookingId,
      pendingEntities,
      lastIntent,
    });

    return res.json({ success: true, message: 'Session state updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent-tools/handoff/request
router.post('/handoff/request', async (req: Request, res: Response) => {
  try {
    const { phone, customerName, reason, message } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const session = await container.conversationSessionRepo.getOrCreate(cleanPhone);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await container.conversationSessionRepo.update(session.id, {
      humanHandoffActive: true,
      humanHandoffExpiresAt: expiresAt,
      state: 'HUMAN_HANDOFF',
    });

    // Mark active booking if exists
    if (session.activeBookingId) {
      await query(
        'UPDATE bookings SET needs_human_attention = 1, handoff_expires_at = ? WHERE id = ?',
        [new Date(expiresAt), session.activeBookingId]
      ).catch(() => {});
    }

    // Log analytics
    await query(
      `INSERT INTO whatsapp_analytics_logs (id, phone, event_type, metadata, created_at)
       VALUES (?, ?, 'human_handoff_requested', ?, NOW())`,
      [uuidv4(), cleanPhone, JSON.stringify({ reason, message, customerName })]
    ).catch(() => {});

    // Broadcast to Reception Staff
    broadcastToBranch('branch-elhdad', 'HUMAN_HANDOFF_REQUESTED', {
      phone: cleanPhone,
      customerName: customerName || 'عميل واتساب',
      reason: reason || 'طلب التحدث مع موظف خدمة العملاء',
      message: message || '',
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'تم تحويل المحادثة لموظف الاستقبال بنجاح',
      data: {
        humanHandoffActive: true,
        expiresAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 2. Customer Lookup & History
// ============================================================================
router.post('/customer/lookup', async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body.phone || req.body.phoneNumber || '';
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح' });
    }

    const pastBookings = await query<any[]>(
      `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN branches br ON b.branch_id = br.id
       WHERE (b.customer_phone = ? OR b.customer_phone = ?)
       ORDER BY b.created_at DESC LIMIT 5`,
      [cleanPhone, cleanPhone.replace(/^0/, '20')]
    );

    const isExistingCustomer = pastBookings.length > 0;
    const customerName = pastBookings[0]?.customer_name || null;
    const preferredBarber = pastBookings[0]?.barber_name || null;
    const preferredBranchId = pastBookings[0]?.branch_id || null;
    const noShowCount = pastBookings.filter((b) => b.no_show_marked_at || (b.cancellation_reason && b.cancellation_reason.includes('no-show'))).length;
    const totalVisits = pastBookings.filter((b) => b.status === 'completed').length;
    const reliabilityScore = pastBookings.length > 0 ? Math.round((totalVisits / Math.max(1, totalVisits + noShowCount)) * 100) : 100;

    return res.json({
      success: true,
      data: {
        phone: cleanPhone,
        customerName,
        isExistingCustomer,
        totalVisits,
        noShowCount,
        reliabilityScore,
        preferredBarber,
        preferredBranchId,
        recentBookings: pastBookings.map((b) => ({
          id: b.id,
          status: b.status,
          serviceName: b.service_name,
          barberName: b.barber_name,
          branchName: b.branch_name,
          bookingDate: b.booking_date,
          startsAt: b.starts_at,
          total: b.total_at_booking,
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 3. Branches & Salon Data
// ============================================================================
router.post('/branches/list', async (_req: Request, res: Response) => {
  try {
    const branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 ORDER BY name ASC');
    return res.json({
      success: true,
      data: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        openingTime: b.opening_time || '10:00',
        closingTime: b.closing_time || '23:30',
        totalChairs: b.total_chairs || 4,
        paymentAccounts: {
          vodafoneCash: b.vodafone_cash || '01005437633',
          instapay: b.instapay_username || '01005437633',
          depositRequired: 50,
        },
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 4. Services & Packages List
// ============================================================================
router.post('/services/list', async (req: Request, res: Response) => {
  try {
    const { category } = req.body;
    let sql = 'SELECT * FROM services WHERE is_active = 1 OR is_active IS NULL';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY price ASC';

    const services = await query<any[]>(sql, params);

    return res.json({
      success: true,
      data: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: Number(s.price),
        durationMinutes: s.duration_minutes || 30,
        category: s.category || 'general',
        isVipOnly: Boolean(s.is_vip_only),
        aliases: s.aliases ? (typeof s.aliases === 'string' ? JSON.parse(s.aliases) : s.aliases) : [],
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent-tools/packages/list
router.post('/packages/list', async (_req: Request, res: Response) => {
  try {
    const packages = await query<any[]>(
      `SELECT * FROM services 
       WHERE (category = 'vip' OR is_vip_only = 1 OR bundle_service_ids IS NOT NULL) 
         AND (is_active = 1 OR is_active IS NULL) 
       ORDER BY price ASC`
    );

    return res.json({
      success: true,
      data: packages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        durationMinutes: p.duration_minutes || 60,
        isVipOnly: true,
        bundledServiceIds: p.bundle_service_ids ? (typeof p.bundle_service_ids === 'string' ? JSON.parse(p.bundle_service_ids) : p.bundle_service_ids) : [],
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/agent-tools/packages/details
router.post('/packages/details', async (req: Request, res: Response) => {
  try {
    const { packageId } = req.body;
    if (!packageId) {
      return res.status(400).json({ success: false, error: 'packageId is required' });
    }

    const rows = await query<any[]>(
      'SELECT * FROM services WHERE id = ? OR name LIKE ? LIMIT 1',
      [packageId, `%${packageId}%`]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'الباقة غير موجودة' });
    }

    const p = rows[0];
    let bundledServices: any[] = [];
    if (p.bundle_service_ids) {
      const ids = typeof p.bundle_service_ids === 'string' ? JSON.parse(p.bundle_service_ids) : p.bundle_service_ids;
      if (Array.isArray(ids) && ids.length > 0) {
        bundledServices = await query<any[]>(
          `SELECT id, name, price, duration_minutes FROM services WHERE id IN (?)`,
          [ids]
        ).catch(() => []);
      }
    }

    return res.json({
      success: true,
      data: {
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        durationMinutes: p.duration_minutes || 60,
        isVipOnly: Boolean(p.is_vip_only),
        bundledServices,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 5. Barbers List
// ============================================================================
router.post('/barbers/list', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.body;
    let sql = `
      SELECT bar.*, br.name as branch_name 
      FROM barbers bar
      LEFT JOIN branches br ON bar.branch_id = br.id
      WHERE bar.is_active = 1 OR bar.is_active IS NULL
    `;
    const params: any[] = [];

    if (branchId) {
      sql += ' AND (bar.branch_id = ? OR bar.branch_id IS NULL)';
      params.push(branchId);
    }

    const barbers = await query<any[]>(sql, params);

    return res.json({
      success: true,
      data: barbers.map((b) => ({
        id: b.id,
        name: b.full_name || b.name,
        specialty: b.specialty || 'مصفف محترف',
        rating: Number(b.rating || 4.9),
        ratingCount: b.rating_count || b.ratingCount || 0,
        branchId: b.branch_id || b.branchId,
        branchName: b.branch_name || 'صالون الحداد VIP',
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. Booking Settings (Database-First Source of Truth)
// ============================================================================
router.post('/settings/booking', async (_req: Request, res: Response) => {
  try {
    const settingsRows = await query<any[]>('SELECT `key`, `value` FROM settings').catch(() => []);
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach((r) => {
      settingsMap[r.key] = r.value;
    });

    const branch = (await query<any[]>('SELECT * FROM branches WHERE is_active = 1 LIMIT 1'))?.[0];

    const depositNormal = Number(settingsMap['booking_fee_normal'] || 50);
    const depositVip = Number(settingsMap['booking_fee_vip'] || 100);
    const instapay = settingsMap['instapay_username'] || branch?.instapay_username || '01005437633';
    const vodafoneCash = settingsMap['vodafone_cash_number'] || branch?.vodafone_cash || '01005437633';

    return res.json({
      success: true,
      data: {
        depositAmounts: {
          normal: depositNormal,
          vip: depositVip,
        },
        paymentAccounts: {
          instapay,
          vodafoneCash,
        },
        operatingHours: {
          openingTime: branch?.opening_time || '10:00',
          closingTime: branch?.closing_time || '23:30',
        },
        salonName: 'TrimMind — صالون الحداد VIP',
        trackingBaseUrl: 'https://trimmind.up.railway.app/track',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 7. Real DB Availability Check
// ============================================================================
router.post('/availability/check', async (req: Request, res: Response) => {
  try {
    const { branchId, barberId, serviceId, serviceIds = [], date, startsAt } = req.body;
    const targetDate = (date || startsAt || new Date().toISOString()).split('T')[0];

    const branches = await query<any[]>('SELECT * FROM branches WHERE (id = ? OR is_active = 1) LIMIT 1', [branchId || '']);
    const branch = branches[0] || {
      id: 'branch-elhdad',
      name: 'صالون الحداد VIP',
      opening_time: '10:00',
      closing_time: '23:30',
      total_chairs: 4,
    };

    // Calculate requested duration
    let totalDurationMinutes = 30;
    const allServiceIds = serviceId ? [serviceId, ...serviceIds] : serviceIds;
    if (allServiceIds.length > 0) {
      const srvRows = await query<any[]>(
        `SELECT duration_minutes FROM services WHERE id IN (?)`,
        [allServiceIds]
      ).catch(() => []);
      if (srvRows && srvRows.length > 0) {
        totalDurationMinutes = srvRows.reduce((sum, s) => sum + Number(s.duration_minutes || 30), 0);
      }
    }

    if (startsAt) {
      const requestedStart = new Date(startsAt.includes('T') ? startsAt : startsAt.replace(' ', 'T'));
      const requestedEnd = new Date(requestedStart.getTime() + totalDurationMinutes * 60 * 1000);
      const startStr = requestedStart.toISOString().replace('T', ' ').substring(0, 19);
      const endStr = requestedEnd.toISOString().replace('T', ' ').substring(0, 19);

      // Check barber specific conflict
      if (barberId) {
        const barberConflicts = await query<any[]>(
          `SELECT id, customer_name, starts_at, ends_at FROM bookings
           WHERE barber_id = ?
             AND booking_date = ?
             AND status IN ('confirmed', 'awaiting_payment', 'payment_submitted', 'pending_review', 'customer_arrived', 'in_service')
             AND (starts_at < ? AND (ends_at > ? OR starts_at >= ?))
           LIMIT 1`,
          [barberId, targetDate, endStr, startStr, startStr]
        );

        if (barberConflicts && barberConflicts.length > 0) {
          return res.json({
            success: true,
            data: {
              branchId: branch.id,
              branchName: branch.name,
              date: targetDate,
              isSlotAvailable: false,
              conflictReason: 'الكابتن المطلوب محجوز في هذا الوقت المحدد',
              suggestedAlternative: 'يمكنك اختيار كابتن آخر أو حجز موعد بعد 45 دقيقة',
            },
          });
        }
      }

      // Check branch chairs capacity
      const totalChairs = Number(branch.total_chairs || 4);
      const concurrentBookings = await query<any[]>(
        `SELECT COUNT(*) as count FROM bookings
         WHERE (branch_id = ? OR branch_id IS NULL)
           AND booking_date = ?
           AND status IN ('confirmed', 'awaiting_payment', 'payment_submitted', 'pending_review', 'customer_arrived', 'in_service')
           AND starts_at < ? AND (ends_at > ? OR starts_at >= ?)`,
        [branch.id, targetDate, endStr, startStr, startStr]
      );

      const activeCount = Number(concurrentBookings[0]?.count || 0);
      if (activeCount >= totalChairs) {
        return res.json({
          success: true,
          data: {
            branchId: branch.id,
            branchName: branch.name,
            date: targetDate,
            isSlotAvailable: false,
            conflictReason: 'كافة كراسي الصالون مشغولة في هذا التوقيت',
            suggestedAlternative: 'المواعيد ممتلئة تماماً، يمكنك الانضمام لقائمة الانتظار الذكية وسنبلغك فور إلغاء أي موعد',
          },
        });
      }

      return res.json({
        success: true,
        data: {
          branchId: branch.id,
          branchName: branch.name,
          date: targetDate,
          isSlotAvailable: true,
          conflictReason: null,
          openingTime: branch.opening_time || '10:00',
          closingTime: branch.closing_time || '23:30',
          estimatedWaitTimeMinutes: 5,
        },
      });
    }

    // If only date provided
    return res.json({
      success: true,
      data: {
        branchId: branch.id,
        branchName: branch.name,
        date: targetDate,
        isSlotAvailable: true,
        openingTime: branch.opening_time || '10:00',
        closingTime: branch.closing_time || '23:30',
        availableTimeSlots: ['14:00', '15:30', '17:00', '18:30', '20:00', '21:30'],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 8. Create Pending Booking (Idempotent + Complete HTTP Response)
// ============================================================================
router.post('/bookings/create-pending', async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      phone,
      branchId,
      barberId,
      serviceId,
      additionalServiceIds = [],
      bookingType = 'normal',
      startsAt,
      idempotencyKey,
      notes,
    } = req.body;

    const rawPhone = customerPhone || phone || req.body.phoneNumber || '';
    const finalCustomerName = (customerName || req.body.name || req.body.clientName || 'عميل الصالون').trim();
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'بيانات الحجز غير مكتملة (رقم الهاتف مطلوب وصحيح).',
      });
    }

    // Check Idempotency Key via WebhookEventRepository
    if (idempotencyKey) {
      const existingEvent = await container.webhookEventRepo.find(idempotencyKey);
      if (existingEvent) {
        return res.json({
          success: true,
          message: 'تم استرجاع الحجز المسجل مسبقاً بنجاح (Idempotency Safe).',
          data: existingEvent.payload,
        });
      }
    }

    const branchRows = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 LIMIT 1');
    const finalBranchId = branchId || branchRows[0]?.id || 'branch-elhdad';
    const branchRow = branchRows[0];

    // Resolve service from DB
    let matchedService = null;
    if (serviceId) {
      const srvRows = await query<any[]>(
        'SELECT * FROM services WHERE id = ? OR name LIKE ? LIMIT 1',
        [serviceId, `%${serviceId}%`]
      );
      if (srvRows && srvRows.length > 0) {
        matchedService = srvRows[0];
      }
    }
    if (!matchedService) {
      const defaultSrv = await query<any[]>('SELECT * FROM services WHERE is_active = 1 ORDER BY price ASC LIMIT 1');
      matchedService = defaultSrv[0] || { id: 'srv-haircut', name: 'قص شعر كلاسيكي', price: 180, duration_minutes: 30 };
    }

    const resolvedPrice = Number(matchedService.price || 180);
    const resolvedBookingType = (bookingType === 'vip' || matchedService.is_vip_only || matchedService.name?.toLowerCase().includes('vip')) ? 'vip' : 'normal';

    const settingsRows = await query<any[]>('SELECT `key`, `value` FROM settings').catch(() => []);
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach((r) => { settingsMap[r.key] = r.value; });

    const depositRequired = resolvedBookingType === 'vip'
      ? Number(settingsMap['booking_fee_vip'] || 100)
      : Number(settingsMap['booking_fee_normal'] || 50);

    let finalStartsAt = startsAt || `${new Date().toISOString().split('T')[0]} 16:00:00`;
    const currentYear = new Date().getFullYear().toString();
    if (finalStartsAt.startsWith('2025') || finalStartsAt.startsWith('2024') || finalStartsAt.startsWith('2023')) {
      finalStartsAt = finalStartsAt.replace(/^\d{4}/, currentYear);
    }

    const payload = {
      customerName: finalCustomerName,
      customerPhone: cleanPhone,
      branchId: finalBranchId,
      barberId: barberId || null,
      serviceId: matchedService.id,
      additionalServiceIds,
      bookingType: resolvedBookingType,
      startsAt: finalStartsAt,
      notes: notes || 'تم الحجز عبر مساعد واتساب الذكي',
    };

    const instapayHandle = settingsMap['instapay_username'] || branchRow?.instapay_username || '01005437633';
    const vodafoneCashNumber = settingsMap['vodafone_cash_number'] || branchRow?.vodafone_cash || '01005437633';

    const newBooking = await createBooking(payload, { role: 'whatsapp_agent' }, req.ip);

    const bookingData = {
      id: newBooking.id,
      bookingId: newBooking.id,
      customer_name: newBooking.customer_name,
      customerName: newBooking.customer_name,
      customer_phone: cleanPhone,
      customerPhone: cleanPhone,
      service_id: payload.serviceId,
      service_name: matchedService.name,
      serviceName: matchedService.name,
      booking_type: resolvedBookingType,
      bookingType: resolvedBookingType,
      branch_id: finalBranchId,
      branch_name: branchRow?.name || 'صالون الحداد VIP',
      status: newBooking.status,
      queue_number: newBooking.queue_number || 1,
      queueNumber: newBooking.queue_number || 1,
      starts_at: newBooking.starts_at,
      startsAt: newBooking.starts_at,
      booking_fee_at_booking: depositRequired,
      depositRequired,
      total_at_booking: resolvedPrice,
      totalAmount: resolvedPrice,
      secure_token: (newBooking as any).secure_token || `TK-${newBooking.id}`,
      created_at: new Date().toISOString(),
      trackingUrl: `https://trimmind.up.railway.app/track?q=${newBooking.id}`,
      paymentInstructions: {
        instapay: instapayHandle,
        vodafoneCash: vodafoneCashNumber,
        depositRequired,
      },
    };

    // Update conversation session in DB
    const session = await container.conversationSessionRepo.getOrCreate(cleanPhone);
    await container.conversationSessionRepo.update(session.id, {
      activeBookingId: newBooking.id,
      state: 'AWAITING_PAYMENT',
      lastIntent: 'booking_created',
    });

    // Save Idempotency Event
    if (idempotencyKey) {
      await container.webhookEventRepo.record({
        id: idempotencyKey,
        source: 'whatsapp_agent_create_pending',
        eventType: 'BOOKING_CREATED',
        payload: bookingData,
      });
    }

    // Mirror to liveSyncedBookings for fast search
    liveSyncedBookings.unshift(bookingData);

    return res.json({
      success: true,
      message: 'تم تسجيل طلب الحجز بنجاح وفي انتظار استلام إثبات سداد العربون لتأكيده.',
      data: bookingData,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 9. Create Custom Booking Request (Custom Services / Dynamic Pricing)
// ============================================================================
router.post('/bookings/create-custom-request', async (req: Request, res: Response) => {
  try {
    const { customerName, phone, requestedServicesText, notes, preferredBarberId, startsAt } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب لطلب الحجز المخصص' });
    }

    const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
    const branchRow = (await query<any[]>('SELECT * FROM branches WHERE is_active = 1 LIMIT 1'))?.[0];
    const defaultService = (await query<any[]>('SELECT id FROM services LIMIT 1'))?.[0];

    const finalCustomerName = (customerName || 'عميل واتساب').trim();
    const finalStartsAt = startsAt || `${new Date().toISOString().split('T')[0]} 16:00:00`;
    const bookingDate = finalStartsAt.split('T')[0].split(' ')[0];

    await query(
      `INSERT INTO bookings 
       (id, customer_name, customer_phone, branch_id, barber_id, service_id, service_name, booking_type, booking_date, starts_at, status, notes, custom_pricing_notes, secure_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'باقة خدمات مخصصة (بانتظار تسعير الاستقبال)', 'vip', ?, ?, 'custom_pricing_requested', ?, ?, ?, NOW(), NOW())`,
      [
        bookingId,
        finalCustomerName,
        cleanPhone,
        branchRow?.id || 'branch-elhdad',
        preferredBarberId || null,
        defaultService?.id || 'srv-haircut',
        bookingDate,
        finalStartsAt,
        notes || 'طلب باقة مخصصة عبر واتساب',
        requestedServicesText || 'طلب مخصص يحتاج تسعير واعتماد من الاستقبال',
        `TK-${bookingId}`,
      ]
    );

    const session = await container.conversationSessionRepo.getOrCreate(cleanPhone);
    await container.conversationSessionRepo.update(session.id, {
      activeBookingId: bookingId,
      state: 'AWAITING_CUSTOM_PRICING',
      lastIntent: 'custom_pricing_requested',
    });

    // Notify Reception Desk in Realtime
    broadcastToBranch(branchRow?.id || 'branch-elhdad', 'CUSTOM_PRICING_REQUESTED', {
      bookingId,
      customerName: finalCustomerName,
      customerPhone: cleanPhone,
      requestedServicesText,
      timestamp: new Date().toISOString(),
    });
    broadcastGlobal('SYNC_STATE', { bookingId, status: 'custom_pricing_requested' });

    return res.json({
      success: true,
      message: 'تم إرسال طلب الباقة المخصصة للاستقبال، وسيتم إرسال الفاتورة المعتمدة وحساب التحويل لك خلال لحظات.',
      data: {
        bookingId,
        status: 'custom_pricing_requested',
        customerName: finalCustomerName,
        phone: cleanPhone,
        requestedServicesText,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 10. Update Draft Booking (Tool: update_booking_draft)
// ============================================================================
router.patch('/bookings/:id/draft', async (req: Request, res: Response) => {
  try {
    const bookingId = req.params.id;
    const { serviceId, serviceName, additionalServiceIds, barberId, barberName, startsAt, notes } = req.body;

    const result = await container.updateBookingDraftUseCase.execute({
      bookingId,
      serviceId,
      serviceName,
      additionalServiceIds,
      barberId,
      barberName,
      startsAt,
      notes,
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.booking,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 11. Queue Status & Position Tracking
// ============================================================================
router.post('/bookings/queue-status', async (req: Request, res: Response) => {
  try {
    const { bookingId, phone } = req.body;
    const cleanPhone = normalizePhone(phone);

    let booking = null;
    if (bookingId) {
      booking = await getBookingById(bookingId.trim().toUpperCase()).catch(() => null);
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?) 
           AND status NOT IN ('completed', 'cancelled', 'rejected')
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, cleanPhone.replace(/^0/, '20')]
      );
      if (rows && rows.length > 0) {
        booking = await getBookingById(rows[0].id).catch(() => null);
      }
    }

    if (!booking) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على حجز نشط' });
    }

    const queueData = await getBranchQueue(booking.branch_id || 'branch-elhdad');
    const myPos = queueData.findIndex((b: any) => b.id === booking.id || b.booking_id === booking.id);
    const clientsAhead = myPos >= 0 ? myPos : Math.max(0, (booking.queue_number || 1) - 1);
    const estimatedMinutes = Math.max(5, clientsAhead * 25);

    return res.json({
      success: true,
      data: {
        bookingId: booking.id,
        customerName: booking.customer_name,
        status: booking.status,
        queueNumber: booking.queue_number,
        clientsAhead,
        estimatedWaitTimeMinutes: estimatedMinutes,
        trackingUrl: `https://trimmind.up.railway.app/track?q=${booking.id}`,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 12. Confirm Arrival
// ============================================================================
router.post('/bookings/confirm-arrival', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId } = req.body;
    const cleanPhone = normalizePhone(phone);

    let targetBooking = null;
    if (bookingId) {
      targetBooking = await getBookingById(bookingId.trim().toUpperCase()).catch(() => null);
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?) 
           AND status IN ('confirmed', 'awaiting_payment', 'pending_review', 'payment_submitted')
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, cleanPhone.replace(/^0/, '20')]
      );
      if (rows && rows.length > 0) {
        targetBooking = await getBookingById(rows[0].id).catch(() => null);
      }
    }

    if (!targetBooking) {
      return res.json({
        success: true,
        message: 'يا ألف مرحب بيك يا بطل! 👑 تم إبلاغ موظف الاستقبال بوجودك لتجهيز الكرسي لك فوراً! 💈✨',
        data: { status: 'customer_arrived' },
      });
    }

    await query('UPDATE bookings SET status = "customer_arrived", updated_at = NOW() WHERE id = ?', [targetBooking.id]);

    broadcastToBranch(targetBooking.branch_id || 'branch-elhdad', 'CUSTOMER_ARRIVED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name,
    });
    broadcastGlobal('SYNC_STATE', { bookingId: targetBooking.id, status: 'customer_arrived' });

    return res.json({
      success: true,
      message: `يا ألف مرحب بيك يا ${targetBooking.customer_name || 'باشا'}! 👑 تم تسجيل وصولك في شاشة الاستقبال، والكرسي بيجهزلك حالاً! 💈✨`,
      data: {
        bookingId: targetBooking.id,
        status: 'customer_arrived',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 13. Cancel Booking (Strict Security Ownership Verification)
// ============================================================================
router.post('/bookings/cancel', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId, reason } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!cleanPhone && !bookingId) {
      return res.status(400).json({
        success: false,
        error: 'يرجى تزويد رقم الهاتف المسجل لتأكيد الإلغاء.',
      });
    }

    let booking: any = null;
    if (bookingId) {
      booking = await getBookingById(bookingId.trim().toUpperCase());
      if (booking && cleanPhone) {
        const bPhone = normalizePhone(booking.customer_phone);
        if (bPhone !== cleanPhone) {
          return res.status(403).json({ success: false, error: 'رقم الهاتف غير مطابق لبيانات الحجز المطلوب إلغاؤه.' });
        }
      }
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?)
           AND status NOT IN ('cancelled', 'completed', 'rejected')
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, cleanPhone.replace(/^0/, '20')]
      );
      if (rows && rows.length > 0) {
        booking = await getBookingById(rows[0].id);
      }
    }

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على أي حجز نشط مرتبط برقمك لإلغائه.',
      });
    }

    if (booking.status === 'completed' || booking.status === 'in_service') {
      return res.status(400).json({
        success: false,
        error: 'لا يمكن إلغاء الحجز لأنه قيد الخدمة أو تم إنجازه بالفعل.',
      });
    }

    await cancelBooking(booking.id, reason || 'تم الإلغاء بناءً على طلب العميل عبر واتساب', {
      role: 'customer_via_whatsapp',
      phone: cleanPhone,
    });

    return res.json({
      success: true,
      message: `تم إلغاء الحجز #${booking.id} بنجاح.`,
      data: {
        bookingId: booking.id,
        status: 'cancelled',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 14. Reschedule Booking (Strict Conflict & Ownership Verification)
// ============================================================================
router.post('/bookings/reschedule', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId, newStartsAt, barberId } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!bookingId || !cleanPhone || !newStartsAt) {
      return res.status(400).json({
        success: false,
        error: 'يرجى تزويد رقم الحجز ورقم الهاتف والموعد الجديد المطلوب.',
      });
    }

    const booking = await getBookingById(bookingId.trim().toUpperCase());
    if (!booking) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود.' });
    }

    const storedPhoneClean = normalizePhone(booking.customer_phone);
    if (storedPhoneClean !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'رقم الهاتف غير مطابق لبيانات الحجز.',
      });
    }

    const newDate = newStartsAt.split('T')[0].split(' ')[0];
    const newBarberId = barberId || booking.barber_id;

    if (newBarberId) {
      const conflict = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE barber_id = ? AND booking_date = ? AND starts_at = ? 
           AND id != ? AND status NOT IN ('cancelled', 'rejected') LIMIT 1`,
        [newBarberId, newDate, newStartsAt, booking.id]
      );
      if (conflict && conflict.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'الموعد الجديد محجوز مسبقاً لدى هذا الكابتن، يرجى اختيار موعد آخر.',
        });
      }
    }

    await query(
      `UPDATE bookings 
       SET starts_at = ?, booking_date = ?, barber_id = ?, updated_at = NOW() 
       WHERE id = ?`,
      [newStartsAt, newDate, newBarberId, booking.id]
    );

    broadcastToBranch(booking.branch_id, 'BOOKING_UPDATED', { bookingId: booking.id });
    broadcastGlobal('SYNC_STATE', { bookingId: booking.id, starts_at: newStartsAt });

    return res.json({
      success: true,
      message: `تم تعديل موعد الحجز #${booking.id} بنجاح إلى ${newStartsAt}.`,
      data: {
        bookingId: booking.id,
        newStartsAt,
        newDate,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 15. Submit Payment Proof (Clean Architecture & Database-Backed)
// ============================================================================
router.post('/payments/submit-proof', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId, proofImageUrl, senderPhone, paymentMethod, transferredAmount } = req.body;
    const cleanPhone = normalizePhone(phone || senderPhone);

    let resolvedBookingId = bookingId ? bookingId.trim().toUpperCase() : null;

    if (!resolvedBookingId && cleanPhone) {
      const session = await container.conversationSessionRepo.getByPhone(cleanPhone);
      if (session?.activeBookingId) {
        resolvedBookingId = session.activeBookingId;
      }
    }

    if (!resolvedBookingId && cleanPhone) {
      const activeRows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?) 
           AND status IN ('awaiting_payment', 'custom_pricing_requested', 'draft', 'pending_review')
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, cleanPhone.replace(/^0/, '20')]
      );
      if (activeRows && activeRows.length > 0) {
        resolvedBookingId = activeRows[0].id;
      }
    }

    if (!resolvedBookingId) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على أي حجز نشط بانتظار سداد العربون مرتبط برقمك. يرجى تزويد رقم الحجز.',
      });
    }

    const result = await container.submitPaymentProofUseCase.execute({
      bookingId: resolvedBookingId,
      senderPhone: cleanPhone,
      imagePath: proofImageUrl || 'https://trimmind.up.railway.app/uploads/receipt.png',
      paymentMethod: paymentMethod || 'instapay',
      transferredAmount: Number(transferredAmount || 50),
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    return res.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 16. Smart Waitlist Tools
// ============================================================================
router.post('/waitlist/join', async (req: Request, res: Response) => {
  try {
    const { branchId, barberId, serviceId, customerName, customerPhone, preferredDate, preferredTimeRange } = req.body;
    const cleanPhone = normalizePhone(customerPhone);

    const result = await container.joinWaitlistUseCase.execute({
      branchId: branchId || 'branch-elhdad',
      barberId,
      serviceId,
      customerName,
      customerPhone: cleanPhone,
      preferredDate,
      preferredTimeWindow: preferredTimeRange || 'anytime',
    });

    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/waitlist/claim', async (req: Request, res: Response) => {
  try {
    const { offerToken } = req.body;
    const result = await container.claimWaitlistOfferUseCase.execute(offerToken);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/waitlist/status', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    const cleanPhone = normalizePhone(phone);
    const rows = await query<any[]>(
      `SELECT * FROM smart_waitlist WHERE (customer_phone = ? OR customer_phone = ?) AND status IN ('waiting', 'offered') ORDER BY created_at DESC LIMIT 1`,
      [cleanPhone, cleanPhone.replace(/^0/, '20')]
    );
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: { inWaitlist: false } });
    }
    return res.json({ success: true, data: { inWaitlist: true, entry: rows[0] } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 17. No-Show Status Check
// ============================================================================
router.post('/noshow/check', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId } = req.body;
    const cleanPhone = normalizePhone(phone);
    const rows = await query<any[]>(
      `SELECT id, status, cancellation_reason, no_show_marked_at FROM bookings 
       WHERE (id = ? OR customer_phone = ? OR customer_phone = ?) AND (status = 'cancelled' OR status = 'no_show')
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId || '', cleanPhone, cleanPhone.replace(/^0/, '20')]
    );

    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: { isNoShow: false } });
    }

    const b = rows[0];
    const isNoShow = b.status === 'no_show' || (b.cancellation_reason && b.cancellation_reason.includes('no-show'));
    return res.json({
      success: true,
      data: {
        isNoShow,
        bookingId: b.id,
        reason: b.cancellation_reason,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 18. Reminders & Cron Tools
// ============================================================================
router.post('/reminders/upcoming', async (req: Request, res: Response) => {
  try {
    const { hoursAhead = 24 } = req.body;
    const now = new Date();
    const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const bookings = await query<any[]>(
      `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN branches br ON b.branch_id = br.id
       WHERE b.status = 'confirmed'
         AND b.starts_at >= ? AND b.starts_at <= ?
         AND (b.reminder_sent IS NULL OR b.reminder_sent = 0)
       ORDER BY b.starts_at ASC`,
      [now.toISOString(), futureLimit.toISOString()]
    );

    return res.json({ success: true, data: bookings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reminders/mark-sent', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;
    await query('UPDATE bookings SET reminder_sent = 1, reminder_sent_at = NOW() WHERE id = ?', [bookingId]);
    return res.json({ success: true, message: 'Reminder marked as sent' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 19. Smart Customer Recall & AI Insights
// ============================================================================
router.post('/recall/candidates', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', thresholdDays = 30 } = req.body;
    const candidates = await container.findRecallCandidatesUseCase.execute(branchId, Number(thresholdDays));
    return res.json({ success: true, data: candidates });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/recall/campaign/trigger', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', thresholdDays = 30, candidatePhones = [], customMessageTemplate, actorId } = req.body;
    const result = await container.sendRecallCampaignUseCase.execute(
      branchId,
      Number(thresholdDays),
      Array.isArray(candidatePhones) ? candidatePhones : [],
      customMessageTemplate,
      actorId
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/insights/generate', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', periodDays = 30 } = req.body;
    const report = await container.generateInsightsReportUseCase.execute(branchId, Number(periodDays));
    return res.json({ success: true, data: report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/insights/ask', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', question } = req.body;
    const answer = await container.askInsightsAssistantUseCase.execute(branchId, question);
    return res.json({ success: true, data: { answer } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
