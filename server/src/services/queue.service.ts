import { query } from '../config/database.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

export async function getBranchQueue(branchId: string) {
  const todayStr = new Date().toISOString().split('T')[0];

  const activeBookings = await query<any[]>(
    `SELECT b.*, s.name as service_name, bar.full_name as barber_name 
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     LEFT JOIN barbers bar ON b.barber_id = bar.id
     WHERE b.branch_id = ? 
       AND (b.status = 'confirmed' OR b.status = 'customer_arrived' OR b.status = 'in_service')
       AND b.booking_date = ?
     ORDER BY 
       CASE WHEN b.status = 'in_service' THEN 0 ELSE 1 END,
       b.queue_number ASC`,
    [branchId, todayStr]
  );

  return activeBookings.map((b, idx) => ({
    id: b.id,
    branch_id: b.branch_id,
    chair_id: b.chair_id,
    booking_id: b.id,
    customer_name: b.customer_name,
    service_name: b.service_name || 'خدمة حلاقة',
    barber_name: b.barber_name || 'كابتن الصالون',
    position: b.queue_number || idx + 1,
    status: b.status,
    estimated_wait_minutes: Math.max(0, idx * 25),
    created_at: b.created_at,
  }));
}

export async function callNextCustomerForBarber(barberId: string, actor?: any) {
  const barbers = await query<any[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [barberId]);
  if (!barbers || barbers.length === 0) {
    throw new Error('الحلاق غير مسجل');
  }
  const barber = barbers[0];
  const todayStr = new Date().toISOString().split('T')[0];

  // Find next active confirmed / arrived customer assigned to this barber or branch (skipping cancelled)
  const activeBookings = await query<any[]>(
    `SELECT * FROM bookings 
     WHERE (status = 'confirmed' OR status = 'customer_arrived')
       AND (barber_id = ? OR (branch_id = ? AND barber_id IS NULL))
       AND booking_date = ?
     ORDER BY queue_number ASC LIMIT 1`,
    [barberId, barber.branch_id, todayStr]
  );

  if (!activeBookings || activeBookings.length === 0) {
    return null;
  }

  const nextBooking = activeBookings[0];

  // Find available chair
  const availableChairs = await query<any[]>(
    'SELECT * FROM chairs WHERE barber_id = ? AND status = "available" LIMIT 1',
    [barberId]
  );

  const chairId = availableChairs[0]?.id || nextBooking.chair_id || null;

  // Transition status to in_service
  await query(
    `UPDATE bookings 
     SET status = 'in_service', chair_id = ?, updated_at = NOW() 
     WHERE id = ?`,
    [chairId, nextBooking.id]
  );

  if (chairId) {
    await query(
      `UPDATE chairs 
       SET status = 'in_service', current_booking_id = ?, service_ends_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE) 
       WHERE id = ?`,
      [nextBooking.id, chairId]
    );
  }

  const eventPayload = {
    customerName: nextBooking.customer_name,
    barberName: barber.full_name,
    chairName: availableChairs[0]?.name || 'كرسي الحلاقة',
    ticketNumber: `#${nextBooking.queue_number || ''}`,
    bookingId: nextBooking.id,
    timestamp: Date.now(),
  };

  // Broadcast call event to TV and screens
  broadcastToBranch(barber.branch_id, 'CUSTOMER_CALLED', eventPayload);
  broadcastGlobal('CUSTOMER_CALLED', eventPayload);

  return eventPayload;
}
