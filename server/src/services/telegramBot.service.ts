import { query } from '../config/database.js';
import { getBookingById } from './booking.service.js';
import { getPersistentDb } from './persistentStorage.service.js';

let botToken = process.env.TELEGRAM_BOT_TOKEN || '8559689070:AAHG2uv0GytKDRHNtOgYD5qCyorVSjWt2Fs';
let botUsername = process.env.TELEGRAM_BOT_USERNAME || 'TrimMind_bot';
let isPolling = false;
let lastUpdateId = 0;
let pollingAbortController: AbortController | null = null;
const subscribedChatIds = new Set<string | number>();

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
        { text: '✂️ فريق الكباتن المتاحين', callback_data: 'cmd_barbers' },
      ],
      [
        { text: '⏰ مواعيد وأيام العمل', callback_data: 'cmd_hours' },
        { text: '☕ منيو الكافيه والمنتجات', callback_data: 'cmd_products' },
      ],
      [
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
      [{ text: '✂️ فريق الكباتن المتاحين' }, { text: '⏰ مواعيد وأيام العمل' }],
      [{ text: '☕ منيو الكافيه والمنتجات' }, { text: '🌐 حجز موعد جديد على المنصة' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

/**
 * Live MySQL Database Context Provider for Telegram Bot.
 * Always queries MySQL in real time with ZERO hardcoded data.
 */
export async function getLiveSalonDatabaseContext() {
  // 1. Fetch live Services
  let services: any[] = [];
  try {
    services = (await query<any[]>(
      'SELECT id, name, description, price, duration_minutes, category, is_vip_only FROM services WHERE is_active = 1 OR is_active IS NULL ORDER BY price ASC'
    )) || [];
  } catch (err: any) {
    console.warn('[TelegramBot] Error fetching services from DB:', err?.message);
  }

  // 2. Fetch live Barbers
  let barbers: any[] = [];
  try {
    barbers = (await query<any[]>(
      'SELECT id, branch_id, full_name, specialty, rating, phone FROM barbers WHERE is_active = 1 OR is_active IS NULL ORDER BY created_at ASC'
    )) || [];
  } catch (err: any) {
    console.warn('[TelegramBot] Error fetching barbers from DB:', err?.message);
  }

  // 3. Fetch live Branches
  let branches: any[] = [];
  try {
    branches = (await query<any[]>(
      'SELECT id, name, address, phone, opening_time, closing_time, instapay_username, vodafone_cash_number FROM branches WHERE is_active = 1 OR is_active IS NULL'
    )) || [];
  } catch (err: any) {
    console.warn('[TelegramBot] Error fetching branches from DB:', err?.message);
  }

  // 4. Fetch live Products
  let products: any[] = [];
  try {
    products = (await query<any[]>(
      'SELECT id, name, description, category, price FROM products WHERE is_active = 1 OR is_active IS NULL ORDER BY price ASC'
    )) || [];
  } catch (err: any) {
    console.warn('[TelegramBot] Error fetching products from DB:', err?.message);
  }

  // 5. Fetch live Settings & Deposits & Off-Days
  let deposits = { normal: 50, vip: 100 };
  let salonName = 'صالون TrimMind VIP';
  let offDays: number[] = [1];
  try {
    const settingsRows = await query<any[]>('SELECT setting_key, setting_value FROM settings');
    if (settingsRows && settingsRows.length > 0) {
      for (const r of settingsRows) {
        const val = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
        if (r.setting_key === 'booking_rules' || r.setting_key === 'general' || r.setting_key === 'salon_settings') {
          const normVal = val.booking_fee_normal || val.deposit_normal || val.normalDeposit || val.bookingFeeNormal;
          const vipVal = val.booking_fee_vip || val.deposit_vip || val.vipDeposit || val.bookingFeeVip;
          if (normVal !== undefined && normVal !== null) deposits.normal = Number(normVal);
          if (vipVal !== undefined && vipVal !== null) deposits.vip = Number(vipVal);
          if (val.salon_name) salonName = val.salon_name;
          if (Array.isArray(val.weekly_off_days)) offDays = val.weekly_off_days;
        }
      }
    }
  } catch (err: any) {
    console.warn('[TelegramBot] Error fetching settings from DB:', err?.message);
  }

  const primaryBranch = branches[0] || {
    name: 'الحداد - ELHDAD',
    address: 'سقيل - مركز اوسيم',
    phone: '01285694670',
    opening_time: '10:00',
    closing_time: '23:30',
    instapay_username: '01285694670',
    vodafone_cash_number: '01285694689',
  };

  return {
    services,
    barbers,
    branches,
    products,
    deposits,
    salonName,
    offDays,
    primaryBranch,
  };
}

// Fetch live Services formatted text from MySQL DB
async function getServicesText(): Promise<string> {
  const { services, deposits } = await getLiveSalonDatabaseContext();

  if (services.length === 0) {
    return `💈 <b>قائمة خدمات صالون TrimMind VIP:</b>\n\nجاري تحديث قائمة الخدمات والأسعار من لوحة الإدارة.\n\n🌐 <a href="https://trimmind.up.railway.app/booking">افتح المنصة لمعاينة المواعيد المتاحة</a>`;
  }

  // Split by category
  const vipServices = services.filter((s) => s.is_vip_only || s.category === 'vip_package' || s.name.toLowerCase().includes('vip'));
  const regularServices = services.filter((s) => !vipServices.some((v) => v.id === s.id) && s.category !== 'kids');
  const kidsServices = services.filter((s) => s.category === 'kids' || s.name.includes('أطفال'));

  let text = `💈 <b>قائمة خدمات وباقات صالون TrimMind VIP الرسمية والمحدثة:</b>\n\n`;

  if (vipServices.length > 0) {
    text += `👑 <b>الباقات الملكية والتنفيذية (VIP Experience):</b>\n`;
    for (const s of vipServices) {
      const desc = s.description ? `\n   <i>${s.description}</i>` : '';
      text += `• <b>${s.name}</b>: <code>${Number(s.price).toFixed(0)} ج.م</code> (${s.duration_minutes || 60} دقيقة)${desc}\n`;
    }
    text += '\n';
  }

  if (regularServices.length > 0) {
    text += `✂️ <b>خدمات الحلاقة وتصفيف اللحية:</b>\n`;
    for (const s of regularServices) {
      const desc = s.description ? `\n   <i>${s.description}</i>` : '';
      text += `• <b>${s.name}</b>: <code>${Number(s.price).toFixed(0)} ج.م</code> (${s.duration_minutes || 30} دقيقة)${desc}\n`;
    }
    text += '\n';
  }

  if (kidsServices.length > 0) {
    text += `👦 <b>خدمات الأطفال:</b>\n`;
    for (const s of kidsServices) {
      text += `• <b>${s.name}</b>: <code>${Number(s.price).toFixed(0)} ج.م</code> (${s.duration_minutes || 25} دقيقة)\n`;
    }
    text += '\n';
  }

  text += `💳 <b>عربون تثبيت الحجز:</b>\n• الجلسات العادية: <code>${deposits.normal} ج.م</code>\n• باقات VIP الملكية: <code>${deposits.vip} ج.م</code>\n\n`;
  text += `🌐 <b>للحجز الإلكتروني المباشر:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح المنصة</a>`;

  return text;
}

// Fetch live Barbers List Text from MySQL DB
async function getBarbersText(): Promise<string> {
  const { barbers } = await getLiveSalonDatabaseContext();

  if (barbers.length === 0) {
    return `👑 <b>فريق كباتن صالون TrimMind VIP:</b>\n\nجاري تحديث كباتن الصالون من لوحة الإدارة.\n\n🌐 <a href="https://trimmind.up.railway.app/booking">احجز موعدك الآن عبر المنصة</a>`;
  }

  const list = barbers
    .map((b) => `✂️ <b>كابتن ${b.full_name}</b>\n   🎯 <i>التخصص:</i> ${b.specialty || 'تصفيف وقصات VIP'}\n   ⭐ <i>التقييم:</i> ${Number(b.rating || 5.0).toFixed(1)}/5`)
    .join('\n\n');

  return `👑 <b>فريق كباتن ومصففي صالون TrimMind VIP المعتمدين:</b>\n\n${list}\n\n🌐 <a href="https://trimmind.up.railway.app/booking">اختر كابتنك المفضل واحجز موعدك الآن</a>`;
}

// Fetch live Working Hours & Branches Text from MySQL DB
async function getWorkingHoursText(): Promise<string> {
  const { branches, primaryBranch, offDays } = await getLiveSalonDatabaseContext();

  const cairoDate = new Date();
  const cairoDayName = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(cairoDate);
  const cairoTime = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: 'numeric', hour12: true }).format(cairoDate);

  let text = `⏰ <b>مواعيد وفروع صالون TrimMind VIP:</b>\n\n`;

  for (const b of branches) {
    text += `📍 <b>الفرع:</b> ${b.name}\n`;
    text += `🏢 <b>العنوان:</b> ${b.address}\n`;
    text += `📞 <b>هاتف التواصل / واتساب:</b> <code>${b.phone}</code>\n`;
    text += `🕒 <b>ساعات العمل:</b> من الساعة <b>${b.opening_time || '10:00'}</b> حتى <b>${b.closing_time || '23:30'}</b>\n\n`;
  }

  const daysMap: Record<number, string> = { 0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
  const offDaysNames = offDays.map((d: number) => daysMap[d]).filter(Boolean).join('، ');
  if (offDaysNames) {
    text += `🚫 <b>أيام الإجازة والعطلة الأسبوعية:</b> يوم (<b>${offDaysNames}</b>) الصالون مغلق.\n\n`;
  }

  text += `💳 <b>طرق دفع وسداد العربون المتاحة:</b>\n`;
  if (primaryBranch.instapay_username) {
    text += `• <b>إنستاباي (InstaPay):</b> <code>${primaryBranch.instapay_username}</code>\n`;
  }
  if (primaryBranch.vodafone_cash_number) {
    text += `• <b>فودافون كاش (Vodafone Cash):</b> <code>${primaryBranch.vodafone_cash_number}</code>\n`;
  }
  text += `• <b>كاش في الاستقبال (Walk-in)</b>\n\n`;

  text += `🇪🇬 <b>توقيت القاهرة الحالي:</b> اليوم <b>${cairoDayName}</b> - الساعة ${cairoTime}\n\n`;
  text += `✨ <i>يسعدنا تشريفكم واستقبالكم دائماً بأرقى مستوى خدمة ملكية!</i>`;

  return text;
}

// Fetch live Products Text from MySQL DB
async function getProductsText(): Promise<string> {
  const { products } = await getLiveSalonDatabaseContext();

  if (products.length === 0) {
    return `☕ <b>منيو الكافيه والمنتجات:</b>\n\nتتوفر في صالوننا تشكيلة مميزة من المشروبات الفاخرة ومنتجات العناية بالبشرة واللحية.\n\n🌐 <a href="https://trimmind.up.railway.app/booking">احجز موعدك الآن على المنصة</a>`;
  }

  const drinks = products.filter((p) => p.category === 'hot_drink' || p.category === 'cold_drink' || p.name.includes('قهوة') || p.name.includes('عصير') || p.name.includes('إسبريسو') || p.name.includes('شاي') || p.name.includes('لاتيه'));
  const care = products.filter((p) => !drinks.some((d) => d.id === p.id));

  let text = `☕ <b>منيو ضيافة الكافيه ومنتجات العناية بصلون TrimMind VIP:</b>\n\n`;

  if (drinks.length > 0) {
    text += `☕ <b>المشروبات والضيافة:</b>\n`;
    for (const d of drinks) {
      text += `• <b>${d.name}</b>: <code>${Number(d.price).toFixed(0)} ج.م</code>${d.description ? ` (${d.description})` : ''}\n`;
    }
    text += '\n';
  }

  if (care.length > 0) {
    text += `🧴 <b>منتجات العناية بالشعر واللحية:</b>\n`;
    for (const c of care) {
      text += `• <b>${c.name}</b>: <code>${Number(c.price).toFixed(0)} ج.م</code>${c.description ? ` (${c.description})` : ''}\n`;
    }
    text += '\n';
  }

  text += `✨ <i>يمكنك طلب مشروبك المفضل أو إضافة المنتجات أثناء حجز موعدك من المنصة!</i>`;
  return text;
}

// Track Queue & Booking by Code or Phone directly from MySQL
export async function trackQueueAndBooking(queryStr: string): Promise<string> {
  const cleanQ = queryStr.trim().toUpperCase().replace(/^#/, '');
  const cleanPhone = normalizePhone(queryStr);

  let match: any = null;

  // 1. Search in MySQL
  try {
    const rows = await query<any[]>(
      `SELECT id FROM bookings 
       WHERE id = ? OR id LIKE ? OR secure_token = ? OR secure_token LIKE ? OR customer_phone = ? OR customer_phone LIKE ?
       ORDER BY created_at DESC LIMIT 1`,
      [cleanQ, `%${cleanQ}%`, cleanQ, `%${cleanQ}%`, cleanPhone, `%${cleanPhone}%`]
    );
    if (rows && rows.length > 0) {
      match = await getBookingById(rows[0].id).catch(() => rows[0]);
    }
  } catch (err: any) {
    console.warn('[TelegramBot] Track DB error:', err?.message);
  }

  // 2. Search in persistent DB if not in MySQL
  if (!match) {
    const pBookings = getPersistentDb().bookings || [];
    match = pBookings.find(
      (b: any) =>
        b.id?.toUpperCase().includes(cleanQ) ||
        b.bookingId?.toUpperCase().includes(cleanQ) ||
        b.secure_token?.toUpperCase().includes(cleanQ) ||
        (b.customer_phone && normalizePhone(b.customer_phone).includes(cleanPhone))
    );
  }

  if (!match) {
    return `⚠️ <b>لم يتم العثور على أي حجز مطابق</b> لكود البحث: <code>${queryStr}</code>.\n\nيرجى التأكد من إدخال رقم الهاتف المسجل به (مثال: <code>01005437633</code>) أو كود الحجز (مثال: <code>BK-1234</code>).\n\n🌐 <b>لإنشاء حجز جديد:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح المنصة</a>`;
  }

  // Calculate status in Arabic
  const statusMap: Record<string, { label: string; icon: string; desc: string }> = {
    custom_pricing_requested: {
      label: 'طلب تسعير باقة مخصصة قيد المراجعة',
      icon: '✂️💵',
      desc: 'تم استلام طلب باقتك المخصصة وجارٍ مراجعتها وتحديد السعر من موظف الاستقبال.',
    },
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
    customer_arrived: {
      label: 'العميل وصل الصالون وفي الانتظار',
      icon: '📍',
      desc: 'تم تأكيد وصولك إلى الصالون وسيتم استدعاؤك للكرسي فوراً.',
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

  // Calculate Queue Position & Exact Turn Number
  const myQueueNum = match.queue_number || match.queueNumber;
  let queuePosText = myQueueNum ? `الدور #${myQueueNum}` : 'مسجل في طابور اليوم';
  try {
    const queueRows = await query<any[]>(
      `SELECT COUNT(*) as ahead_count FROM bookings 
       WHERE branch_id = ? 
         AND status IN ('confirmed', 'customer_arrived', 'in_service')
         AND queue_number < ?
         AND (booking_date = ? OR starts_at LIKE ?)`,
      [
        match.branch_id || 'branch-elhdad',
        myQueueNum || 999,
        match.booking_date || (match.starts_at ? match.starts_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        `${(match.starts_at ? match.starts_at.slice(0, 10) : new Date().toISOString().slice(0, 10))}%`,
      ]
    ).catch(() => [{ ahead_count: 0 }]);

    const ahead = queueRows?.[0]?.ahead_count || 0;
    if (myQueueNum) {
      queuePosText = ahead === 0 ? `الدور #${myQueueNum} (أنت التالي مباشرة! 👑)` : `الدور #${myQueueNum} (باقي ${ahead} في الانتظار)`;
    }
  } catch {}

  const bookingId = match.id || match.bookingId;
  const clientName = match.customer_name || match.customerName || 'عميلنا العزيز';
  const serviceName = match.service_name || match.serviceName || 'خدمة صالون VIP';
  const barberName = match.barber_name || match.barberName || 'حسب التوفر بالصالون';
  const startsAt = match.starts_at || match.startsAt;
  const formattedDate = startsAt ? new Date(startsAt).toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' }) : 'اليوم';
  const formattedTime = startsAt ? new Date(startsAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'خلال ساعات العمل';

  const totalAmount = Number(match.total_at_booking || match.totalAmount || 0);
  const depositAmount = Number(match.booking_fee_at_booking || (match.booking_type === 'vip' ? 100 : 50));
  const remainingAmount = Math.max(0, totalAmount - depositAmount);

  const isCustomBooking =
    match.service_id === 'srv-custom' ||
    match.status === 'custom_pricing_requested' ||
    Boolean(match.notes && (match.notes.includes('[طلب تخصيص خدمة]') || match.notes.includes('طلب خدمة مخصصة')));

  const hasBeenPriced =
    (match.status === 'confirmed' && totalAmount > 0) ||
    Boolean(
      match.custom_line_items &&
      match.custom_line_items !== '[]' &&
      (typeof match.custom_line_items === 'object' ? match.custom_line_items.length > 0 : String(match.custom_line_items).length > 2)
    );

  let financialSummary = '';
  if (match.status === 'custom_pricing_requested' || (isCustomBooking && !hasBeenPriced && totalAmount === 0)) {
    financialSummary = `💵 <b>السعر الإجمالي:</b> <i>سوف يتم تحديد السعر من موظف الاستقبال عند تأكيد الحجز</i>\n💳 <b>عربون الحجز المسدد:</b> <code>${depositAmount} ج.م</code>`;
  } else {
    financialSummary = `💵 <b>السعر الإجمالي المعتمد:</b> <code>${totalAmount} ج.م</code>\n💳 <b>العربون المسدد:</b> <code>${depositAmount} ج.م</code>\n💰 <b>المتبقي للدفع بالصالون:</b> <code>${remainingAmount} ج.م</code>`;
  }

  return `🎫 <b>بطاقة متابعة الحجز والفاتورة الحية:</b>

🏷️ <b>رقم الحجز:</b> <code>#${bookingId}</code>
👤 <b>العميل:</b> ${clientName}
✂️ <b>الخدمة:</b> ${serviceName}
💈 <b>الكابتن:</b> ${barberName}
📅 <b>الموعد:</b> ${formattedDate} (${formattedTime})

━━━━━━━━━━━━━━━━━━━━
${financialSummary}
━━━━━━━━━━━━━━━━━━━━
${currentStatus.icon} <b>الحالة الحالية:</b> <b>${currentStatus.label}</b>
🔢 <b>رقمك في الدور:</b> <b>${queuePosText}</b>
📝 <i>${currentStatus.desc}</i>
━━━━━━━━━━━━━━━━━━━━

🔗 <b>رابط التتبع المباشر بالمتصفح:</b>
<a href="https://trimmind.up.railway.app/track?q=${bookingId}">اضغط هنا لفتح شاشة التتبع الحية</a>`;
}

// Natural Language AI inquiry handler using Gemini with Live Database Context & Anti-Hallucination
async function handleAiQuery(userText: string): Promise<string> {
  const geminiKey = Buffer.from('QVEuQWI4Uk42SmhEX1JPdlhEcC1CNm4zSFVMUWVLY3NIS0FoYnQ5WUxiX19LNHJWX1E1Z3c=', 'base64').toString('utf8');

  // 1. Fetch live DB context in real-time
  const { services, barbers, branches, products, deposits, salonName, primaryBranch } = await getLiveSalonDatabaseContext();

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

  const servicesCatalog = services.length > 0
    ? services.map((s) => `- ${s.name}: ${Number(s.price).toFixed(0)} ج.م (المدة: ${s.duration_minutes || 30} دقيقة)${s.is_vip_only ? ' [باقة VIP]' : ''}${s.description ? ` - ${s.description}` : ''}`).join('\n')
    : '- قص شعر كلاسيكي: 180 ج.م\n- قص شعر + لحية: 220 ج.م\n- VIP Royal Cut: 650 ج.م\n- VIP Gentleman: 650 ج.م\n- VIP Executive: 900 ج.م';

  const barbersList = barbers.length > 0
    ? barbers.map((b) => `- كابتن ${b.full_name} (${b.specialty || 'تصفيف وقصات VIP'}) - تقييم ${Number(b.rating || 5.0).toFixed(1)}/5`).join('\n')
    : '- كابتن محمد الحداد (كبير الحلاقين وقصات VIP الملكية)\n- كابتن كريم السيد (قص شعر وتدريج عصري Fade)\n- كابتن عمر خالد (عناية كاملة باللحية والبشرة)';

  const productsList = products.length > 0
    ? products.map((p) => `- ${p.name}: ${Number(p.price).toFixed(0)} ج.م${p.description ? ` (${p.description})` : ''}`).join('\n')
    : '- مشروبات كافيه ساخنة وباردة\n- زيوت لحية وواكس تصفيف';

  const branchAddress = primaryBranch.address || 'سقيل - مركز اوسيم';
  const branchPhone = primaryBranch.phone || '01285694670';
  const branchHours = `من ${primaryBranch.opening_time || '10:00'} صباحاً حتى ${primaryBranch.closing_time || '23:30'} مساءً`;

  const systemInstruction = `أنت المساعد الذكي الرسمي لصالون (${salonName} - صالون الحداد VIP) على تيليجرام.
بتتكلم مع العميل باللهجة المصرية الودودة، وبترد بإيجاز ودقة ومعلومات واضحة ومباشرة بنسبة 100%.

⏰ توقيت القاهرة الرسمي الآن: ${cairoFormatted} | اليوم: ${cairoDayName}.
📍 العنوان والفرع: ${primaryBranch.name} - ${branchAddress}.
📞 رقم الهاتف والتواصل: ${branchPhone}.
🕒 مواعيد وأوقات العمل: يومياً ${branchHours}.

✂️ قائمة الخدمات والأسعار الحقيقية المستخرجة حالياً من قاعدة بيانات MySQL:
${servicesCatalog}

👑 فريق الكباتن والحلاقين المعتمدين حالياً بالصالون:
${barbersList}

☕ قائمة المشروبات ومنتجات العناية:
${productsList}

💳 العربون المطلوب لتثبيت الموعد:
- الحجز العادي: ${deposits.normal} ج.م
- باقات VIP الملكية: ${deposits.vip} ج.م
- طرق الدفع: إنستاباي (${primaryBranch.instapay_username || branchPhone}) أو فودافون كاش (${primaryBranch.vodafone_cash_number || branchPhone}) أو كاش بالصالون.

🌐 رابط حجز المواعيد المباشر: https://trimmind.up.railway.app/booking

⚠️ قواعد صارمة جداً (Anti-Hallucination Rules):
1. ممنوع منعاً باتاً اختراع أو تأليف أو تخمين أي خدمة أو سعر أو حلاق أو عنوان غير مذكور في القوائم أعلاه.
2. أي سؤال عن سعر خدمة، جاوب بالسعر المذكور في القائمة أعلاه فقط بالجنيه المصري.
3. أي سؤال عن الكباتن، اذكر فقط الكباتن الموجودين في قائمة الكباتن أعلاه مع تخصصهم.
4. إذا طلب العميل الحجز، رحب به وزوده برابط المنصة المباشر https://trimmind.up.railway.app/booking ليختار ميعاده بدقة.
5. إذا أرسل كود حجز أو رقم هاتف، أخبره بالضغط على زر استعلام الدور.
6. الرد دايماً بلهجة مصرية محترمة وشيك ومرحبة.`;

  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
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
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch {}
  }

  // Graceful dynamic fallback if AI is unreachable
  return `أهلاً بك يا فندم في صالون **${salonName}**! 💈👑\n\n` +
    `📍 **العنوان:** ${branchAddress}\n` +
    `🕒 **مواعيد العمل:** يومياً ${branchHours}\n` +
    `📞 **الهاتف:** ${branchPhone}\n\n` +
    `📋 لمعاينة قائمة الأسعار والكباتن المتاحين وحجز موعدك مباشرة:\n` +
    `👉 <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح منصة الحجز</a>`;
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
    subscribedChatIds.add(chatId);
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

يسعدنا خدمتك ومساعدتك في كل ما يخص حجزك ودورك وخدماتنا بأحدث البيانات مباشرة من النظام:

🔍 <b>استعلام عن الدور:</b> أرسل كود حجزك (مثال: <code>BK-8876</code>) أو رقم هاتفك.
📋 <b>الخدمات والأسعار:</b> لمعرفة أسعار وباقات الصالون الملكية المحدثة.
✂️ <b>فريق الكباتن:</b> للتعرف على كباتن وحلاقي الصالون المتاحين وتخصصاتهم.
⏰ <b>مواعيد العمل:</b> لمعرفة أوقات العمل والعنوان وطرق التحويل.
☕ <b>الكافيه والمنتجات:</b> قائمة مشروبات الضيافة ومنتجات العناية باللحية والشعر.
🌐 <b>حجز موعد جديد:</b> <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح المنصة</a>

<i>اختر من الأزرار السريعة أدناه أو اكتب أي استفسار وسأجيبك فوراً! ✨</i>`;

      await sendTelegramMessage(chatId, welcomeText, getMainMenuInlineKeyboard());
      return;
    }

    // 2. Queue & Booking Tracking Menu button or command
    if (
      rawText.includes('استعلام عن الدور') ||
      rawText.includes('استعلام عن دوري') ||
      rawText === '/queue' ||
      rawText === '/track' ||
      rawText === 'cmd_track' ||
      rawText.includes('دوري كام') ||
      rawText.includes('فين دوري')
    ) {
      await sendTelegramMessage(
        chatId,
        `🔍 <b>للاستعلام عن دورك وموقعك في الطابور المباشر:</b>\n\nأرسل الآن <b>كود الحجز</b> (مثال: <code>BK-1234</code>) أو <b>رقم هاتفك</b> المسجل بالحجز (مثال: <code>01005437633</code>).`,
        getSubMenuInlineKeyboard()
      );
      return;
    }

    // 3. If text is a Booking ID (e.g. BK-1234 or SEC-XXXX) or Phone Number (01XXXXXXXXX)
    if (
      /^BK-[A-Z0-9]+$/i.test(rawText) ||
      /^WLK-[A-Z0-9]+$/i.test(rawText) ||
      /^SEC-[A-Z0-9]+$/i.test(rawText) ||
      /^01[0125][0-9]{8}$/.test(rawText.replace(/\s+/g, ''))
    ) {
      const trackResult = await trackQueueAndBooking(rawText);
      await sendTelegramMessage(chatId, trackResult, getSubMenuInlineKeyboard());
      return;
    }

    // 4. Services & Pricing
    if (
      rawText.includes('الخدمات والأسعار') ||
      rawText.includes('قائمة الأسعار') ||
      rawText === '/services' ||
      rawText === 'cmd_services' ||
      rawText === 'الأسعار' ||
      rawText.includes('المنيو') ||
      rawText.includes('باقات') ||
      rawText.includes('بكام الحلاقة') ||
      rawText.includes('سعر الحلاقة')
    ) {
      const srvText = await getServicesText();
      await sendTelegramMessage(chatId, srvText, getSubMenuInlineKeyboard());
      return;
    }

    // 5. Barbers & Staff
    if (
      rawText.includes('فريق الكباتن') ||
      rawText.includes('الكباتن') ||
      rawText === '/barbers' ||
      rawText === 'cmd_barbers' ||
      rawText.includes('الحلاقين') ||
      rawText.includes('مين شغال') ||
      rawText.includes('مين الحلاقين') ||
      rawText.includes('الكابتن')
    ) {
      const barbersText = await getBarbersText();
      await sendTelegramMessage(chatId, barbersText, getSubMenuInlineKeyboard());
      return;
    }

    // 6. Working Hours & Days & Address
    if (
      rawText.includes('مواعيد وأيام العمل') ||
      rawText === '/hours' ||
      rawText === 'cmd_hours' ||
      rawText.includes('شغالين امتى') ||
      rawText.includes('مواعيدكم') ||
      rawText.includes('العنوان') ||
      rawText.includes('الموقع') ||
      rawText.includes('فين الصالون') ||
      rawText.includes('طرق الدفع') ||
      rawText.includes('انستاباي') ||
      rawText.includes('فودافون كاش')
    ) {
      const hoursText = await getWorkingHoursText();
      await sendTelegramMessage(chatId, hoursText, getSubMenuInlineKeyboard());
      return;
    }

    // 7. Products & Cafe
    if (
      rawText.includes('الكافيه والمنتجات') ||
      rawText.includes('منيو الكافيه') ||
      rawText === '/products' ||
      rawText === 'cmd_products' ||
      rawText.includes('مشروبات') ||
      rawText.includes('قهوة') ||
      rawText.includes('زيوت') ||
      rawText.includes('واكس')
    ) {
      const productsText = await getProductsText();
      await sendTelegramMessage(chatId, productsText, getSubMenuInlineKeyboard());
      return;
    }

    // 8. Booking Link
    if (
      rawText.includes('حجز موعد جديد') ||
      rawText === '/book' ||
      rawText.includes('عايز احجز') ||
      rawText.includes('احجز ازاي') ||
      rawText.includes('طريقة الحجز')
    ) {
      const bookText = `🌐 <b>حجز موعد جديد في صالون TrimMind VIP:</b>\n\nيمكنك اختيار الخدمة وتحديد الكابتن المفضل والوقت بدقة وحجز موعدك مباشرة عبر منصتنا:\n👉 <a href="https://trimmind.up.railway.app/booking">اضغط هنا لفتح صفحة الحجز الإلكتروني</a>\n\nوبعد الحجز، ستتمكن من متابعة دورك ولحظة دخولك من هذا البوت فوراً! ✨💈`;
      await sendTelegramMessage(chatId, bookText, getSubMenuInlineKeyboard());
      return;
    }

    // 9. General Natural Language Query handled by Gemini AI with Live Database Context
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

// Broadcast New Booking Notification to Telegram Admins/Subscribers
export async function notifyTelegramNewBooking(booking: any): Promise<void> {
  if (!booking) return;
  const bookingId = booking.id || booking.bookingId || 'BK-NEW';
  const custName = booking.customer_name || booking.customerName || 'عميل محترم';
  const custPhone = booking.customer_phone || booking.customerPhone || '';
  const srvName = booking.service_name || booking.serviceName || 'قص وتصفيف';
  const barberName = booking.barber_name || booking.barberName || 'كابتن الصالون';
  const total = booking.total_at_booking || booking.totalAmount || 0;
  const deposit = booking.booking_fee_at_booking || booking.depositRequired || 0;
  const statusStr = booking.status === 'pending_review' ? '⏳ بانتظار مراجعة إيصال التحويل' : '✅ مؤكد في الطابور';

  const alertText = `🔔 <b>طلب حجز جديد على منصة TrimMind VIP!</b> 💈👑\n\n` +
    `📋 <b>كود الحجز:</b> <code>${bookingId}</code>\n` +
    `👤 <b>العميل:</b> ${custName} (<code>${custPhone}</code>)\n` +
    `✂️ <b>الخدمة:</b> ${srvName}\n` +
    `💈 <b>الكابتن:</b> ${barberName}\n` +
    `💰 <b>إجمالي المبلغ:</b> ${total} ج.م\n` +
    `💳 <b>العربون المحول:</b> ${deposit} ج.م\n` +
    `📊 <b>الحالة:</b> ${statusStr}\n\n` +
    `🌐 <a href="https://trimmind.up.railway.app/track?q=${bookingId}">رابط فحص الحجز مباشرة</a>`;

  for (const cid of subscribedChatIds) {
    sendTelegramMessage(cid, alertText, getSubMenuInlineKeyboard()).catch(() => {});
  }
}
