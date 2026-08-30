import { query } from '../config/database.js';
import { liveSyncedBookings } from '../routes/agentTools.routes.js';
import { sendWhatsAppText } from './whatsapp.service.js';

const remindedBookings = new Set<string>();
let lastReportDate = '';

export async function sendDailyManagerReport(): Promise<{ success: boolean; reportText: string; managerPhone: string }> {
  const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const todayStr = `${nowCairo.getFullYear()}-${String(nowCairo.getMonth() + 1).padStart(2, '0')}-${String(nowCairo.getDate()).padStart(2, '0')}`;

  // 1. Get Manager Phone from settings
  let managerPhone = '01285694670';
  try {
    const [row] = await query<any[]>(
      'SELECT setting_value FROM settings WHERE setting_key = "manager_phone" OR setting_key = "general" LIMIT 1'
    );
    if (row && row.setting_value) {
      const parsed = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      if (parsed.manager_phone) managerPhone = parsed.manager_phone;
      if (parsed.phone) managerPhone = parsed.phone;
    }
  } catch {}

  // 2. Query today's statistics
  const todayBookings = await query<any[]>(
    `SELECT id, status, total_at_booking, booking_fee_at_booking, barber_name 
     FROM bookings 
     WHERE booking_date = ? OR starts_at LIKE ?`,
    [todayStr, `${todayStr}%`]
  ).catch(() => []);

  const totalBookings = todayBookings.length;
  const completed = todayBookings.filter((b) => b.status === 'completed').length;
  const active = todayBookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress').length;
  const cancelled = todayBookings.filter((b) => b.status === 'cancelled' || b.status === 'noshow').length;

  const totalRevenue = todayBookings.reduce((sum, b) => sum + Number(b.total_at_booking || 0), 0);
  const totalDeposits = todayBookings.reduce((sum, b) => sum + Number(b.booking_fee_at_booking || 0), 0);

  // Top barber
  const barberCounts: Record<string, number> = {};
  todayBookings.forEach((b) => {
    const name = b.barber_name || 'عام';
    barberCounts[name] = (barberCounts[name] || 0) + 1;
  });
  const topBarber = Object.keys(barberCounts).sort((a, b) => barberCounts[b] - barberCounts[a])[0] || 'كابتن محمد';

  // Waitlist count
  const [waitlistRow] = await query<any[]>(
    'SELECT COUNT(*) as count FROM waitlist_entries WHERE DATE(created_at) = ?',
    [todayStr]
  ).catch(() => [{ count: 0 }]);
  const waitlistCount = waitlistRow?.count || 0;

  const reportText = `📊 *تقرير المدير اليومي الذكي - صالون TrimMind VIP* 💈👑
📅 *التاريخ:* ${todayStr}

💰 *الملخص المالي:*
• إجمالي المبيعات المحققة: *${totalRevenue} جنيه*
• إجمالي العربون المستلم: *${totalDeposits} جنيه*

✂️ *حركة الحجوزات والتشغيل:*
• إجمالي الحجوزات: *${totalBookings}* حجز
• المكتملة بنجاح: *${completed}* ✅
• المؤكدة / قيد التنفيذ: *${active}* ⏳
• الإلغاءات / No-Show: *${cancelled}* 🚫

🌟 *أداء الفريق وقائمة الانتظار:*
• الكابتن الأكثر طلباً: *${topBarber}* 🥇
• طلبات قائمة الانتظار الذكية: *${waitlistCount}* طلب

💡 *توصية المساعد الذكي:*
${totalBookings > 5 ? 'أداء ممتاز اليوم! يُوصى بإرسال رسائل استعادة العملاء (Customer Recall) غداً صباحاً.' : 'معدل الحجوزات هادئ، يُفضل تفعيل عروض باقة الـ VIP عبر رسائل الواتساب.'}

_تم التوليد والإرسال تلقائياً بواسطة TrimMind AI Engine_ ✨`;

  await sendWhatsAppText(managerPhone, reportText);
  return { success: true, reportText, managerPhone };
}

export function initReminderService() {
  console.log('⏰ WhatsApp Queue, Appointment Reminders & Manager Daily Report Engine Started (60s tick)');

  setInterval(async () => {
    try {
      const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const todayStr = `${nowCairo.getFullYear()}-${String(nowCairo.getMonth() + 1).padStart(2, '0')}-${String(nowCairo.getDate()).padStart(2, '0')}`;
      const currentHour = nowCairo.getHours();
      const currentMinute = nowCairo.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;

      // 1. Daily Manager Report Check (Triggers at 22:00 / 10:00 PM)
      if (currentHour === 22 && currentMinute >= 0 && currentMinute <= 5 && lastReportDate !== todayStr) {
        lastReportDate = todayStr;
        sendDailyManagerReport().catch((err) => console.error('Daily Manager Report Error:', err.message));
      }

      // 2. Check in-memory liveSyncedBookings & Persistent DB
      for (const b of liveSyncedBookings) {
        if ((b.status === 'confirmed' || b.status === 'pending_review' || b.status === 'awaiting_payment') && (b.customerPhone || b.customer_phone)) {
          const bookingDate = (b.starts_at || b.startsAt || '').split('T')[0].split(' ')[0];
          if (bookingDate && bookingDate !== todayStr) {
            continue;
          }

          const queuePos = b.queueNumber || b.queue_number || 1;
          const clientName = b.customerName || b.customer_name || 'يا غالي';
          const targetPhone = b.customerPhone || b.customer_phone;

          if (queuePos === 2 && !remindedBookings.has(`${b.id}_pos2`)) {
            remindedBookings.add(`${b.id}_pos2`);
            const reminderMsg = `⏳ *تنبيه باقتراب دورك يا أستاذ ${clientName}!* 💈👑\n\nباقي أمامك عميلين فقط في الطابور ⏳ في صالون TrimMind VIP.\n📍 يرجى التوجه للصالون لتجهيز موعدك بالوقت المحدد.\nرابط متابعة دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${b.id}`;
            sendWhatsAppText(targetPhone, reminderMsg).catch(() => {});
          } else if (queuePos === 1 && !remindedBookings.has(`${b.id}_pos1`)) {
            remindedBookings.add(`${b.id}_pos1`);
            const reminderMsg = `⏳ *يا أستاذ ${clientName}! أنت العميل التالي مباشرة في الطابور!* 💈👑\n\nالكابتن هيستقبلك على الكرسي خلال دقائق معدودة (باقي عميل واحد فقط أمامك).\n📍 يرجى التواجد في صالة الانتظار والاستعداد للدخول ✂️✨\nرابط متابعة دورك:\nhttps://trimmind.up.railway.app/track?q=${b.id}`;
            sendWhatsAppText(targetPhone, reminderMsg).catch(() => {});
          }
        }
      }

      // 3. Check MySQL bookings
      const rows = await query<any[]>(
        `SELECT id, customer_name, customer_phone, queue_number, starts_at, status 
         FROM bookings 
         WHERE (booking_date = ? OR starts_at LIKE ?) AND status IN ('confirmed', 'pending_review', 'awaiting_payment')
         ORDER BY queue_number ASC`,
        [todayStr, `${todayStr}%`]
      ).catch(() => []);

      if (rows && rows.length > 0) {
        for (const b of rows) {
          if (b.customer_phone) {
            const queuePos = b.queue_number || 1;
            const clientName = b.customer_name || 'يا غالي';

            if (queuePos === 2 && !remindedBookings.has(`${b.id}_pos2`)) {
              remindedBookings.add(`${b.id}_pos2`);
              const reminderMsg = `⏳ *تنبيه باقتراب دورك يا أستاذ ${clientName}!* 💈👑\n\nباقي أمامك عميلين فقط في الطابور ⏳ في صالون TrimMind VIP.\n📍 يرجى التوجه للصالون لتجهيز موعدك بالوقت المحدد.\nرابط متابعة دورك لحظة بلحظة:\nhttps://trimmind.up.railway.app/track?q=${b.id}`;
              sendWhatsAppText(b.customer_phone, reminderMsg).catch(() => {});
            } else if (queuePos === 1 && !remindedBookings.has(`${b.id}_pos1`)) {
              remindedBookings.add(`${b.id}_pos1`);
              const reminderMsg = `⏳ *يا أستاذ ${clientName}! أنت العميل التالي مباشرة في الطابور!* 💈👑\n\nالكابتن هيستقبلك على الكرسي خلال دقائق معدودة (باقي عميل واحد فقط أمامك).\n📍 يرجى التواجد في صالة الانتظار والاستعداد للدخول ✂️✨\nرابط متابعة دورك:\nhttps://trimmind.up.railway.app/track?q=${b.id}`;
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
