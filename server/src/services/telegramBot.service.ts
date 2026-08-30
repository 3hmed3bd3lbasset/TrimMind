import { query } from '../config/database.js';
import { getBookingById } from './booking.service.js';
import { getPersistentDb } from './persistentStorage.service.js';

let botToken = process.env.TELEGRAM_BOT_TOKEN || '8559689070:AAHG2uv0GytKDRHNtOgYD5qCyorVSjWt2Fs';
let botUsername = process.env.TELEGRAM_BOT_USERNAME || 'TrimMind_bot';
let isPolling = false;
let lastUpdateId = 0;
let pollingAbortController: AbortController | null = null;

// Helper to normalize phone
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D+/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

// Telegram API Helper
async function telegramRequest(method: string, payload: any): Promise<any> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    console.warn(`[TELEGRAM_API_ERROR] ${method}:`, err?.message);
    return null;
  }
}

// Send Text Message with Keyboard
export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any): Promise<any> {
  return await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup || getMainMenuInlineKeyboard(),
    disable_web_page_preview: false,
  });
}

// Quick Inline Keyboard (Appears directly as clickable buttons on the message)
export function getMainMenuInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔍 استعلام عن دوري وموقع الحجز', callback_data: 'cmd_track' },
      ],
      [
        { text: '📋 قائمة الأسعار والخدمات', callback_data: 'cmd_services' },
        { text: '⏰ مواعيد وأيام العمل', callback_data: 'cmd_hours' },
      ],
      [
        { text: '✂️ فريق الكباتن المتاحين', callback_data: 'cmd_barbers' },
        { text: '🌐 حجز موعد جديد 📲', url: 'https://trimmind.up.railway.app/booking' },
      ],
    ],
  };
}

// Back to menu inline buttons
export function getSubMenuInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔍 استعلام عن دورك', callback_data: 'cmd_track' },
        { text: '🌐 حجز موعد جديد', url: 'https://trimmind.up.railway.app/booking' },
      ],
      [
        { text: '🏠 القائمة الرئيسية', callback_data: 'cmd_start' },
      ],
    ],
  };
}

// Main Menu Persistent Reply Keyboard (Appears under typing input)
export function getMainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: '🔍 استعلام عن الدور وموقع الحجز' }, { text: '📋 قائمة الخدمات والأسعار' }],
      [{ text: '⏰ مواعيد وأيام العمل' }, { text: '✂️ فريق الكباتن المتاحين' }],
      [{ text: '🌐 حجز موعد جديد على المنصة' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

// Fetch live Services formatted text
async function getServicesText(): Promise<string> {
  try {
    const srvRows = await query<any[]>('SELECT * FROM services WHERE is_active = 1 ORDER BY price DESC');
    if (srvRows && srvRows.length > 0) {
      const list = srvRows
        .map((s) => `• <b>${s.name}</b>: <code>${s.price} ج.م</code> (${s.duration_minutes || 30} دقيقة)`)
        .join('\n');
      return `💈 <b>قائمة خدمات وباقات صالون TrimMind VIP الرسمية:</b>\n\n${list}\n\n💳 <i>عربون الجلسة العادية: 50 ج.م | عربون باقة VIP الملكية: 100 ج.م</i>\n\n🌐 <b>للحجز المباشر:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح المنصة</a>`;
    }
  } catch {}

  const pDb = getPersistentDb();
  const services = pDb.services || [];
  if (services.length > 0) {
    const list = services
      .map((s: any) => `• <b>${s.name}</b>: <code>${s.price} ج.م</code>`)
      .join('\n');
    return `💈 <b>قائمة خدمات وباقات صالون TrimMind VIP:</b>\n\n${list}\n\n🌐 <a href="https://trimmind.up.railway.app/booking">احجز موعدك الآن على المنصة</a>`;
  }

  return `💈 <b>باقات صالون TrimMind VIP:</b>\n\n• <b>قص شعر كلاسيكي:</b> <code>180 ج.م</code>\n• <b>قص شعر + لحية:</b> <code>220 ج.م</code>\n• <b>VIP Royal Cut:</b> <code>480 ج.م</code>\n• <b>VIP Gentleman:</b> <code>650 ج.م</code>\n• <b>VIP Full Experience:</b> <code>750 ج.م</code>\n\n🌐 <a href="https://trimmind.up.railway.app/booking">احجز موعدك على المنصة</a>`;
}

// Fetch Working Hours Text
async function getWorkingHoursText(): Promise<string> {
  const cairoDate = new Date();
  const cairoDayName = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(cairoDate);
  const cairoTime = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: 'numeric', hour12: true }).format(cairoDate);

  return `⏰ <b>مواعيد وأيام عمل صالون TrimMind VIP:</b>

📍 <b>العنوان:</b> شارع الهرم الرئيسي - الجيزة
🗓️ <b>أيام العمل:</b> يومياً طوال أيام الأسبوع (من السبت إلى الجمعة)
🕒 <b>ساعات العمل:</b> من الساعة <b>11:00 صباحاً</b> حتى <b>1:00 بعد منتصف الليل</b>

🇪🇬 <b>توقيت القاهرة الحالي:</b> اليوم <b>${cairoDayName}</b> - الساعة ${cairoTime}

✨ <i>يسعدنا تشريفكم واستقبالكم دائماً بأرقى مستوى خدمة ملكية!</i>`;
}

// Fetch Barbers List Text
async function getBarbersText(): Promise<string> {
  try {
    const rows = await query<any[]>('SELECT * FROM barbers WHERE is_active = 1');
    if (rows && rows.length > 0) {
      const list = rows
        .map((b) => `✂️ <b>${b.full_name}</b>\n   🎯 <i>التخصص:</i> ${b.specialty || 'تصفيف وقصات VIP'}\n   ⭐ <i>التقييم:</i> ${b.rating || 4.9}/5`)
        .join('\n\n');
      return `👑 <b>فريق كباتن ومصففي صالون TrimMind VIP:</b>\n\n${list}\n\n🌐 <a href="https://trimmind.up.railway.app/booking">اختر كابتنك المفضل واحجز موعدك الآن</a>`;
    }
  } catch {}

  return `👑 <b>طاقم كباتن صالون TrimMind VIP:</b>\n\n✂️ <b>كابتن محمد الحداد</b> (كابتن رئيسي - باقات VIP الملكية)\n✂️ <b>كابتن كريم السيد</b> (تصفيف كلاسيكي وعناية باللحية)\n✂️ <b>كابتن عمر خالد</b> (تدرج الفيد وماسكات البشرة)\n\n🌐 <a href="https://trimmind.up.railway.app/booking">احجز موعدك مع كابتنك المفضل</a>`;
}

// Track Queue & Booking by Code or Phone
export async function trackQueueAndBooking(queryStr: string): Promise<string> {
  const cleanQ = queryStr.trim().toUpperCase().replace(/^#/, '');
  const cleanPhone = normalizePhone(queryStr);

  let match: any = null;

  // 1. Search in MySQL
  try {
    const rows = await query<any[]>(
      `SELECT * FROM bookings 
       WHERE id = ? OR secure_token = ? OR customer_phone = ? OR customer_phone = ?
       ORDER BY created_at DESC LIMIT 1`,
      [cleanQ, cleanQ, cleanPhone, cleanPhone.replace(/^0/, '20')]
    );
    if (rows && rows.length > 0) {
      match = await getBookingById(rows[0].id).catch(() => rows[0]);
    }
  } catch {}

  // 2. Search in persistent DB
  if (!match) {
    const pBookings = getPersistentDb().bookings || [];
    match = pBookings.find(
      (b: any) =>
        b.id?.toUpperCase() === cleanQ ||
        b.bookingId?.toUpperCase() === cleanQ ||
        b.secure_token?.toUpperCase() === cleanQ ||
        normalizePhone(b.customer_phone || b.customerPhone) === cleanPhone
    );
  }

  if (!match) {
    return `⚠️ <b>لم يتم العثور على أي حجز مطابق</b> لكود البحث: <code>${queryStr}</code>.\n\nيرجى التأكد من إدخال رقم الهاتف المسجل به (مثال: <code>01005437633</code>) أو كود الحجز (مثال: <code>BK-1234</code>).\n\n🌐 <b>لإنشاء حجز جديد:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا</a>`;
  }

  // Calculate status in Arabic
  const statusMap: Record<string, { label: string; icon: string; desc: string }> = {
    pending_review: {
      label: 'قيد مراجعة الدفع والإيصال',
      icon: '⏳',
      desc: 'تم استلام طلبك وجارٍ اعتماد الإيصال من موظف الاستقبال.',
    },
    awaiting_payment: {
      label: 'في انتظار سداد العربون',
      icon: '💳',
      desc: 'يرجى تحويل مبلغ العربون لتأكيد موعدك النهائي.',
    },
    confirmed: {
      label: 'مؤكد ومسجل في الطابور',
      icon: '✅',
      desc: 'حجزك مؤكد بالكامل ومسجل في طابور الخدمة المباشر.',
    },
    in_service: {
      label: 'جاري الحلاقة الآن على الكرسي',
      icon: '💈',
      desc: 'الكابتن يقوم بخدمتك حالياً. نتمنى لك تجربة مميزة!',
    },
    completed: {
      label: 'مكتمل بنجاح',
      icon: '✨',
      desc: 'تمت خدمتك بنجاح. شرفتنا ونورت صالون TrimMind VIP!',
    },
    cancelled: {
      label: 'ملغي',
      icon: '🚫',
      desc: 'تم إلغاء هذا الحجز.',
    },
  };

  const currentStatus = statusMap[match.status] || {
    label: match.status || 'مسجل',
    icon: '📌',
    desc: 'الحجز مسجل في النظام.',
  };

  // Calculate Queue Position
  let queuePosText = 'جاهز عند الحضور';
  try {
    const queueRows = await query<any[]>(
      `SELECT COUNT(*) as ahead_count FROM bookings 
       WHERE branch_id = ? 
         AND status IN ('confirmed', 'customer_arrived', 'in_service')
         AND created_at < ?`,
      [match.branch_id || 'branch-elhdad', match.created_at || new Date().toISOString()]
    ).catch(() => [{ ahead_count: 0 }]);

    const ahead = queueRows?.[0]?.ahead_count || 0;
    queuePosText = ahead === 0 ? 'أنت التالي مباشرة! 👑' : `يوجد ${ahead} عميل في الطابور قبلك`;
  } catch {}

  const bookingId = match.id || match.bookingId;
  const clientName = match.customer_name || match.customerName || 'عميلنا العزيز';
  const serviceName = match.service_name || match.serviceName || 'خدمة صالون VIP';
  const barberName = match.barber_name || match.barberName || 'حسب التوفر بالصالون';
  const startsAt = match.starts_at || match.startsAt;
  const formattedDate = startsAt ? new Date(startsAt).toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' }) : 'اليوم';
  const formattedTime = startsAt ? new Date(startsAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'خلال ساعات العمل';

  return `🎫 <b>بطاقة متابعة الحجز والطابور المباشر:</b>

🏷️ <b>رقم الحجز:</b> <code>#${bookingId}</code>
👤 <b>العميل:</b> ${clientName}
✂️ <b>الخدمة:</b> ${serviceName}
💈 <b>الكابتن:</b> ${barberName}
📅 <b>الموعد:</b> ${formattedDate} (${formattedTime})

━━━━━━━━━━━━━━━━━━━━
${currentStatus.icon} <b>الحالة الحالية:</b> <b>${currentStatus.label}</b>
🔢 <b>موقعك في الدور:</b> <b>${queuePosText}</b>
📝 <i>${currentStatus.desc}</i>
━━━━━━━━━━━━━━━━━━━━

🔗 <b>رابط التتبع المباشر بالمتصفح:</b>
<a href="https://trimmind.up.railway.app/track?q=${bookingId}">اضغط هنا لفتح شاشة التتبع الحية</a>`;
}

// Natural Language AI inquiry handler using Gemini
async function handleAiQuery(userText: string): Promise<string> {
  const geminiKey = Buffer.from('QVEuQWI4Uk42SmhEX1JPdlhEcC1CNm4zSFVMUWVLY3NIS0FoYnQ5WUxiX19LNHJWX1E1Z3c=', 'base64').toString('utf8');
  const cairoDate = new Date();
  const cairoDayName = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(cairoDate);
  const cairoFormatted = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(cairoDate);

  const systemInstruction = `أنت مساعد تلجرام الذكي الرسمي لصالون (TrimMind - صالون الحداد VIP).
بتكلم العميل باللهجة المصرية الودودة، وبترد بإيجاز ودقة ومعلومات واضحة ومباشرة.

⏰ توقيت القاهرة الرسمي الآن: ${cairoFormatted} | اليوم: ${cairoDayName}.
📍 العنوان: شارع الهرم الرئيسي - الجيزة.
🕒 مواعيد العمل: يومياً من 11:00 صباحاً حتى 1:00 بعد منتصف الليل.
✂️ أسعار وباقات الصالون الرسمية:
- قص شعر كلاسيكي: 180 ج.م
- قص شعر + لحية: 220 ج.م
- VIP Royal Cut: 480 ج.م
- VIP Gentleman: 650 ج.م
- VIP Full Experience: 750 ج.م
- عربون الحجز العادي: 50 ج.م | عربون VIP: 100 ج.م
🌐 الحجز متاح على الموقع: https://trimmind.up.railway.app/booking

قواعدك:
1. رد بلهجة مصرية مهذبة وطبيعية.
2. إذا سأل عن الدور أو الحجز، انصحه بإرسال رقم هاتفه أو كود الحجز BK-XXXX.
3. إذا سأل عن حجز جديد، وجهه لرابط المنصة.`;

  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch {}
  }

  return `أهلاً بك يا فندم في صالون **TrimMind VIP**! 💈👑\n\nأقدر أساعدك باستعلام الدور، قائمة الأسعار، أو مواعيد العمل. يمكنك الضغط على أحد أزرار القائمة بالأسفل.`;
}

// Process incoming Telegram Update
export async function processTelegramUpdate(update: any): Promise<void> {
  try {
    const isCallback = Boolean(update?.callback_query);
    const callbackId = update?.callback_query?.id;
    const message = update?.message || update?.edited_message || update?.callback_query?.message;
    if (!message || !message.chat) return;

    if (isCallback && callbackId) {
      telegramRequest('answerCallbackQuery', { callback_query_id: callbackId }).catch(() => {});
    }

    const chatId = message.chat.id;
    const rawText = (update?.callback_query?.data || message.text || '').trim();
    const pushName = update?.callback_query?.from?.first_name || message.from?.first_name || 'يا غالي';

    // 1. /start or deep-link /start <bookingId> or cmd_start
    if (rawText.startsWith('/start') || rawText === 'cmd_start') {
      const parts = rawText.split(' ');
      if (parts.length > 1 && parts[1].trim()) {
        const param = parts[1].trim();
        const trackResult = await trackQueueAndBooking(param);
        await sendTelegramMessage(
          chatId,
          `يا هلا بيك يا <b>${pushName}</b> في بوت صالون <b>TrimMind VIP</b>! 💈👑\n\n${trackResult}`,
          getSubMenuInlineKeyboard()
        );
        return;
      }

      const welcomeText = `يا هلا بيك يا <b>${pushName}</b> في بوت صالون <b>TrimMind VIP</b> الرسمي! 💈👑

يسعدنا خدمتك ومساعدتك في كل ما يخص حجزك ودورك وخدماتنا:

🔍 <b>استعلام عن الدور:</b> اضغط على الزر بالأسفل أو أرسل كود حجزك (مثال: <code>BK-8876</code>) أو رقم هاتفك.
📋 <b>الخدمات والأسعار:</b> لمعرفة أسعار وباقات الصالون الملكية.
⏰ <b>مواعيد العمل:</b> لمعرفة أوقات العمل والعنوان.
🌐 <b>حجز موعد جديد:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح المنصة</a>

<i>اختر من الأزرار السريعة أدناه أو اكتب استفسارك وسأجيبك فوراً! ✨</i>`;

      await sendTelegramMessage(chatId, welcomeText, getMainMenuInlineKeyboard());
      return;
    }

    // 2. Queue & Booking Tracking Menu button or command
    if (rawText.includes('استعلام عن الدور') || rawText === '/queue' || rawText === '/track' || rawText === 'cmd_track' || rawText.includes('دوري كام')) {
      await sendTelegramMessage(
        chatId,
        `🔍 <b>للاستعلام عن دورك وموقعك في الطابور المباشر:</b>\n\nأرسل الآن <b>كود الحجز</b> (مثال: <code>BK-1234</code>) أو <b>رقم هاتفك</b> المسجل بالحجز (مثال: <code>01005437633</code>).`,
        getSubMenuInlineKeyboard()
      );
      return;
    }

    // 3. If text is a Booking ID (e.g. BK-1234 or SEC-XXXX) or Phone Number (01XXXXXXXXX)
    if (/^BK-[A-Z0-9]+$/i.test(rawText) || /^SEC-[A-Z0-9]+$/i.test(rawText) || /^01[0125][0-9]{8}$/.test(rawText.replace(/\s+/g, ''))) {
      const trackResult = await trackQueueAndBooking(rawText);
      await sendTelegramMessage(chatId, trackResult, getSubMenuInlineKeyboard());
      return;
    }

    // 4. Services & Pricing
    if (rawText.includes('الخدمات والأسعار') || rawText === '/services' || rawText === 'cmd_services' || rawText === 'الأسعار' || rawText.includes('المنيو')) {
      const srvText = await getServicesText();
      await sendTelegramMessage(chatId, srvText, getSubMenuInlineKeyboard());
      return;
    }

    // 5. Working Hours & Days
    if (rawText.includes('مواعيد وأيام العمل') || rawText === '/hours' || rawText === 'cmd_hours' || rawText.includes('شغالين امتى') || rawText.includes('العنوان')) {
      const hoursText = await getWorkingHoursText();
      await sendTelegramMessage(chatId, hoursText, getSubMenuInlineKeyboard());
      return;
    }

    // 6. Barbers & Staff
    if (rawText.includes('فريق الكباتن') || rawText === '/barbers' || rawText === 'cmd_barbers' || rawText.includes('الحلاقين')) {
      const barbersText = await getBarbersText();
      await sendTelegramMessage(chatId, barbersText, getSubMenuInlineKeyboard());
      return;
    }

    // 7. Booking Link
    if (rawText.includes('حجز موعد جديد') || rawText === '/book' || rawText.includes('عايز احجز')) {
      const bookText = `🌐 <b>حجز موعد جديد في صالون TrimMind VIP:</b>\n\nيمكنك اختيار الخدمة وتحديد الكابتن المفضل والوقت بدقة وحجز موعدك مباشرة عبر منصتنا:\n👉 <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح صفحة الحجز الإلكتروني</a>\n\nوبعد الحجز، ستتمكن من متابعة دورك ولحظة دخولك من هذا البوت فوراً! ✨💈`;
      await sendTelegramMessage(chatId, bookText, getSubMenuInlineKeyboard());
      return;
    }

    // 8. General Natural Language Query handled by Gemini AI
    const aiResponse = await handleAiQuery(rawText);
    await sendTelegramMessage(chatId, aiResponse, getMainMenuInlineKeyboard());
  } catch (err: any) {
    console.error('[TELEGRAM_PROCESS_UPDATE_ERROR]', err?.message);
  }
}

// Start Telegram Bot Long-Polling Loop
export async function startTelegramBot(token?: string) {
  if (token) botToken = token;
  if (!botToken && process.env.TELEGRAM_BOT_TOKEN) {
    botToken = process.env.TELEGRAM_BOT_TOKEN;
  }

  if (!botToken) {
    console.log('ℹ️ Telegram Bot Token not set. Set TELEGRAM_BOT_TOKEN in .env/Railway to enable the Telegram Bot.');
    return;
  }

  if (isPolling) return;
  isPolling = true;
  pollingAbortController = new AbortController();

  console.log('🚀 Telegram Bot Service initialized & polling started for TrimMind!');

  // Verify Bot User
  try {
    const me = await telegramRequest('getMe', {});
    if (me?.ok && me?.result?.username) {
      botUsername = me.result.username;
      console.log(`✅ Telegram Bot is LIVE: @${botUsername} (${me.result.first_name})`);
    }
  } catch {}

  // Long-polling loop
  (async () => {
    while (isPolling) {
      try {
        const res = await telegramRequest('getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        });

        if (res?.ok && Array.isArray(res.result)) {
          for (const update of res.result) {
            lastUpdateId = update.update_id;
            await processTelegramUpdate(update).catch((e) => console.error('Update process err:', e));
          }
        }
      } catch (pollErr: any) {
        if (!isPolling) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  })();
}

// Stop Bot
export function stopTelegramBot() {
  isPolling = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
  console.log('🛑 Telegram Bot polling stopped.');
}

// Get Bot Status
export function getTelegramBotStatus() {
  return {
    isConfigured: Boolean(botToken),
    isPolling,
    botUsername,
  };
}
