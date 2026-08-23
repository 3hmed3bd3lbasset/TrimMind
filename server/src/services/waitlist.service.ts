import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { createBooking } from './booking.service.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

export interface JoinWaitlistPayload {
  branchId: string;
  barberId?: string;
  customerName: string;
  customerPhone: string;
  preferredDate: string;
  preferredTimeWindow?: string;
  serviceId?: string;
}

// 1. Join Waitlist
export async function joinWaitlist(payload: JoinWaitlistPayload) {
  let cleanPhone = payload.customerPhone.replace(/\D+/g, '');
  if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }

  // Check if customer is already waiting on the same date/branch
  const existing = await query<any[]>(
    `SELECT id FROM waitlist_entries 
     WHERE customer_phone = ? AND branch_id = ? AND preferred_date = ? AND status = 'waiting' LIMIT 1`,
    [cleanPhone, payload.branchId, payload.preferredDate]
  );

  if (existing && existing.length > 0) {
    throw new Error('أنت مسجل بالفعل في قائمة الانتظار لهذا التاريخ والفرع.');
  }

  const id = uuidv4();
  await query(
    `INSERT INTO waitlist_entries (
      id, branch_id, barber_id, customer_name, customer_phone, preferred_date,
      preferred_time_window, service_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', NOW())`,
    [
      id,
      payload.branchId,
      payload.barberId || null,
      payload.customerName,
      cleanPhone,
      payload.preferredDate,
      payload.preferredTimeWindow || 'أي وقت متاح',
      payload.serviceId || 'srv-haircut-classic',
    ]
  );

  const newEntry = {
    id,
    branch_id: payload.branchId,
    barber_id: payload.barberId,
    customer_name: payload.customerName,
    customer_phone: cleanPhone,
    preferred_date: payload.preferredDate,
    preferred_time_window: payload.preferredTimeWindow,
    service_id: payload.serviceId,
    status: 'waiting',
    created_at: new Date().toISOString(),
  };

  broadcastToBranch(payload.branchId, 'WAITLIST_UPDATED', newEntry);
  broadcastGlobal('SYNC_STATE', { type: 'WAITLIST_JOINED', entryId: id });

  return newEntry;
}

// 2. Get Waitlist Entries for Branch
export async function getBranchWaitlist(branchId: string, date?: string) {
  let sql = `
    SELECT w.*, 
           COALESCE(b.full_name, 'أي كابتن متاح') as barber_name,
           COALESCE(s.name, 'خدمة الصالون') as service_name
    FROM waitlist_entries w
    LEFT JOIN barbers b ON w.barber_id = b.id
    LEFT JOIN services s ON w.service_id = s.id
    WHERE w.branch_id = ?
  `;
  const params: any[] = [branchId];

  if (date) {
    sql += ' AND w.preferred_date = ?';
    params.push(date);
  }

  sql += ' ORDER BY w.created_at ASC';
  return await query<any[]>(sql, params);
}

// 3. Offer Slot To Next Waitlist Entry when a booking is cancelled
export async function offerSlotToNextEntry(branchId: string, barberId?: string | null, date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    let sql = `
      SELECT * FROM waitlist_entries 
      WHERE branch_id = ? AND preferred_date = ? AND status = 'waiting'
    `;
    const params: any[] = [branchId, targetDate];

    if (barberId) {
      sql += ' AND (barber_id = ? OR barber_id IS NULL)';
      params.push(barberId);
    }

    sql += ' ORDER BY created_at ASC LIMIT 1';

    const candidates = await query<any[]>(sql, params);
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const candidate = candidates[0];
    const offerToken = `WLT-${uuidv4().substring(0, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes window

    await query(
      `UPDATE waitlist_entries 
       SET status = 'offered', offer_token = ?, offered_at = NOW(), offer_expires_at = ?
       WHERE id = ?`,
      [offerToken, expiresAt, candidate.id]
    );

    // Send WhatsApp notification with claim token
    if (candidate.customer_phone) {
      import('./whatsapp.service.js').then(({ sendWhatsAppText }) => {
        const msg = `أهلاً بك يا ${candidate.customer_name}! 💈🎉\n\nتتوفر الآن فرصة حجز وموعد شاغر لدى صالون TrimMind (الحداد VIP) في تاريخ ${candidate.preferred_date}!\n\n⏳ لديك مهلة 25 دقيقة لتأكيد حجزك واختيار الموعد المناسب قبل إتاحة الفرصة للشخص التالي:\n\n👉 اضغط هنا لتأكيد الحجز فوراً:\nhttps://trimmind.up.railway.app/track?claim=${offerToken}\n\nنتشرف بزيارتك دائماً! 👑✂️`;
        sendWhatsAppText(candidate.customer_phone, msg).catch(() => {});
      }).catch(() => {});
    }

    broadcastToBranch(branchId, 'WAITLIST_UPDATED', { id: candidate.id, status: 'offered', offerToken });
    broadcastGlobal('SYNC_STATE', { type: 'WAITLIST_OFFERED', entryId: candidate.id });

    return { candidateId: candidate.id, offerToken, expiresAt };
  } catch (err: any) {
    console.warn('offerSlotToNextEntry notice:', err.message);
    return null;
  }
}

// 4. Claim Waitlist Offer
export async function claimWaitlistOffer(token: string) {
  const cleanToken = token.trim().toUpperCase();
  const rows = await query<any[]>(
    `SELECT * FROM waitlist_entries 
     WHERE offer_token = ? AND status = 'offered' AND offer_expires_at > NOW() LIMIT 1`,
    [cleanToken]
  );

  if (!rows || rows.length === 0) {
    throw new Error('عذراً، هذا العرض غير صالح أو انتهت مهلة الـ 25 دقيقة المخصصة لتأكيده.');
  }

  const entry = rows[0];

  // Convert to real pending booking
  const booking = await createBooking({
    branchId: entry.branch_id,
    barberId: entry.barber_id,
    customerName: entry.customer_name,
    customerPhone: entry.customer_phone,
    serviceId: entry.service_id || 'srv-haircut-classic',
    bookingType: 'normal',
    notes: `تم الحجز عبر قائمة الانتظار الذكية (عرض رقم ${cleanToken})`,
  });

  await query(
    `UPDATE waitlist_entries 
     SET status = 'claimed', claimed_booking_id = ?
     WHERE id = ?`,
    [booking.id, entry.id]
  );

  broadcastToBranch(entry.branch_id, 'WAITLIST_UPDATED', { id: entry.id, status: 'claimed' });
  broadcastGlobal('SYNC_STATE', { type: 'WAITLIST_CLAIMED', entryId: entry.id });

  return { booking, entry };
}

// 5. Promote Waitlist Entry Manually (Manager / Receptionist)
export async function promoteWaitlistEntry(entryId: string) {
  const rows = await query<any[]>(
    'SELECT * FROM waitlist_entries WHERE id = ? LIMIT 1',
    [entryId]
  );

  if (!rows || rows.length === 0) {
    throw new Error('طلب قائمة الانتظار غير موجود.');
  }

  const candidate = rows[0];
  const offerToken = `WLT-${uuidv4().substring(0, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await query(
    `UPDATE waitlist_entries 
     SET status = 'offered', offer_token = ?, offered_at = NOW(), offer_expires_at = ?
     WHERE id = ?`,
    [offerToken, expiresAt, candidate.id]
  );

  if (candidate.customer_phone) {
    import('./whatsapp.service.js').then(({ sendWhatsAppText }) => {
      const msg = `مرحباً يا ${candidate.customer_name}! 💈👑\nقام فريق الاستقبال بصالون TrimMind بإتاحة موعد خاص لك بناءً على طلبك في قائمة الانتظار.\n\n👉 لتأكيد الحجز:\nhttps://trimmind.up.railway.app/track?claim=${offerToken}`;
      sendWhatsAppText(candidate.customer_phone, msg).catch(() => {});
    }).catch(() => {});
  }

  broadcastToBranch(candidate.branch_id, 'WAITLIST_UPDATED', { id: candidate.id, status: 'offered', offerToken });
  return { success: true, offerToken, expiresAt };
}
