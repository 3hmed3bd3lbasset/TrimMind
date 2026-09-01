import { v4 as uuidv4 } from 'uuid';
import { IBookingRepository, CreateBookingData } from '../../domain/repositories/IBookingRepository.js';
import { Booking, BookingStatus } from '../../domain/entities/Booking.entity.js';
import { query, queryConn, withTransaction } from '../../config/database.js';
import { getPersistentDb, addOrUpdatePersistentBooking } from '../../services/persistentStorage.service.js';

export function computeCairoSmartNormalTime(
  bookingDate: string,
  queueNumber: number,
  openingTime: string = '10:00',
  closingTime: string = '23:30'
): string {
  const now = new Date();
  const cairoDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const isToday = bookingDate === cairoDateStr;

  const [openHourStr, openMinStr] = (openingTime || '10:00').split(':');
  const openHour = parseInt(openHourStr, 10) || 10;
  const openMin = parseInt(openMinStr, 10) || 0;

  const [closeHourStr, closeMinStr] = (closingTime || '23:30').split(':');
  const closeHour = parseInt(closeHourStr, 10) || 23;
  const closeMin = parseInt(closeMinStr, 10) || 30;
  const closeTotalMinutes = closeHour * 60 + closeMin;

  let baseMinutes = openHour * 60 + openMin;

  if (isToday) {
    const cairoTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = cairoTimeFormatter.formatToParts(now);
    const nowHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '12', 10);
    const nowMin = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const nowTotalMinutes = nowHour * 60 + nowMin;

    if (nowTotalMinutes >= baseMinutes) {
      baseMinutes = Math.ceil((nowTotalMinutes + 15) / 15) * 15;
    }
  }

  const queueOffsetMinutes = Math.max(0, queueNumber - 1) * 30;
  let targetMinutes = baseMinutes + queueOffsetMinutes;

  if (targetMinutes > closeTotalMinutes - 15) {
    targetMinutes = Math.min(targetMinutes, closeTotalMinutes - 15);
  }

  const resHour = Math.floor(targetMinutes / 60) % 24;
  const resMin = targetMinutes % 60;

  const hh = resHour < 10 ? `0${resHour}` : `${resHour}`;
  const mm = resMin < 10 ? `0${resMin}` : `${resMin}`;
  return `${bookingDate} ${hh}:${mm}:00`;
}

export class MySQLBookingRepository implements IBookingRepository {
  public async createWithTransaction(data: CreateBookingData, actorId?: string): Promise<Booking> {
    const bookingId = data.id || `BK-${Math.floor(1000 + Math.random() * 9000)}`;
    const secureToken = `SEC-${uuidv4().substring(0, 8).toUpperCase()}`;
    const rawStartsAt = data.startsAt || new Date().toISOString();
    const bookingDate = rawStartsAt.split('T')[0];
    const startsAtSql = rawStartsAt.replace('T', ' ').replace('Z', '').substring(0, 19);
    const endsAtSql = data.endsAt ? data.endsAt.replace('T', ' ').replace('Z', '').substring(0, 19) : null;

    try {
      return await withTransaction(async (conn) => {
        // 1. Validate Branch
        let finalBranchId = data.branchId || 'branch-elhdad';
        const branchRows = await queryConn<any[]>(conn, 'SELECT id, name FROM branches WHERE id = ? LIMIT 1', [finalBranchId]);
        let branchName = 'الحداد - ELHDAD';
        if (!branchRows || branchRows.length === 0) {
          const firstBranch = await queryConn<any[]>(conn, 'SELECT id, name FROM branches LIMIT 1');
          if (firstBranch && firstBranch.length > 0) {
            finalBranchId = firstBranch[0].id;
            branchName = firstBranch[0].name;
          }
        } else {
          branchName = branchRows[0].name;
        }

        // 2. Fetch service & calculate prices
        const isCustomService =
          data.serviceId === 'srv-custom' ||
          data.status === 'custom_pricing_requested' ||
          Boolean(data.notes && (data.notes.includes('[طلب تخصيص خدمة]') || data.notes.includes('طلب خدمة مخصصة')));

        let servicePrice = isCustomService ? 0 : (data.servicePrice ?? 180);
        let serviceName = data.serviceName || (isCustomService ? 'خدمة مخصصة على مزاجك' : 'قص شعر كلاسيكي');
        if (data.serviceId && !isCustomService) {
          const serviceRows = await queryConn<any[]>(conn, 'SELECT id, name, price FROM services WHERE id = ? LIMIT 1', [data.serviceId]);
          if (serviceRows && serviceRows.length > 0) {
            if (!data.serviceName || data.serviceName === 'خدمة الصالون' || data.serviceName === 'خدمة محددة') {
              servicePrice = Number(serviceRows[0].price);
              serviceName = serviceRows[0].name;
            }
          }
        }

        if (data.additionalServiceIds && data.additionalServiceIds.length > 0 && !isCustomService) {
          for (const addId of data.additionalServiceIds) {
            const addSrv = await queryConn<any[]>(conn, 'SELECT price FROM services WHERE id = ? LIMIT 1', [addId]);
            if (addSrv && addSrv.length > 0) {
              servicePrice += Number(addSrv[0].price);
            }
          }
        }

        // 3. Products
        let itemsTotal = 0;
        const itemsToInsert: any[] = [];
        if (data.selectedProducts && data.selectedProducts.length > 0) {
          for (const p of data.selectedProducts) {
            const prodRows = await queryConn<any[]>(conn, 'SELECT id, name, price FROM products WHERE id = ? LIMIT 1', [p.productId]);
            if (prodRows && prodRows.length > 0) {
              const pPrice = Number(prodRows[0].price);
              itemsTotal += pPrice * p.quantity;
              itemsToInsert.push({
                id: uuidv4(),
                booking_id: bookingId,
                product_id: prodRows[0].id,
                name: prodRows[0].name,
                price_at_booking: pPrice,
                quantity: p.quantity,
              });
            }
          }
        }

        // 4. Booking Fee
        let bookingFee = data.paymentProof?.amount
          ? Number(data.paymentProof.amount)
          : (data.bookingType === 'vip' ? 100 : 50);

        // 5. ATOMIC ROW-LOCKED QUEUE NUMBER GENERATION
        const activeBookings = await queryConn<any[]>(
          conn,
          `SELECT queue_number FROM bookings 
           WHERE branch_id = ? AND booking_date = ? AND status != 'cancelled'
           ORDER BY queue_number ASC FOR UPDATE`,
          [finalBranchId, bookingDate]
        );
        let assignedQueueNumber = 1;
        const existingNums = new Set<number>(activeBookings.map((b) => b.queue_number).filter(Boolean));
        while (existingNums.has(assignedQueueNumber)) {
          assignedQueueNumber++;
        }

        // Smart Cairo-aware queue appointment timing for Normal bookings
        let finalStartsAtSql = startsAtSql;
        let finalEndsAtSql = endsAtSql;
        if (data.bookingType === 'normal') {
          finalStartsAtSql = computeCairoSmartNormalTime(
            bookingDate,
            assignedQueueNumber,
            (branchRows && branchRows.length > 0 ? branchRows[0].opening_time : '10:00') || '10:00',
            (branchRows && branchRows.length > 0 ? branchRows[0].closing_time : '23:30') || '23:30'
          );
        }

        // 6. Strict VIP & Barber Conflict Locking (Atomic Row-Level Lock)
        if (data.barberId && finalStartsAtSql) {
          const barberConflicts = await queryConn<any[]>(
            conn,
            `SELECT id FROM bookings 
             WHERE barber_id = ? 
               AND starts_at = ? 
               AND status IN ('confirmed', 'pending_review', 'payment_submitted', 'awaiting_payment', 'customer_arrived', 'in_service')
             LIMIT 1 FOR UPDATE`,
            [data.barberId, finalStartsAtSql]
          );
          if (barberConflicts && barberConflicts.length > 0) {
            throw new Error('عفواً، تم حجز هذا الموعد للتو مع الكابتن المختار بواسطة عميل آخر، يرجى اختيار موعد بديل.');
          }
        }

        if (data.chairId) {
          const chairRows = await queryConn<any[]>(conn, 'SELECT id, status FROM chairs WHERE id = ? FOR UPDATE', [data.chairId]);
          if (chairRows && chairRows.length > 0 && chairRows[0].status === 'offline') {
            throw new Error('الكرسي المحدد خارج الخدمة حالياً.');
          }
        }

        const initialStatus: BookingStatus = data.status || (isCustomService ? 'custom_pricing_requested' : (data.paymentProof ? 'pending_review' : 'awaiting_payment'));
        const total = isCustomService ? (data.totalAmount ?? itemsTotal) : (data.totalAmount ?? (servicePrice + itemsTotal));

        let cleanPhone = (data.customerPhone || '').replace(/\D+/g, '');
        if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
          cleanPhone = '0' + cleanPhone.substring(2);
        }

        // 7. Insert Booking
        await queryConn(
          conn,
          `INSERT INTO bookings (
            id, customer_id, customer_name, customer_phone, branch_id, barber_id, chair_id,
            service_id, additional_service_ids, booking_type, status, starts_at, ends_at,
            booking_date, queue_number, service_price_at_booking, booking_fee_at_booking,
            discount_at_booking, items_total_at_booking, total_at_booking, secure_token, notes,
            source, ai_brief, confidence_score, needs_human_attention, custom_line_items
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            bookingId, actorId || uuidv4(), data.customerName, cleanPhone, finalBranchId,
            data.barberId || null, data.chairId || null, data.serviceId, JSON.stringify(data.additionalServiceIds || []),
            data.bookingType, initialStatus, finalStartsAtSql, finalEndsAtSql,
            bookingDate, assignedQueueNumber, servicePrice, bookingFee, 0, itemsTotal, total, secureToken, data.notes || null,
            data.source || 'web', data.aiBrief || null, data.confidenceScore || 90, Boolean(data.needsHumanAttention), JSON.stringify(data.customLineItems || []),
          ]
        );

        for (const item of itemsToInsert) {
          await queryConn(
            conn,
            `INSERT INTO booking_items (id, booking_id, product_id, name, price_at_booking, quantity)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [item.id, item.booking_id, item.product_id, item.name, item.price_at_booking, item.quantity]
          );
        }

        // 8. Track Recall Campaign Attribution if customer was re-engaged
        try {
          await queryConn(
            conn,
            `UPDATE recall_sends 
             SET status = 'rebooked', rebooked_at = NOW(), rebooked_booking_id = ? 
             WHERE customer_phone = ? AND status = 'sent' AND rebooked_booking_id IS NULL
             ORDER BY sent_at DESC LIMIT 1`,
            [bookingId, cleanPhone]
          );
        } catch {}

        let proofEntity: any = null;
        if (data.paymentProof) {
          proofEntity = {
            id: uuidv4(),
            booking_id: bookingId,
            image_path: data.paymentProof.imagePath || (data.paymentProof as any).image_url || (data.paymentProof as any).imageUrl || 'data:image/placeholder',
            payment_method: (data.paymentProof.paymentMethod || 'instapay') as any,
            sender_phone: data.paymentProof.senderPhone || cleanPhone,
            transferred_amount: Number(data.paymentProof.amount || (data.paymentProof as any).transferred_amount || bookingFee),
            status: 'pending_review' as const,
            submitted_at: new Date().toISOString(),
          };

          await queryConn(
            conn,
            `INSERT INTO payment_proofs (
              id, booking_id, image_path, payment_method, sender_phone, transferred_amount, status, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              proofEntity.id, proofEntity.booking_id, proofEntity.image_path, proofEntity.payment_method,
              proofEntity.sender_phone, proofEntity.transferred_amount, proofEntity.status, proofEntity.submitted_at,
            ]
          );
        }

        // Fetch Barber Name
        let barberName = 'كابتن الصالون';
        if (data.barberId) {
          const barbRows = await queryConn<any[]>(conn, 'SELECT full_name FROM barbers WHERE id = ? LIMIT 1', [data.barberId]);
          if (barbRows && barbRows.length > 0) barberName = barbRows[0].full_name;
        }

        const bookingEntity = new Booking(
          bookingId,
          actorId || null,
          data.customerName,
          cleanPhone,
          finalBranchId,
          data.barberId || null,
          data.chairId || null,
          data.serviceId,
          data.additionalServiceIds || [],
          data.bookingType,
          initialStatus,
          finalStartsAtSql ? finalStartsAtSql.replace(' ', 'T') + '.000Z' : (data.startsAt || new Date().toISOString()),
          finalEndsAtSql ? finalEndsAtSql.replace(' ', 'T') + '.000Z' : (data.endsAt || null),
          bookingDate,
          assignedQueueNumber,
          servicePrice,
          bookingFee,
          0,
          itemsTotal,
          total,
          secureToken,
          data.notes || null,
          new Date().toISOString(),
          itemsToInsert,
          proofEntity,
          serviceName,
          barberName,
          branchName,
          data.source || 'web',
          data.aiBrief || undefined,
          data.confidenceScore || 90,
          Boolean(data.needsHumanAttention),
          null,
          data.customLineItems || []
        );

        addOrUpdatePersistentBooking(bookingEntity);
        return bookingEntity;
      });
    } catch (dbErr: any) {
      console.warn('[DB Booking Fallback Mode]:', dbErr?.message);

      // Resilient Fallback: Construct Booking from persistent storage & save
      const pDb = getPersistentDb();
      const pBookings = pDb.bookings || [];
      const service = pDb.services?.find((s: any) => s.id === data.serviceId);
      const barber = pDb.barbers?.find((b: any) => b.id === data.barberId);
      const branch = pDb.branches?.find((br: any) => br.id === data.branchId);

      const isCustomService =
        data.serviceId === 'srv-custom' ||
        data.status === 'custom_pricing_requested' ||
        Boolean(data.notes && (data.notes.includes('[طلب تخصيص خدمة]') || data.notes.includes('طلب خدمة مخصصة')));

      const servicePrice = isCustomService ? 0 : (data.servicePrice ?? service?.price ?? 180);
      const serviceName = data.serviceName || (isCustomService ? 'خدمة مخصصة على مزاجك' : (service?.name || 'قص شعر كلاسيكي'));
      const barberName = (data as any).barberName || barber?.full_name || 'كابتن الصالون';
      const branchName = (data as any).branchName || branch?.name || 'الحداد - ELHDAD';

      let cleanPhone = (data.customerPhone || '').replace(/\D+/g, '');
      if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }

      const dayBookings = pBookings.filter((b: any) => (b.booking_date === bookingDate || b.starts_at?.startsWith(bookingDate)) && b.status !== 'cancelled');
      const assignedQueueNumber = dayBookings.length + 1;
      const initialStatus: BookingStatus = data.status || (isCustomService ? 'custom_pricing_requested' : (data.paymentProof ? 'pending_review' : 'awaiting_payment'));
      const bookingFee = data.paymentProof?.amount ? Number(data.paymentProof.amount) : (data.bookingType === 'vip' ? 100 : 50);
      const total = isCustomService ? (data.totalAmount ?? 0) : (data.totalAmount ?? servicePrice);

      let fallbackStartsAt = data.startsAt || new Date().toISOString();
      if (data.bookingType === 'normal') {
        const smartSql = computeCairoSmartNormalTime(
          bookingDate,
          assignedQueueNumber,
          branch?.opening_time || '10:00',
          branch?.closing_time || '23:30'
        );
        fallbackStartsAt = smartSql.replace(' ', 'T') + '.000Z';
      }

      const fallbackBooking = new Booking(
        bookingId,
        actorId || null,
        data.customerName,
        cleanPhone,
        data.branchId || 'branch-elhdad',
        data.barberId || null,
        data.chairId || null,
        data.serviceId,
        data.additionalServiceIds || [],
        data.bookingType,
        initialStatus,
        fallbackStartsAt,
        data.endsAt || null,
        bookingDate,
        assignedQueueNumber,
        servicePrice,
        bookingFee,
        0,
        0,
        total,
        secureToken,
        data.notes || null,
        new Date().toISOString(),
        [],
        data.paymentProof as any,
        serviceName,
        barberName,
        branchName,
        data.source || 'web',
        data.aiBrief || undefined,
        data.confidenceScore || 90,
        Boolean(data.needsHumanAttention),
        null,
        data.customLineItems || []
      );

      addOrUpdatePersistentBooking(fallbackBooking);
      return fallbackBooking;
    }
  }

  public async findById(bookingId: string): Promise<Booking | null> {
    try {
      const rows = await query<any[]>(
        `SELECT b.*, 
                COALESCE(s.name, 'خدمة الصالون') as service_name, 
                COALESCE(bar.full_name, 'كابتن الصالون') as barber_name,
                COALESCE(br.name, 'الحداد - ELHDAD') as branch_name
         FROM bookings b
         LEFT JOIN services s ON b.service_id = s.id
         LEFT JOIN barbers bar ON b.barber_id = bar.id
         LEFT JOIN branches br ON b.branch_id = br.id
         WHERE b.id = ? LIMIT 1`,
        [bookingId]
      );
      if (!rows || rows.length === 0) return null;
      const b = rows[0];

      const items = (await query<any[]>('SELECT * FROM booking_items WHERE booking_id = ?', [bookingId]).catch(() => [])) || [];
      const proofs = (await query<any[]>('SELECT * FROM payment_proofs WHERE booking_id = ? LIMIT 1', [bookingId]).catch(() => [])) || [];

      let additionalIds: string[] = [];
      if (b.additional_service_ids) {
        if (Array.isArray(b.additional_service_ids)) {
          additionalIds = b.additional_service_ids;
        } else if (typeof b.additional_service_ids === 'string') {
          try {
            additionalIds = JSON.parse(b.additional_service_ids);
          } catch {
            additionalIds = [];
          }
        }
      }

      return new Booking(
        b.id,
        b.customer_id,
        b.customer_name,
        b.customer_phone,
        b.branch_id,
        b.barber_id,
        b.chair_id,
        b.service_id,
        additionalIds,
        b.booking_type,
        b.status,
        b.starts_at,
        b.ends_at,
        b.booking_date,
        b.queue_number,
        Number(b.service_price_at_booking || 180),
        Number(b.booking_fee_at_booking || 50),
        Number(b.discount_at_booking || 0),
        Number(b.items_total_at_booking || 0),
        Number(b.total_at_booking || 180),
        b.secure_token,
        b.notes,
        b.created_at,
        items,
        proofs[0] || null,
        b.service_name,
        b.barber_name,
        b.branch_name,
        b.source || 'web',
        b.ai_brief || undefined,
        Number(b.confidence_score || 90),
        Boolean(b.needs_human_attention),
        b.handoff_expires_at || null,
        typeof b.custom_line_items === 'string' ? JSON.parse(b.custom_line_items || '[]') : b.custom_line_items || []
      );
    } catch (err) {
      console.warn('MySQLBookingRepository.findById error ignored:', err);
      return null;
    }
  }

  public async findBySecureToken(token: string): Promise<Booking | null> {
    const rows = await query<any[]>('SELECT id FROM bookings WHERE secure_token = ? LIMIT 1', [token]);
    if (!rows || rows.length === 0) return null;
    return this.findById(rows[0].id);
  }

  public async search(q: string, branchId?: string): Promise<Booking[]> {
    const clean = q.trim().toLowerCase();
    const phone = q.replace(/\D+/g, '');

    let sql = `
      SELECT b.id FROM bookings b
      WHERE (b.id = ? OR b.customer_phone LIKE ? OR LOWER(b.customer_name) LIKE ? OR b.secure_token = ?)
    `;
    const params: any[] = [q, `%${phone}%`, `%${clean}%`, q];

    if (branchId) {
      sql += ' AND b.branch_id = ?';
      params.push(branchId);
    }
    sql += ' ORDER BY b.created_at DESC LIMIT 20';

    const rows = await query<any[]>(sql, params);
    const results: Booking[] = [];
    for (const r of rows) {
      const b = await this.findById(r.id);
      if (b) results.push(b);
    }
    return results;
  }

  public async updateStatus(bookingId: string, status: BookingStatus, note?: string, actorId?: string): Promise<Booking> {
    await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [status, bookingId]);
    const b = await this.findById(bookingId);
    if (!b) throw new Error('Booking not found');
    return b;
  }

  public async reviewPaymentProof(bookingId: string, status: 'approved' | 'rejected', reason?: string, reviewerId?: string): Promise<Booking> {
    const nextStatus: BookingStatus = status === 'approved' ? 'confirmed' : 'rejected';
    await query(
      'UPDATE payment_proofs SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE booking_id = ?',
      [status, reason || null, reviewerId || null, bookingId]
    );
    await query('UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?', [nextStatus, bookingId]);
    const b = await this.findById(bookingId);
    if (!b) throw new Error('Booking not found');
    return b;
  }

  public async findOverdueConfirmed(graceMinutes: number): Promise<Booking[]> {
    const rows = await query<any[]>(
      `SELECT id FROM bookings
       WHERE status = 'confirmed'
         AND starts_at IS NOT NULL
         AND starts_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND no_show_marked_at IS NULL`,
      [graceMinutes]
    );
    const results: Booking[] = [];
    for (const r of rows) {
      const b = await this.findById(r.id);
      if (b) results.push(b);
    }
    return results;
  }

  public async markNoShow(bookingId: string): Promise<void> {
    await query('UPDATE bookings SET status = "no_show", no_show_marked_at = NOW(), updated_at = NOW() WHERE id = ?', [bookingId]);
  }

  public async updateCustomPricing(data: {
    bookingId: string;
    serviceName: string;
    totalAmount: number;
    depositRequired: number;
    discount: number;
    customLineItems: any[];
    barberId?: string | null;
    barberName?: string | null;
  }): Promise<Booking> {
    await query(
      `UPDATE bookings 
       SET status = 'confirmed',
           service_name = ?,
           barber_id = COALESCE(?, barber_id),
           barber_name = COALESCE(?, barber_name),
           custom_line_items = ?,
           discount_at_booking = ?,
           total_at_booking = ?,
           service_price_at_booking = ?,
           booking_fee_at_booking = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        data.serviceName,
        data.barberId || null,
        data.barberName || null,
        JSON.stringify(data.customLineItems || []),
        data.discount,
        data.totalAmount,
        data.totalAmount + data.discount,
        data.depositRequired,
        data.bookingId,
      ]
    );

    const b = await this.findById(data.bookingId);
    if (!b) throw new Error('Booking not found after updating custom pricing');
    return b;
  }

  public async updateDraft(data: {
    bookingId: string;
    serviceId?: string;
    serviceName?: string;
    additionalServiceIds?: string[];
    barberId?: string | null;
    barberName?: string | null;
    startsAt?: string;
    notes?: string;
  }): Promise<Booking> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    if (data.serviceId) {
      setClauses.push('service_id = ?');
      params.push(data.serviceId);
    }
    if (data.serviceName) {
      setClauses.push('service_name = ?');
      params.push(data.serviceName);
    }
    if (data.additionalServiceIds) {
      setClauses.push('additional_service_ids = ?');
      params.push(JSON.stringify(data.additionalServiceIds));
    }
    if (data.barberId !== undefined) {
      setClauses.push('barber_id = ?');
      params.push(data.barberId || null);
    }
    if (data.barberName !== undefined) {
      setClauses.push('barber_name = ?');
      params.push(data.barberName || null);
    }
    if (data.startsAt) {
      setClauses.push('starts_at = ?');
      params.push(data.startsAt);
      const bookingDate = data.startsAt.split('T')[0].split(' ')[0];
      setClauses.push('booking_date = ?');
      params.push(bookingDate);
    }
    if (data.notes) {
      setClauses.push('notes = ?');
      params.push(data.notes);
    }

    params.push(data.bookingId);
    await query(`UPDATE bookings SET ${setClauses.join(', ')} WHERE id = ?`, params);

    const b = await this.findById(data.bookingId);
    if (!b) throw new Error('Booking not found after updating draft');
    return b;
  }

  public async cancel(bookingId: string, reason?: string, actorId?: string): Promise<void> {
    await query(
      'UPDATE bookings SET status = "cancelled", cancellation_reason = ?, cancelled_at = NOW(), updated_at = NOW() WHERE id = ?',
      [reason || 'إلغاء حجز', bookingId]
    );
  }
}
