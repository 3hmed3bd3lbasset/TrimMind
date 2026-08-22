import { query } from '../config/database.js';
import { liveSyncedBookings } from '../routes/agentTools.routes.js';
import { sendWhatsAppText } from './whatsapp.service.js';

const remindedBookings = new Set<string>();

export function initReminderService() {
  console.log('⏰ WhatsApp Queue & Appointment Reminder Engine Started (60s tick)');

  setInterval(async () => {
    try {
      const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const todayStr = `${nowCairo.getFullYear()}-${String(nowCairo.getMonth() + 1).padStart(2, '0')}-${String(nowCairo.getDate()).padStart(2, '0')}`;
      const currentHour = nowCairo.getHours();
      const currentMinute = nowCairo.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;

      // 1. Check in-memory liveSyncedBookings
      for (const b of liveSyncedBookings) {
        if (b.status === 'confirmed' && (b.customerPhone || b.customer_phone) && !remindedBookings.has(b.id)) {
          const bookingDate = (b.starts_at || b.startsAt || '').split('T')[0].split(' ')[0];
          
          // ⚠️ STRICT CHECK: MUST BE TODAY ONLY! Do not alert for tomorrow or future days!
          if (bookingDate && bookingDate !== todayStr) {
            continue;
          }

          // If booking has a specific time, only remind within 90 minutes before the appointment!
          const timePartMatch = (b.starts_at || b.startsAt || '').match(/(\d{1,2}):(\d{2})/);
          if (timePartMatch) {
            const bHour = parseInt(timePartMatch[1], 10);
            const bMin = parseInt(timePartMatch[2], 10);
            const bTimeMinutes = bHour * 60 + bMin;
            const diffMinutes = bTimeMinutes - currentTimeMinutes;
            if (diffMinutes > 90 || diffMinutes < -120) {
              continue;
            }
          }

          const queuePos = b.queueNumber || b.queue_number || 1;
          if (queuePos <= 2) {
            remindedBookings.add(b.id);
            const clientName = b.customerName || b.customer_name || 'يا غالي';
            const reminderMsg = `يا أستاذ ${clientName} 💈 ميعادك قرب في الصالون!\n(باقي أمامك ${queuePos} فقط في الطابور ⏳)\n\n📍 رابط تتبع دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${b.id}\n\n👈 للرد السريع:\n- أرسل "1" أو "أنا في الطريق" لتأكيد حضورك وتجهيز الكرسي.\n- أرسل "2" أو "إلغاء" لإلغاء الحجز.`;
            sendWhatsAppText(b.customerPhone || b.customer_phone, reminderMsg).catch(() => {});
          }
        }
      }

      // 2. Check MySQL bookings
      const rows = await query<any[]>(
        `SELECT id, customer_name, customer_phone, queue_number, starts_at, status 
         FROM bookings 
         WHERE booking_date = ? AND status = 'confirmed'`,
        [todayStr]
      );

      if (rows && rows.length > 0) {
        for (const b of rows) {
          if (b.customer_phone && !remindedBookings.has(b.id)) {
            const timePartMatch = (b.starts_at || '').match(/(\d{1,2}):(\d{2})/);
            if (timePartMatch) {
              const bHour = parseInt(timePartMatch[1], 10);
              const bMin = parseInt(timePartMatch[2], 10);
              const bTimeMinutes = bHour * 60 + bMin;
              const diffMinutes = bTimeMinutes - currentTimeMinutes;
              if (diffMinutes > 90 || diffMinutes < -120) {
                continue;
              }
            }

            const queuePos = b.queue_number || 1;
            if (queuePos <= 2) {
              remindedBookings.add(b.id);
              const clientName = b.customer_name || 'يا غالي';
              const reminderMsg = `يا أستاذ ${clientName} 💈 ميعادك قرب في الصالون!\n(باقي أمامك ${queuePos} فقط في الطابور ⏳)\n\n📍 رابط تتبع دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${b.id}\n\n👈 للرد السريع:\n- أرسل "1" أو "أنا في الطريق" لتأكيد حضورك وتجهيز الكرسي.\n- أرسل "2" أو "إلغاء" لإلغاء الحجز.`;
              sendWhatsAppText(b.customer_phone, reminderMsg).catch(() => {});
            }
          }
        }
      }
    } catch (err: any) {
      // Background reminder loop silently handles errors
    }
  }, 60000);
}
