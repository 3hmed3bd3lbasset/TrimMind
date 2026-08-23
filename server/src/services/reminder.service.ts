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

      // 2. Check in-memory liveSyncedBookings
      for (const b of liveSyncedBookings) {
        if (b.status === 'confirmed' && (b.customerPhone || b.customer_phone) && !remindedBookings.has(b.id)) {
          const bookingDate = (b.starts_at || b.startsAt || '').split('T')[0].split(' ')[0];

          if (bookingDate && bookingDate !== todayStr) {
            continue;
          }

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

      // 3. Check MySQL bookings
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
