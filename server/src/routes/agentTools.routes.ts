import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { createBooking, cancelBooking, getBookingById } from '../services/booking.service.js';
import { getBranchQueue } from '../services/queue.service.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// 1. Security & Authentication Middleware for Agent Tools
const AGENT_API_SECRET = process.env.AGENT_API_SECRET || process.env.WHATSAPP_AGENT_SECRET || 'trim-mind-agent-secret-key-2026';

function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-agent-secret'] || req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const providedKey = (secretHeader as string) || bearerToken;

  if (providedKey && providedKey !== AGENT_API_SECRET) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized access to Agent Tools API. Invalid secret token.',
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

// ---------------------------------------------------------------------------
// 0. Branches List (Live Branches, Address, Working Hours, Phone)
// ---------------------------------------------------------------------------
router.post('/branches/list', async (_req: Request, res: Response) => {
  try {
    let branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 ORDER BY name ASC');
    if (!branches || branches.length === 0) {
      branches = [
        {
          id: 'branch-elhdad',
          name: 'الحداد - ELHDAD',
          address: 'سقيل - مركز اوسيم',
          phone: '01005437633',
          opening_time: '10:00',
          closing_time: '23:30',
          total_chairs: 4,
        },
      ];
    }
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

    if (!services || services.length === 0) {
      services = [
        {
          id: 'srv-haircut',
          name: 'قص وتصفيف الشعر الاحترافي',
          description: 'قص شعر عصري وتصفيف واستشوار بأحدث الصيحات',
          price: 80,
          duration_minutes: 30,
          category: 'hair',
          is_vip_only: 0,
        },
        {
          id: 'srv-beard',
          name: 'تحديد وتشذيب اللحية الملكي',
          description: 'تحديد دقيق بالموس مع بخار وزيوت عناية خاصة',
          price: 50,
          duration_minutes: 20,
          category: 'beard',
          is_vip_only: 0,
        },
        {
          id: 'srv-vip-package',
          name: 'بكج VIP الشامل (شعر + دقن + بشرة)',
          description: 'حلاقة شعر كاملة + تحديد دقن + ماسك تنظيف بشرة بالبخار واستشوار',
          price: 180,
          duration_minutes: 60,
          category: 'package',
          is_vip_only: 1,
        },
        {
          id: 'srv-facial',
          name: 'جلسة تنظيف وتقشير البشرة بالبخار',
          description: 'جلسة متكاملة لإزالة الرؤوس السوداء وماسك طمي ونضارة',
          price: 100,
          duration_minutes: 35,
          category: 'skincare',
          is_vip_only: 0,
        },
      ];
    }

    return res.json({
      success: true,
      data: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: Number(s.price),
        durationMinutes: s.duration_minutes,
        category: s.category,
        isVipOnly: Boolean(s.is_vip_only),
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
        name: b.full_name,
        specialty: b.specialty || 'مصفف محترف',
        rating: Number(b.rating || 4.9),
        ratingCount: b.rating_count || 0,
        branchId: b.branch_id,
        branchName: b.branch_name || 'الحداد - ELHDAD',
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

    // 1. Get branch details
    let branch = null;
    if (branchId) {
      const branches = await query<any[]>('SELECT * FROM branches WHERE id = ? LIMIT 1', [branchId]);
      branch = branches[0];
    } else {
      const branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 LIMIT 1');
      branch = branches[0];
    }

    if (!branch) {
      return res.status(404).json({ success: false, error: 'الفرع غير متاح' });
    }

    // 2. Check VIP Conflict if specific barber and exact slot specified
    let isSlotAvailable = true;
    let conflictReason = null;

    if (bookingType === 'vip' && barberId && startsAt) {
      const existing = await query<any[]>(
        `SELECT id, starts_at FROM bookings 
         WHERE barber_id = ? AND booking_date = ? AND starts_at = ? 
         AND status NOT IN ('cancelled', 'rejected') LIMIT 1`,
        [barberId, targetDate, startsAt]
      );
      if (existing && existing.length > 0) {
        isSlotAvailable = false;
        conflictReason = 'هذا الموعد محجوز مسبقاً لدى هذا الكابتن.';
      }
    }

    // 3. Get existing bookings count for that day
    const dayBookings = await query<any[]>(
      `SELECT count(*) as count FROM bookings 
       WHERE branch_id = ? AND booking_date = ? AND status NOT IN ('cancelled', 'rejected')`,
      [branch.id, targetDate]
    );

    return res.json({
      success: true,
      data: {
        branchId: branch.id,
        branchName: branch.name,
        date: targetDate,
        isSlotAvailable,
        conflictReason,
        openingTime: branch.opening_time || '10:00',
        closingTime: branch.closing_time || '23:00',
        estimatedWaitTimeMinutes: Math.min(60, (dayBookings[0]?.count || 0) * 10),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
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

    if (!customerName || !customerPhone || !serviceId) {
      return res.status(400).json({
        success: false,
        error: 'بيانات الحجز غير مكتملة (الاسم، رقم الهاتف، والخدمة مطلوبة).',
      });
    }

    const cleanPhone = normalizePhone(customerPhone);

    // Idempotency Check: if a pending booking was created in the last 10 minutes with same phone & startsAt
    if (idempotencyKey || startsAt) {
      const recentDup = await query<any[]>(
        `SELECT id, status, total_at_booking, booking_fee_at_booking, queue_number, secure_token
         FROM bookings 
         WHERE customer_phone = ? AND starts_at = ? AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 1`,
        [cleanPhone, startsAt || new Date().toISOString()]
      );

      if (recentDup && recentDup.length > 0) {
        const dup = recentDup[0];
        return res.json({
          success: true,
          message: 'تم استرجاع الحجز المسجل مسبقاً (منع التكرار).',
          isDuplicate: true,
          data: {
            bookingId: dup.id,
            status: dup.status,
            queueNumber: dup.queue_number,
            secureToken: dup.secure_token,
            depositRequired: dup.booking_fee_at_booking,
            totalAmount: dup.total_at_booking,
          },
        });
      }
    }

    // Resolve Branch if not provided
    let finalBranchId = branchId;
    if (!finalBranchId) {
      const branches = await query<any[]>('SELECT id FROM branches WHERE is_active = 1 LIMIT 1');
      finalBranchId = branches[0]?.id;
    }

    const payload = {
      customerName: customerName.trim(),
      customerPhone: cleanPhone,
      branchId: finalBranchId,
      barberId: barberId || null,
      serviceId,
      additionalServiceIds,
      bookingType,
      startsAt: startsAt || new Date().toISOString(),
      notes: notes || 'تم الحجز عبر مساعد واتساب الذكي',
    };

    const newBooking = await createBooking(payload, { role: 'whatsapp_agent' }, req.ip);

    // Fetch Branch Payment Details for WhatsApp message
    const branchRows = await query<any[]>('SELECT * FROM branches WHERE id = ? LIMIT 1', [finalBranchId]);
    const branch = branchRows[0];

    return res.json({
      success: true,
      message: 'تم تسجيل الحجز المبدئي بنجاح.',
      data: {
        bookingId: newBooking.id,
        status: newBooking.status,
        queueNumber: newBooking.queue_number,
        secureToken: newBooking.secure_token,
        bookingType: newBooking.booking_type,
        startsAt: newBooking.starts_at,
        totalAmount: newBooking.total_at_booking,
        depositRequired: newBooking.booking_fee_at_booking,
        paymentDetails: {
          instapayUsername: branch?.instapay_username || 'salon.vip@instapay',
          vodafoneCashNumber: branch?.vodafone_cash_number || branch?.phone || '01000000000',
        },
      },
    });
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
    const { phone, bookingId, reason } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!bookingId || !cleanPhone) {
      return res.status(400).json({
        success: false,
        error: 'يرجى تزويد رقم الحجز ورقم الهاتف المسجل لتأكيد الإلغاء.',
      });
    }

    const booking = await getBookingById(bookingId.trim().toUpperCase());
    if (!booking) {
      return res.status(404).json({ success: false, error: 'الحجز غير موجود.' });
    }

    // Security Ownership Check
    const storedPhoneClean = normalizePhone(booking.customer_phone);
    if (!storedPhoneClean.endsWith(cleanPhone.slice(-8))) {
      return res.status(403).json({
        success: false,
        error: 'رقم الهاتف غير مطابق لبيانات الحجز المسجلة. لا يمكن إلغاء حجز خاص بعميل آخر.',
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
    if (!storedPhoneClean.endsWith(cleanPhone.slice(-8))) {
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

    if (!proofImageUrl) {
      return res.status(400).json({ success: false, error: 'رابط صورة إثبات الدفع مطلوب.' });
    }

    let targetBooking = null;

    if (bookingId) {
      targetBooking = await getBookingById(bookingId.trim().toUpperCase());
    } else if (cleanPhone) {
      const rows = await query<any[]>(
        `SELECT id FROM bookings 
         WHERE REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE ? 
           AND status IN ('awaiting_payment', 'draft')
         ORDER BY created_at DESC LIMIT 1`,
        [`%${cleanPhone.slice(-9)}%`]
      );
      if (rows && rows.length > 0) {
        targetBooking = await getBookingById(rows[0].id);
      }
    }

    if (!targetBooking) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على حجز معلق برسم الدفع لهذا الرقم.',
      });
    }

    const paymentProofObj = {
      image_url: proofImageUrl,
      sender_phone: cleanPhone || targetBooking.customer_phone,
      transaction_ref: transactionRef || `WA-TX-${Math.floor(100000 + Math.random() * 900000)}`,
      submitted_at: new Date().toISOString(),
      status: 'pending_review',
    };

    // Update booking to pending_review (never mark as approved automatically)
    await query(
      `UPDATE bookings 
       SET status = 'pending_review', payment_proof = ?, updated_at = NOW() 
       WHERE id = ?`,
      [JSON.stringify(paymentProofObj), targetBooking.id]
    );

    // Realtime notification to receptionist & manager
    broadcastToBranch(targetBooking.branch_id, 'PAYMENT_PROOF_SUBMITTED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name,
      customerPhone: targetBooking.customer_phone,
      amount: targetBooking.booking_fee_at_booking,
      proofUrl: proofImageUrl,
    });
    broadcastGlobal('PAYMENT_PROOF_SUBMITTED', {
      bookingId: targetBooking.id,
      customerName: targetBooking.customer_name,
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

export default router;
