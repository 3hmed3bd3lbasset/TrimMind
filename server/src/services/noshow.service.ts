import cron from 'node-cron';
import { query } from '../config/database.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';
import { offerSlotToNextEntry } from './waitlist.service.js';

export function initNoShowProtectionCron() {
  // Run every 10 minutes to auto-detect and reclaim lost chair time from no-shows
  cron.schedule('*/10 * * * *', async () => {
    try {
      // Find confirmed bookings whose start time passed by more than 30 minutes without arrival
      const overdueBookings = await query<any[]>(
        `SELECT b.* 
         FROM bookings b
         WHERE b.status = 'confirmed'
           AND b.starts_at IS NOT NULL
           AND b.starts_at < DATE_SUB(NOW(), INTERVAL 35 MINUTE)
           AND b.no_show_marked_at IS NULL`
      );

      if (overdueBookings && overdueBookings.length > 0) {
        console.log(`🛡️ No-show Protection: Found ${overdueBookings.length} overdue booking(s) to process.`);

        for (const b of overdueBookings) {
          // 1. Mark as no-show
          await query(
            'UPDATE bookings SET status = "no_show", no_show_marked_at = NOW(), updated_at = NOW() WHERE id = ?',
            [b.id]
          );

          // 2. Release chair if held
          if (b.chair_id) {
            await query(
              'UPDATE chairs SET status = "available", current_booking_id = NULL, service_ends_at = NULL WHERE id = ?',
              [b.chair_id]
            ).catch(() => {});
          }

          // 3. Trigger Smart Waitlist hook to offer the freed slot to next waiting customer
          offerSlotToNextEntry(b.branch_id, b.barber_id, b.booking_date).catch(() => {});

          // 4. Notify staff and screens
          broadcastToBranch(b.branch_id, 'BOOKING_NO_SHOW', { bookingId: b.id, customerName: b.customer_name });
          broadcastGlobal('SYNC_STATE', { bookingId: b.id, status: 'no_show' });
        }
      }
    } catch (err: any) {
      console.warn('No-show protection cron notice:', err.message);
    }
  });

  console.log('⏰ Auto No-show Protection & Chair Reclaiming Cron initialized.');
}
