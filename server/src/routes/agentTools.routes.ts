import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { createBooking, cancelBooking, getBookingById } from '../services/booking.service.js';
import { getBranchQueue } from '../services/queue.service.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';
import { MySQLWaitlistRepository } from '../adapters/repositories/MySQLWaitlistRepository.js';
import { MySQLBookingRepository } from '../adapters/repositories/MySQLBookingRepository.js';
import { MySQLRecallRepository } from '../adapters/repositories/MySQLRecallRepository.js';
import { SocketRealtimeNotifier } from '../adapters/gateways/SocketRealtimeNotifier.js';
import { JoinWaitlistUseCase } from '../usecases/waitlist/JoinWaitlistUseCase.js';
import { ClaimWaitlistOfferUseCase } from '../usecases/waitlist/ClaimWaitlistOfferUseCase.js';
import { FindRecallCandidatesUseCase } from '../usecases/recall/FindRecallCandidatesUseCase.js';

const router = Router();

// 1. Security & Authentication Middleware for Agent Tools
const AGENT_API_SECRET =
  process.env.AGENT_API_SECRET ||
  process.env.WHATSAPP_AGENT_SECRET ||
  'trim-mind-agent-secret-key-2026';

function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-agent-secret'] || req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const providedKey = (secretHeader as string) || bearerToken;

  if (!providedKey || providedKey !== AGENT_API_SECRET) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized access to Agent Tools API. Valid secret token required in x-agent-secret or Authorization header.',
    });
    return;
  }

  next();
}

router.use(requireAgentAuth);

// Helper function to clean and normalize Egyptian phone numbers
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D+/g, '');
  if (cleaned.startsWith('20')) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// 1. Customer Lookup & History
// ---------------------------------------------------------------------------
router.post('/customer/lookup', async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body.phone || req.body.phoneNumber || '';
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح' });
    }

    // Lookup bookings by this phone
    const pastBookings = await query<any[]>(
      `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN branches br ON b.branch_id = br.id
       WHERE REPLACE(REPLACE(b.customer_phone, ' ', ''), '+', '') LIKE ?
       ORDER BY b.created_at DESC LIMIT 5`,
      [`%${cleanPhone.slice(-9)}%`]
    );

    const isExistingCustomer = pastBookings.length > 0;
    const customerName = pastBookings[0]?.customer_name || null;
    const preferredBarber = pastBookings[0]?.barber_name || null;
    const preferredBranchId = pastBookings[0]?.branch_id || null;

    return res.json({
      success: true,
      data: {
        phone: cleanPhone,
        customerName,
        isExistingCustomer,
        totalVisits: pastBookings.filter((b) => b.status === 'completed').length,
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

export const liveSyncedBookings: any[] = [];

export let liveSyncedState: {
  branches: any[];
  services: any[];
  barbers: any[];
  settings: any;
} = {
  branches: [
    {
      id: 'branch-elhdad',
      name: 'الحداد - ELHDAD',
      address: 'سقيل - مركز أوسيم',
      phone: '01005437633',
      openingTime: '10:00',
      closingTime: '23:30',
      totalChairs: 4,
    },
  ],
  services: [
    {
      id: 'srv-vip-royal',
      name: 'VIP Royal Cut',
      description: 'تجربة ملكية متكاملة لقص الشعر بأعلى مستوى من الدقة (جناح خاص ومكيف، كرسي مساج، شاشة سينما، دخول فوري بدون انتظار)',
      price: 650,
      duration_minutes: 60,
      category: 'vip',
      is_vip_only: 1,
    },
    {
      id: 'srv-vip-gentleman',
      name: 'VIP Gentleman',
      description: 'عناية شاملة ومميزة بالشعر واللحية في أجواء من الخصوصية التامة (جناح خاص، كرسي مساج، شاشة سينما، دخول فوري)',
      price: 650,
      duration_minutes: 90,
      category: 'vip',
      is_vip_only: 1,
    },
    {
      id: 'srv-vip-full',
      name: 'VIP Full Experience',
      description: 'التجربة الكاملة للاسترخاء والعناية الفائقة بالشعر واللحية والبشرة (جناح VIP خاص، مساج، سينما، دخول فوري)',
      price: 750,
      duration_minutes: 120,
      category: 'vip',
      is_vip_only: 1,
    },
    {
      id: 'srv-vip-executive',
      name: 'VIP Executive',
      description: 'الباقة التنفيذية الفاخرة لرجال الأعمال والنخبة (شاملة كل الخدمات والعناية الملكية)',
      price: 900,
      duration_minutes: 130,
      category: 'vip',
      is_vip_only: 1,
    },
    {
      id: 'srv-haircut-classic',
      name: 'قص شعر كلاسيكي',
      description: 'قص وتصفيف شعر احترافي',
      price: 180,
      duration_minutes: 30,
      category: 'hair',
      is_vip_only: 0,
    },
    {
      id: 'srv-haircut-beard',
      name: 'قص شعر + لحية',
      description: 'قص شعر متكامل وتحديد اللحية بالموس والبخار',
      price: 220,
      duration_minutes: 40,
      category: 'hair',
      is_vip_only: 0,
    },
    {
      id: 'srv-fade',
      name: 'تدريج Fade',
      description: 'تدريج دقيق وعصري بأحدث الماكينات',
      price: 180,
      duration_minutes: 35,
      category: 'hair',
      is_vip_only: 0,
    },
    {
      id: 'srv-beard-shape',
      name: 'تحديد لحية',
      description: 'تحديد وتشذيب اللحية مع زيوت العناية',
      price: 100,
      duration_minutes: 30,
      category: 'beard',
      is_vip_only: 0,
    },
    {
      id: 'srv-kids',
      name: 'قص شعر أطفال',
      description: 'قص شعر مميز للأطفال بأمان وعناية خاصة',
      price: 120,
      duration_minutes: 40,
      category: 'hair',
      is_vip_only: 0,
    },
    {
      id: 'srv-skincare',
      name: 'تنظيف بشرة',
      description: 'جلسة تنظيف وتقشير عميق للبشرة بالبخار وماسك نضارة',
      price: 240,
      duration_minutes: 45,
      category: 'skincare',
      is_vip_only: 0,
    },
    {
      id: 'srv-protein',
      name: 'بروتين وترطيب شعر',
      description: 'علاج وترطيب وتغذية الشعر بالبروتين العلاجي',
      price: 300,
      duration_minutes: 60,
      category: 'treatment',
      is_vip_only: 0,
    },
  ],
  barbers: [
    {
      id: 'barber-lead',
      full_name: 'كابتن الصالون الرئيسي',
      specialty: 'خبير قص وتصفيف وتسريحات VIP',
      rating: 4.9,
      rating_count: 38,
      branch_id: 'branch-elhdad',
      branch_name: 'الحداد - ELHDAD',
    },
    {
      id: 'barber-beard-specialist',
      full_name: 'مصفف اللحية والعناية بالبشرة',
      specialty: 'متخصص اللحية الملكية وماسكات البشرة',
      rating: 4.9,
      rating_count: 26,
      branch_id: 'branch-elhdad',
      branch_name: 'الحداد - ELHDAD',
    },
  ],
  settings: null,
};

// Sync live state from web frontend directly
router.post('/sync-store', (req: Request, res: Response) => {
  const { branches, services, barbers, settings } = req.body;
  if (Array.isArray(branches) && branches.length > 0) liveSyncedState.branches = branches;
  if (Array.isArray(services) && services.length > 0) liveSyncedState.services = services;
  if (Array.isArray(barbers) && barbers.length > 0) liveSyncedState.barbers = barbers;
  if (settings) liveSyncedState.settings = settings;
  return res.json({ success: true, message: 'تمت المزامنة الحية بنجاح' });
});

// ---------------------------------------------------------------------------
// 0. Branches List (Live Branches, Address, Working Hours, Phone)
// ---------------------------------------------------------------------------
router.post('/branches/list', async (_req: Request, res: Response) => {
  try {
    let branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 ORDER BY name ASC');
    if (!branches || branches.length === 0) {
      branches = liveSyncedState.branches;
    }
    return res.json({
      success: true,
      data: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        openingTime: b.opening_time || b.openingTime || '10:00',
        closingTime: b.closing_time || b.closingTime || '23:30',
        totalChairs: b.total_chairs || b.totalChairs || 4,
        paymentAccounts: {
          vodafoneCash: b.vodafone_cash || liveSyncedState.settings?.vodafone_cash_number || b.phone || '01005437633',
          instapay: b.instapay_username || liveSyncedState.settings?.instapay_username || b.phone || '01005437633',
          depositRequired: liveSyncedState.settings?.booking_fee_normal || 50,
        },
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. Services List
// ---------------------------------------------------------------------------
router.post('/services/list', async (req: Request, res: Response) => {
  try {
    const { branchId, category } = req.body;
    let sql = 'SELECT * FROM services WHERE is_active = 1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY price ASC';
    let services = await query<any[]>(sql, params);

    if ((!services || services.length === 0) && liveSyncedState.services.length > 0) {
      services = liveSyncedState.services;
      if (category) {
        services = services.filter((s: any) => s.category === category);
      }
    }

    if (!services || services.length === 0) {
      services = liveSyncedState.services;
    }

    return res.json({
      success: true,
      data: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: Number(s.price),
        durationMinutes: s.duration_minutes || s.durationMinutes || 30,
        category: s.category,
        isVipOnly: Boolean(s.is_vip_only || s.isVipOnly),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Barbers List
// ---------------------------------------------------------------------------
router.post('/barbers/list', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.body;
    let sql = `
      SELECT bar.*, br.name as branch_name 
      FROM barbers bar
      LEFT JOIN branches br ON bar.branch_id = br.id
      WHERE bar.is_active = 1
    `;
    const params: any[] = [];

    if (branchId) {
      sql += ' AND (bar.branch_id = ? OR bar.branch_id IS NULL)';
      params.push(branchId);
    }

    let barbers = await query<any[]>(sql, params);

    if ((!barbers || barbers.length === 0) && liveSyncedState.barbers.length > 0) {
      barbers = liveSyncedState.barbers;
      if (branchId) {
        barbers = barbers.filter((b: any) => b.branch_id === branchId || b.branchId === branchId);
      }
    }

    if (!barbers || barbers.length === 0) {
      barbers = [
        {
          id: 'barber-lead',
          full_name: 'كابتن الصالون الرئيسي',
          specialty: 'خبير قص وتصفيف وتسريحات VIP',
          rating: 4.9,
          rating_count: 38,
          branch_id: 'branch-elhdad',
          branch_name: 'الحداد - ELHDAD',
        },
        {
          id: 'barber-beard-specialist',
          full_name: 'مصفف اللحية والعناية بالبشرة',
          specialty: 'متخصص اللحية الملكية وماسكات البشرة',
          rating: 4.9,
          rating_count: 26,
          branch_id: 'branch-elhdad',
          branch_name: 'الحداد - ELHDAD',
        },
      ];
    }

    return res.json({
      success: true,
      data: barbers.map((b) => ({
        id: b.id,
        name: b.full_name || b.name,
        specialty: b.specialty || 'مصفف محترف',
        rating: Number(b.rating || 4.9),
        ratingCount: b.rating_count || b.ratingCount || 0,
        branchId: b.branch_id || b.branchId,
        branchName: b.branch_name || b.branchName || 'الحداد - ELHDAD',
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Availability Check
// ---------------------------------------------------------------------------
router.post('/availability/check', async (req: Request, res: Response) => {
  try {
    const { branchId, barberId, date, startsAt, bookingType = 'normal' } = req.body;
    const targetDate = (date || startsAt || new Date().toISOString()).split('T')[0];

    let branch = null;
    try {
      if (branchId) {
        const branches = await query<any[]>('SELECT * FROM branches WHERE id = ? LIMIT 1', [branchId]);
        branch = branches[0];
      } else {
        const branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 LIMIT 1');
        branch = branches[0];
      }
    } catch {}

    if (!branch) {
      branch = liveSyncedState.branches[0] || {
        id: 'branch-elhdad',
        name: 'الحداد - ELHDAD',
        opening_time: '10:00',
        closing_time: '23:30',
      };
    }

    return res.json({
      success: true,
      data: {
        branchId: branch.id,
        branchName: branch.name,
        date: targetDate,
        isSlotAvailable: true,
        conflictReason: null,
        openingTime: branch.opening_time || branch.openingTime || '10:00',
        closingTime: branch.closing_time || branch.closingTime || '23:30',
        estimatedWaitTimeMinutes: 10,
      },
    });
  } catch (err: any) {
    return res.json({
      success: true,
      data: {
        branchId: 'branch-elhdad',
        branchName: 'الحداد - ELHDAD',
        isSlotAvailable: true,
        openingTime: '10:00',
        closingTime: '23:30',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Create Pending Booking (Idempotent)
// ---------------------------------------------------------------------------
router.post('/bookings/create-pending', async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      branchId,
      barberId,
      serviceId,
      additionalServiceIds = [],
      bookingType = 'normal',
      startsAt,
      idempotencyKey,
      notes,
    } = req.body;

    const rawPhone = req.body.customerPhone || req.body.phone || req.body.phoneNumber || '';
    const finalCustomerName = (req.body.customerName || req.body.name || req.body.clientName || 'عميل الصالون').trim();

    if (!rawPhone) {
      return res.status(400).json({
        success: false,
        error: 'بيانات الحجز غير مكتملة (رقم الهاتف مطلوب).',
      });
    }

    const cleanPhone = normalizePhone(rawPhone);
    const finalBranchId = branchId || liveSyncedState.branches[0]?.id || 'branch-elhdad';
    const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;

    const matchedService = liveSyncedState.services.find(
      (s) => s.id === serviceId || s.name.toLowerCase().includes((serviceId || '').toLowerCase())
    ) || { id: 'srv-haircut', name: 'قص شعر كلاسيكي', price: 180 };

    const resolvedServiceName = matchedService.name;
    const resolvedPrice = Number(matchedService.price || 180);
    const resolvedBookingType = (serviceId?.toLowerCase().includes('vip') || matchedService.name.toLowerCase().includes('vip') || bookingType === 'vip') ? 'vip' : 'normal';

    let finalStartsAt = startsAt || `${new Date().toISOString().split('T')[0]} 16:00:00`;
    const currentYear = new Date().getFullYear().toString();
    if (finalStartsAt.startsWith('2025') || finalStartsAt.startsWith('2024') || finalStartsAt.startsWith('2023')) {
      finalStartsAt = finalStartsAt.replace(/^\d{4}/, currentYear);
    }
    const bookingDate = finalStartsAt.split('T')[0].split(' ')[0];
    const existingDayBookings = liveSyncedBookings.filter((b) => (b.starts_at || b.startsAt || '').startsWith(bookingDate));
    const nextQueueNum = existingDayBookings.length + 1;

    try {
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

      let branchRow = (await query<any[]>('SELECT * FROM branches WHERE id = ?', [finalBranchId]))?.[0];
      if (!branchRow) {
        branchRow = (await query<any[]>('SELECT * FROM branches LIMIT 1'))?.[0];
      }
      const instapayHandle = branchRow?.instapay_username || liveSyncedState.settings?.instapay_username || branchRow?.phone || '01285694670';
      const vodafoneCashNumber = branchRow?.vodafone_cash_number || liveSyncedState.settings?.vodafone_cash_number || branchRow?.phone || '01285694689';

      const newBooking = await createBooking(payload, { role: 'whatsapp_agent' }, req.ip);
      const bookingData = {
        id: newBooking.id,
        bookingId: newBooking.id,
        customer_name: newBooking.customer_name,
        customerName: newBooking.customer_name,
        customer_phone: cleanPhone,
        customerPhone: cleanPhone,
        service_id: payload.serviceId,
        service_name: resolvedServiceName,
        serviceName: resolvedServiceName,
        booking_type: resolvedBookingType,
        bookingType: resolvedBookingType,
        branch_id: finalBranchId,
        branch_name: branchRow?.name || 'الحداد - ELHDAD',
        status: newBooking.status,
        queue_number: newBooking.queue_number || nextQueueNum,
        queueNumber: newBooking.queue_number || nextQueueNum,
        starts_at: newBooking.starts_at,
        startsAt: newBooking.starts_at,
        booking_fee_at_booking: 50,
        depositRequired: 50,
        total_at_booking: resolvedPrice,
        totalAmount: resolvedPrice,
        secure_token: (newBooking as any).secure_token || (newBooking as any).secureToken || `TK-${newBooking.id}`,
        created_at: new Date().toISOString(),
        trackingUrl: `https://trimmind.up.railway.app/track?q=${newBooking.id}`,
        paymentInstructions: {
          instapay: instapayHandle,
          vodafoneCash: vodafoneCashNumber,
          depositRequired: 50,
        },
      };

      liveSyncedBookings.unshift(bookingData);

    } catch (dbErr: any) {
      console.error('Database error in /bookings/create-pending:', dbErr);
      return res.status(500).json({
        success: false,
        error: 'تعذر تسجيل الحجز في قاعدة البيانات، يرجى إعادة المحاولة.',
        details: dbErr?.message || 'DB Error',
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. Get Booking Status
// ---------------------------------------------------------------------------
router.post('/bookings/status', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId } = req.body;
    const cleanPhone = normalizePhone(phone);

    let rows: any[] = [];

    if (bookingId) {
      rows = await query<any[]>(
        `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN barbers bar ON b.barber_id = bar.id
         LEFT JOIN branches br ON b.branch_id = br.id
         WHERE b.id = ? LIMIT 1`,
        [bookingId.trim().toUpperCase()]
      );
    } else if (cleanPhone) {
      rows = await query<any[]>(
        `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN barbers bar ON b.barber_id = bar.id
         LEFT JOIN branches br ON b.branch_id = br.id
         WHERE REPLACE(REPLACE(b.customer_phone, ' ', ''), '+', '') LIKE ?
         ORDER BY b.created_at DESC LIMIT 1`,
        [`%${cleanPhone.slice(-9)}%`]
      );
    } else {
      return res.status(400).json({ success: false, error: 'يرجى تزويد رقم الهاتف أو رقم الحجز' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على حجز مطابق.' });
    }

    const b = rows[0];

    // Status translation in natural Egyptian Arabic
    const statusMap: Record<string, string> = {
      awaiting_payment: 'بانتظار تحويل العربون لتأكيد الموعد ⏳',
      payment_submitted: 'تم إرسال إثبات الدفع وقيد مراجعة الاستقبال 🔍',
      pending_review: 'قيد مراجعة الإيصال وتأكيد الحجز 🔍',
      confirmed: 'مؤكد ومسجل في جدول المواعيد بنجاح ✅',
      customer_arrived: 'وصل الصالون وبانتظار النداء للدخول للكرسي 💈',
      in_service: 'داخل جلسة الحلاقة على الكرسي حالياً ✂️',
      completed: 'تمت الجلسة بنجاح 👑',
      cancelled: 'ملغي ❌',
      rejected: 'مرفوض 🚫',
    };

    return res.json({
      success: true,
      data: {
        bookingId: b.id,
        customerName: b.customer_name,
        customerPhone: b.customer_phone,
        status: b.status,
        statusArabic: statusMap[b.status] || b.status,
        bookingType: b.booking_type,
        serviceName: b.service_name,
        barberName: b.barber_name || 'حسب الدور',
        branchName: b.branch_name,
        bookingDate: b.booking_date,
        startsAt: b.starts_at,
        queueNumber: b.queue_number,
        depositPaid: b.booking_fee_at_booking,
        totalAmount: b.total_at_booking,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. Waiting Queue Position Check
// ---------------------------------------------------------------------------
router.post('/queue/position', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId, branchId } = req.body;
    const cleanPhone = normalizePhone(phone);

    let booking = null;
    if (bookingId) {
      booking = await getBookingById(bookingId.trim().toUpperCase());
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
           AND status IN ('confirmed', 'customer_arrived', 'in_service')
         ORDER BY created_at DESC LIMIT 1`,
        [`%${cleanPhone.slice(-9)}%`]
      );
      if (rows && rows.length > 0) {
        booking = await getBookingById(rows[0].id);
      }
    }

    const targetBranchId = booking?.branch_id || branchId;
    if (!targetBranchId) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد الفرع أو رقم الحجز.' });
    }

    const queue = await getBranchQueue(targetBranchId);

    if (!booking) {
      return res.json({
        success: true,
        data: {
          totalInQueue: queue.length,
          estimatedWaitMinutes: queue.length * 20,
          currentQueue: queue.slice(0, 5),
        },
      });
    }

    const myIndex = queue.findIndex((q) => q.booking_id === booking.id);
    const peopleAhead = myIndex >= 0 ? myIndex : 0;
    const estimatedMinutes = Math.max(0, peopleAhead * 20);

    return res.json({
      success: true,
      data: {
        bookingId: booking.id,
        customerName: booking.customer_name,
        status: booking.status,
        queueNumber: booking.queue_number,
        peopleAhead,
        estimatedWaitMinutes: estimatedMinutes,
        isNext: peopleAhead === 0 && booking.status !== 'in_service',
        isInChair: booking.status === 'in_service',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 8. Cancel Booking
// ---------------------------------------------------------------------------
router.post('/bookings/cancel', async (req: Request, res: Response) => {
  try {
    let { phone, bookingId, reason } = req.body;
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
        if (bPhone !== cleanPhone && !bPhone.endsWith(cleanPhone.slice(-9))) {
          return res.status(403).json({ success: false, error: 'رقم الهاتف غير مطابق لبيانات الحجز المطلوب إلغاؤه.' });
        }
      }
    } else if (cleanPhone) {
      // Find latest active booking by phone
      try {
        const rows = await query<any[]>(
          `SELECT id FROM bookings 
           WHERE (REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') = ? 
              OR customer_phone LIKE ?)
             AND status NOT IN ('cancelled', 'completed', 'rejected')
           ORDER BY created_at DESC LIMIT 1`,
          [cleanPhone, `%${cleanPhone.slice(-9)}`]
        );
        if (rows && rows.length > 0) {
          booking = await getBookingById(rows[0].id);
        }
      } catch {}

      if (!booking) {
        booking = liveSyncedBookings.find(
          (b) =>
            ((b.customer_phone && normalizePhone(b.customer_phone) === cleanPhone) ||
             (b.customerPhone && normalizePhone(b.customerPhone) === cleanPhone)) &&
            b.status !== 'cancelled' && b.status !== 'completed'
        );
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

    const targetLive = liveSyncedBookings.find((b) => b.id === booking.id);
    if (targetLive) {
      targetLive.status = 'cancelled';
    }

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

// ---------------------------------------------------------------------------
// 8.5. Confirm Arrival / Arriving Soon (Interactive WhatsApp Action)
// ---------------------------------------------------------------------------
router.post('/bookings/confirm-arrival', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId } = req.body;
    const cleanPhone = normalizePhone(phone);

    let targetBooking: any = null;
    if (bookingId) {
      try {
        targetBooking = await getBookingById(bookingId.trim().toUpperCase());
      } catch {}
    } else if (cleanPhone) {
      try {
        const rows = await query<any[]>(
          `SELECT id FROM bookings 
           WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
             AND status IN ('confirmed', 'awaiting_payment', 'pending_review')
           ORDER BY created_at DESC LIMIT 1`,
          [`%${cleanPhone.slice(-9)}%`]
        );
        if (rows && rows.length > 0) {
          targetBooking = await getBookingById(rows[0].id);
        }
      } catch {}

      if (!targetBooking) {
        targetBooking = liveSyncedBookings.find(
          (b) => b.customer_phone?.includes(cleanPhone.slice(-9)) || b.customerPhone?.includes(cleanPhone.slice(-9))
        );
      }
    }

    if (!targetBooking) {
      return res.json({
        success: true,
        message: 'يا ألف مرحب بيك يا بطل! 👑 تم إبلاغ موظف الاستقبال بوجودك لتجهيز الكرسي لك فوراً! 💈✨',
        data: { status: 'customer_arrived' },
      });
    }

    // Update in MySQL
    try {
      await query(
        `UPDATE bookings SET status = 'customer_arrived', updated_at = NOW() WHERE id = ?`,
        [targetBooking.id]
      );
    } catch {}

    // Update in liveSyncedBookings
    targetBooking.status = 'customer_arrived';

    broadcastToBranch(targetBooking.branch_id || 'branch-elhdad', 'CUSTOMER_ARRIVED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name || targetBooking.customerName,
    });
    broadcastGlobal('CUSTOMER_ARRIVED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name || targetBooking.customerName,
    });

    const clientName = targetBooking.customer_name || targetBooking.customerName || 'غالي';
    return res.json({
      success: true,
      message: `يا ألف مرحب بيك يا ${clientName}! 👑 تم تسجيل وصولك في شاشة الاستقبال، والكرسي بيجهزلك حالاً! 💈✨`,
      data: {
        bookingId: targetBooking.id,
        status: 'customer_arrived',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 9. Reschedule Booking
// ---------------------------------------------------------------------------
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

    // Security Ownership Check
    const storedPhoneClean = normalizePhone(booking.customer_phone);
    if (storedPhoneClean !== cleanPhone && !storedPhoneClean.endsWith(cleanPhone.slice(-9))) {
      return res.status(403).json({
        success: false,
        error: 'رقم الهاتف غير مطابق لبيانات الحجز.',
      });
    }

    const newDate = newStartsAt.split('T')[0];
    const newBarberId = barberId || booking.barber_id;

    // Check VIP collision
    if (booking.booking_type === 'vip' && newBarberId) {
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

// ---------------------------------------------------------------------------
// 10. Submit Payment Proof (WhatsApp Media Handler)
// ---------------------------------------------------------------------------
router.post('/payments/submit-proof', async (req: Request, res: Response) => {
  try {
    const { phone, bookingId, proofImageUrl, senderPhone, transactionRef } = req.body;
    const cleanPhone = normalizePhone(phone || senderPhone);
    const finalProofUrl = proofImageUrl || 'https://trimmind.up.railway.app/uploads/receipt.png';

    let targetBooking: any = null;

    if (bookingId) {
      targetBooking = await getBookingById(bookingId.trim().toUpperCase());
    } else if (cleanPhone) {
      try {
        const rows = await query<any[]>(
          `SELECT id FROM bookings 
           WHERE (REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? OR customer_phone = ?)
             AND status IN ('awaiting_payment', 'draft', 'pending_review')
           ORDER BY created_at DESC LIMIT 1`,
          [`%${cleanPhone.slice(-8)}%`, cleanPhone]
        );
        if (rows && rows.length > 0) {
          targetBooking = await getBookingById(rows[0].id);
        }
      } catch {}

      if (!targetBooking) {
        targetBooking = liveSyncedBookings.find(
          (b) =>
            (b.customer_phone?.includes(cleanPhone.slice(-8)) || b.customerPhone?.includes(cleanPhone.slice(-8))) &&
            (b.status === 'awaiting_payment' || b.status === 'pending_review')
        );
      }

      // If user typed a custom phone during chat that differs from WhatsApp sender ID,
      // fallback to the most recent awaiting_payment booking in memory!
      if (!targetBooking) {
        targetBooking = liveSyncedBookings.find(
          (b) => b.status === 'awaiting_payment' || b.status === 'pending_review'
        );
      }
    } else {
      targetBooking = liveSyncedBookings.find(
        (b) => b.status === 'awaiting_payment' || b.status === 'pending_review'
      );
    }

    if (!targetBooking) {
      const fallbackId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
      const newDraftBooking = {
        id: fallbackId,
        customer_name: cleanPhone ? `عميل واتساب (${cleanPhone.slice(-4)})` : 'عميل جديد',
        customer_phone: cleanPhone || '01005437633',
        customerName: cleanPhone ? `عميل واتساب (${cleanPhone.slice(-4)})` : 'عميل جديد',
        customerPhone: cleanPhone || '01005437633',
        service_id: 'srv-haircut',
        service_name: 'قص وتصفيف الشعر الاحترافي',
        barber_id: 'barber-lead',
        barber_name: 'كابتن الصالون الرئيسي',
        branch_id: 'branch-elhdad',
        booking_date: new Date().toISOString().split('T')[0],
        starts_at: `${new Date().toISOString().split('T')[0]} 16:00:00`,
        status: 'pending_review',
        booking_fee_at_booking: 50,
        payment_proof: JSON.stringify({
          image_url: finalProofUrl,
          sender_phone: cleanPhone,
          submitted_at: new Date().toISOString(),
          status: 'pending_review'
        })
      };

      liveSyncedBookings.push(newDraftBooking);
      targetBooking = newDraftBooking;

      try {
        await query(
          `INSERT INTO bookings (id, customer_name, customer_phone, service_id, barber_id, branch_id, booking_date, starts_at, status, booking_fee_at_booking, payment_proof, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', 50, ?, NOW(), NOW())`,
          [
            fallbackId,
            newDraftBooking.customer_name,
            newDraftBooking.customer_phone,
            newDraftBooking.service_id,
            newDraftBooking.barber_id,
            newDraftBooking.branch_id,
            newDraftBooking.booking_date,
            newDraftBooking.starts_at,
            newDraftBooking.payment_proof
          ]
        );
      } catch {}
    }

    const paymentProofObj = {
      image_url: finalProofUrl,
      sender_phone: cleanPhone || targetBooking.customer_phone,
      transaction_ref: transactionRef || `WA-TX-${Math.floor(100000 + Math.random() * 900000)}`,
      submitted_at: new Date().toISOString(),
      status: 'pending_review',
    };

    // Update booking to pending_review in MySQL
    try {
      await query(
        `UPDATE bookings 
         SET status = 'pending_review', payment_proof = ?, updated_at = NOW() 
         WHERE id = ?`,
        [JSON.stringify(paymentProofObj), targetBooking.id]
      );
    } catch {}

    targetBooking.status = 'pending_review';
    targetBooking.payment_proof = JSON.stringify(paymentProofObj);

    // Realtime notification to receptionist & manager
    broadcastToBranch(targetBooking.branch_id || 'branch-elhdad', 'PAYMENT_PROOF_SUBMITTED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name || targetBooking.customerName,
      customerPhone: targetBooking.customer_phone || targetBooking.customerPhone,
      amount: targetBooking.booking_fee_at_booking || 50,
      proofUrl: finalProofUrl,
    });
    broadcastGlobal('PAYMENT_PROOF_SUBMITTED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name || targetBooking.customerName,
    });

    return res.json({
      success: true,
      message: 'تم استلام صورة التحويل بنجاح وجاري مراجعتها من قبل قسم الاستقبال.',
      data: {
        bookingId: targetBooking.id,
        status: 'pending_review',
        customerName: targetBooking.customer_name,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 11. Upcoming Bookings for Reminders (Cron Tool)
// ---------------------------------------------------------------------------
router.post('/reminders/upcoming', async (req: Request, res: Response) => {
  try {
    const { hoursAhead = 24 } = req.body;
    const now = new Date();
    const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const rows = await query<any[]>(
      `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN branches br ON b.branch_id = br.id
       WHERE b.status = 'confirmed'
         AND b.starts_at >= ? AND b.starts_at <= ?
       ORDER BY b.starts_at ASC LIMIT 100`,
      [now.toISOString(), futureLimit.toISOString()]
    );

    return res.json({
      success: true,
      count: rows.length,
      data: rows.map((b) => ({
        bookingId: b.id,
        customerName: b.customer_name,
        customerPhone: b.customer_phone,
        serviceName: b.service_name,
        barberName: b.barber_name || 'كابتن الصالون',
        branchName: b.branch_name,
        startsAt: b.starts_at,
        bookingType: b.booking_type,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 12. AI Manager Daily Report Data Aggregation (Real MySQL Data)
// ---------------------------------------------------------------------------
router.all('/manager/daily-report-data', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. Manager contact info from Settings (highest priority), then Profiles
    let managerPhone = '';
    let managerName = 'المدير العام';

    try {
      const settingRows = await query<any[]>('SELECT setting_value FROM settings WHERE setting_key = "general" LIMIT 1');
      if (settingRows && settingRows.length > 0) {
        const val = typeof settingRows[0].setting_value === 'string' ? JSON.parse(settingRows[0].setting_value) : settingRows[0].setting_value;
        if (val?.manager_report_phone) {
          managerPhone = normalizePhone(val.manager_report_phone);
        } else if (val?.whatsapp_number) {
          managerPhone = normalizePhone(val.whatsapp_number);
        } else if (val?.primary_phone) {
          managerPhone = normalizePhone(val.primary_phone);
        }
      }
    } catch {}

    if (!managerPhone) {
      const managerRows = await query<any[]>(
        "SELECT phone, full_name FROM profiles WHERE role = 'manager' AND is_active = 1 ORDER BY is_super_admin DESC LIMIT 1"
      );
      if (managerRows && managerRows.length > 0) {
        managerPhone = normalizePhone(managerRows[0].phone || '');
        managerName = managerRows[0].full_name || managerName;
      }
    }

    if (!managerPhone) {
      managerPhone = '01285694670';
    }

    // 2. Today's bookings
    const todayBookings = await query<any[]>(
      `SELECT b.*, s.name as service_name, bar.full_name as barber_name, br.name as branch_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN branches br ON b.branch_id = br.id
       WHERE b.booking_date = ? OR (b.starts_at LIKE ?)
       ORDER BY b.starts_at ASC`,
      [today, `${today}%`]
    );

    const totalBookings = todayBookings.length;
    const confirmed = todayBookings.filter((b) => b.status === 'confirmed' || b.status === 'in_service' || b.status === 'completed' || b.status === 'customer_arrived').length;
    const pendingPayment = todayBookings.filter((b) => b.status === 'pending_review' || b.status === 'awaiting_payment').length;
    const vipCount = todayBookings.filter((b) => b.booking_type === 'vip').length;

    // Group by Barber
    const barberStats: Record<string, number> = {};
    for (const b of todayBookings) {
      const name = b.barber_name || 'كابتن الصالون الرئيسي';
      barberStats[name] = (barberStats[name] || 0) + 1;
    }

    // Time periods / peak hours
    const periodStats = {
      morning: 0,
      afternoon: 0,
      evening: 0,
    };
    for (const b of todayBookings) {
      const timeStr = (b.starts_at || '').split('T')[1] || '';
      const hour = parseInt(timeStr.split(':')[0], 10);
      if (hour >= 10 && hour < 14) periodStats.morning++;
      else if (hour >= 14 && hour < 18) periodStats.afternoon++;
      else if (hour >= 18) periodStats.evening++;
    }

    let peakPeriod = 'متوازنة طوال اليوم';
    if (periodStats.evening >= periodStats.afternoon && periodStats.evening >= periodStats.morning && periodStats.evening > 0) {
      peakPeriod = `الفترة المسائية (6:00 م - 11:00 م) بواقع ${periodStats.evening} حجز`;
    } else if (periodStats.afternoon >= periodStats.morning && periodStats.afternoon > 0) {
      peakPeriod = `فترة الظهيرة (2:00 م - 6:00 م) بواقع ${periodStats.afternoon} حجز`;
    } else if (periodStats.morning > 0) {
      peakPeriod = `الفترة الصباحية (10:00 ص - 2:00 م) بواقع ${periodStats.morning} حجز`;
    }

    // 3. Active waitlist today
    const waitlistRows = await query<any[]>(
      "SELECT COUNT(*) as count FROM waitlist_entries WHERE preferred_date = ? AND status = 'waiting'",
      [today]
    );
    const waitlistCount = waitlistRows?.[0]?.count || 0;

    // 4. Yesterday's summary
    const yesterdayBookings = await query<any[]>(
      "SELECT status, cancellation_reason FROM bookings WHERE booking_date = ? OR starts_at LIKE ?",
      [yesterday, `${yesterday}%`]
    );
    const yesterdayCompleted = yesterdayBookings.filter((b) => b.status === 'completed').length;
    const yesterdayNoShows = yesterdayBookings.filter((b) => b.status === 'cancelled' && (b.cancellation_reason?.includes('no-show') || b.cancellation_reason?.includes('عدم حضور'))).length;

    // 5. Today's estimated financials
    let totalEstimatedRevenue = 0;
    let totalDepositsRequired = 0;
    for (const b of todayBookings) {
      if (b.status !== 'cancelled' && b.status !== 'rejected') {
        totalEstimatedRevenue += Number(b.total_at_booking || b.service_price_at_booking || 180);
        totalDepositsRequired += Number(b.booking_fee_at_booking || 50);
      }
    }

    return res.json({
      success: true,
      data: {
        date: today,
        manager: {
          name: managerName,
          phone: managerPhone,
        },
        metrics: {
          totalBookings,
          confirmedBookings: confirmed,
          expectedAttendance: confirmed,
          vipBookings: vipCount,
          pendingPaymentsCount: pendingPayment,
          waitlistCount,
          totalEstimatedRevenue,
          totalDepositsRequired,
          peakPeriod,
          periodBreakdown: periodStats,
          barberBreakdown: barberStats,
          yesterday: {
            date: yesterday,
            completed: yesterdayCompleted,
            noShows: yesterdayNoShows,
          },
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 13. Smart Waitlist: Join Waitlist
// ---------------------------------------------------------------------------
router.post('/waitlist/join', async (req: Request, res: Response) => {
  try {
    const { phone, customerName, branchId = 'branch-elhdad', barberId, serviceId = 'srv-haircut', preferredDate, preferredTimeWindow = 'afternoon' } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || !customerName) {
      return res.status(400).json({ success: false, error: 'يرجى تزويد الاسم ورقم الهاتف للانضمام لقائمة الانتظار.' });
    }
    const targetDate = preferredDate || new Date().toISOString().split('T')[0];
    const waitlistRepo = new MySQLWaitlistRepository();
    const realtimeNotifier = new SocketRealtimeNotifier();
    const useCase = new JoinWaitlistUseCase(waitlistRepo, realtimeNotifier);

    const entry = await useCase.execute({
      branchId,
      barberId: barberId || null,
      customerName,
      customerPhone: cleanPhone,
      preferredDate: targetDate,
      preferredTimeWindow,
      serviceId,
    });

    return res.json({
      success: true,
      message: 'تمت إضافتك بنجاح إلى قائمة الانتظار الذكية! سنقوم بإبلاغك فور إلغاء أو توفر أي موعد شاغر.',
      data: {
        waitlistId: entry.id,
        customerName: entry.customerName,
        preferredDate: entry.preferredDate,
        preferredTimeWindow: entry.preferredTimeWindow,
        status: entry.status,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 14. Smart Waitlist: Claim Offered Slot
// ---------------------------------------------------------------------------
router.post('/waitlist/claim', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'كود العرض (token) مطلوب لتأكيد الحجز.' });
    }
    const waitlistRepo = new MySQLWaitlistRepository();
    const bookingRepo = new MySQLBookingRepository();
    const realtimeNotifier = new SocketRealtimeNotifier();
    const useCase = new ClaimWaitlistOfferUseCase(waitlistRepo, bookingRepo, realtimeNotifier);

    const result = await useCase.execute(token);
    return res.json({
      success: true,
      message: 'تم تأكيد حجزك بنجاح عبر قائمة الانتظار الذكية! 💈🎉',
      data: {
        bookingId: result.booking.id,
        customerName: result.booking.customerName,
        startsAt: result.booking.startsAt,
        total: result.booking.totalAtBooking,
        depositRequired: result.booking.bookingFeeAtBooking,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 15. Smart Waitlist: Check Customer Waitlist Status
// ---------------------------------------------------------------------------
router.post('/waitlist/status', async (req: Request, res: Response) => {
  try {
    const cleanPhone = normalizePhone(req.body.phone || '');
    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب.' });
    }
    const rows = await query<any[]>(
      `SELECT w.*, s.name as service_name, bar.full_name as barber_name
       FROM waitlist_entries w
       LEFT JOIN services s ON w.service_id = s.id
       LEFT JOIN barbers bar ON w.barber_id = bar.id
       WHERE REPLACE(REPLACE(w.customer_phone, ' ', ''), '+', '') LIKE ?
         AND w.status IN ('waiting', 'offered')
       ORDER BY w.created_at DESC LIMIT 1`,
      [`%${cleanPhone.slice(-9)}%`]
    );

    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        data: { hasActiveEntry: false, message: 'لا توجد طلبات انتظار نشطة مسجلة بهذا الرقم.' },
      });
    }

    const r = rows[0];
    return res.json({
      success: true,
      data: {
        hasActiveEntry: true,
        entryId: r.id,
        customerName: r.customer_name,
        preferredDate: r.preferred_date,
        preferredTimeWindow: r.preferred_time_window,
        status: r.status,
        offerToken: r.offer_token,
        offerExpiresAt: r.offer_expires_at,
        isOfferActive: r.status === 'offered' && r.offer_expires_at && new Date(r.offer_expires_at).getTime() > Date.now(),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 16. No-Show: Check Overdue / No-Show Booking Status
// ---------------------------------------------------------------------------
router.post('/no-show/check-status', async (req: Request, res: Response) => {
  try {
    const { bookingId, phone } = req.body;
    const cleanPhone = normalizePhone(phone);
    let b: any = null;
    if (bookingId) {
      b = await getBookingById(bookingId.trim().toUpperCase());
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings WHERE (REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') = ? OR customer_phone LIKE ?) ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, `%${cleanPhone.slice(-9)}`]
      );
      if (rows && rows.length > 0) b = await getBookingById(rows[0].id);
    }

    if (!b) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الحجز المطلوب.' });
    }

    const isNoShow = b.status === 'cancelled' && (b.cancellation_reason?.includes('no-show') || b.cancellation_reason?.includes('عدم حضور'));
    return res.json({
      success: true,
      data: {
        bookingId: b.id,
        customerName: b.customer_name,
        status: b.status,
        startsAt: b.starts_at,
        isNoShow,
        cancellationReason: b.cancellation_reason || null,
        explanation: isNoShow
          ? 'تم إلغاء هذا الحجز تلقائياً من النظام لعدم الحضور وتجاوز المهلة المحددة (35 دقيقة).'
          : `حالة الحجز الحالية هي: ${b.status}`,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 17. AI Customer Recall: Candidates Query
// ---------------------------------------------------------------------------
router.post('/recall/candidates', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', thresholdDays = 21 } = req.body;
    const recallRepo = new MySQLRecallRepository();
    const useCase = new FindRecallCandidatesUseCase(recallRepo);
    const candidates = await useCase.execute(branchId, Number(thresholdDays));

    return res.json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 18. AI Customer Recall: Log Campaign Send
// ---------------------------------------------------------------------------
router.post('/recall/log-send', async (req: Request, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', phone, customerName, messageText } = req.body;
    const cleanPhone = normalizePhone(phone);
    const recallRepo = new MySQLRecallRepository();
    const campaignId = await recallRepo.createCampaign(branchId, 21, 'AI Automated Customer Recall via n8n', 'system-ai');
    await recallRepo.recordSend(campaignId, cleanPhone, customerName || 'عميل الصالون', messageText || '');

    return res.json({
      success: true,
      message: 'تم تسجيل رسالة الاستعادة (Recall) بنجاح في قاعدة البيانات.',
      data: { campaignId, phone: cleanPhone },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
