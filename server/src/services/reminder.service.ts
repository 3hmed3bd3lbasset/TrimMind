import { query } from '../config/database.js';
import { liveSyncedBookings } from '../routes/agentTools.routes.js';
import { sendWhatsAppText } from './whatsapp.service.js';

const remindedBookings = new Set<string>();

export function initReminderService() {
  console.log('⏰ WhatsApp Queue & Appointment Reminder Engine Started (60s tick)');

  setInterval(async () => {
    try {
      // 1. Check in-memory liveSyncedBookings
      for (const b of liveSyncedBookings) {
        if ((b.status === 'confirmed' || b.status === 'awaiting_payment') && b.customerPhone && !remindedBookings.has(b.id)) {
          const queuePos = b.queueNumber || b.queue_number || 2;
          if (queuePos <= 2) {
            remindedBookings.add(b.id);
            const clientName = b.customerName || b.customer_name || 'يا غالي';
            const reminderMsg = `يا أستاذ ${clientName} 💈 ميعادك قرب في الصالون!\n(باقي أمامك ${queuePos} فقط في الطابور ⏳)\n\n📍 رابط تتبع دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${b.id}\n\n👈 للرد السريع:\n- أرسل "1" أو "أنا في الطريق" لتأكيد حضورك وتجهيز الكرسي.\n- أرسل "2" أو "إلغاء" لإلغاء الحجز.`;
            sendWhatsAppText(b.customerPhone, reminderMsg).catch(() => {});
          }
        }
      }

      // 2. Check MySQL bookings
      const todayStr = new Date().toISOString().split('T')[0];
      const rows = await query<any[]>(
        `SELECT id, customer_name, customer_phone, queue_number, starts_at, status 
         FROM bookings 
         WHERE booking_date = ? AND status = 'confirmed'`,
        [todayStr]
      );

      if (rows && rows.length > 0) {
        for (const b of rows) {
          if (b.customer_phone && !remindedBookings.has(b.id)) {
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
