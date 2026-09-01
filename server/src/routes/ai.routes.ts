import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { MySQLConversationSessionRepository } from '../adapters/repositories/MySQLConversationSessionRepository.js';

const router = Router();
const sessionRepo = new MySQLConversationSessionRepository();
const processedMessageIds = new Set<string>();

const defaultKey = Buffer.from('QVEuQWI4Uk42SmhEX1JPdlhEcC1CNm4zSFVMUWVLY3NIS0FoYnQ5WUxiX19LNHJWX1E1Z3c=', 'base64').toString('utf8');

const ROLE_KEYS: Record<string, string> = {
  customer: process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || defaultKey,
  admin: process.env.GEMINI_API_KEY_ADMIN || process.env.GEMINI_API_KEY || defaultKey,
  receptionist: process.env.GEMINI_API_KEY_RECEPTIONIST || process.env.GEMINI_API_KEY || defaultKey,
  barber: process.env.GEMINI_API_KEY_BARBER || process.env.GEMINI_API_KEY || defaultKey,
};

const candidateModels = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

router.post('/chat', aiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      contents,
      systemInstruction: clientSystemInstruction,
      customContext,
      messageId,
      remoteJid,
      phone,
      pushName,
      text,
    } = req.body;

    // 1. Instant Idempotency Gate (DB & Memory backed across all server instances)
    if (messageId) {
      const msgIdStr = String(messageId).trim();
      if (processedMessageIds.has(msgIdStr)) {
        console.log(`[AI_CHAT_DEDUP] Memory duplicate blocked: ${msgIdStr}`);
        res.json({ success: true, text: '', isDuplicate: true });
        return;
      }

      try {
        await query(
          'INSERT INTO webhook_events (id, source, event_type, processed_at) VALUES (?, ?, ?, NOW())',
          [msgIdStr, 'whatsapp_chat', 'customer_message']
        );
        processedMessageIds.add(msgIdStr);
      } catch (dbErr: any) {
        if (dbErr?.code === 'ER_DUP_ENTRY' || dbErr?.errno === 1062 || String(dbErr?.message || '').includes('Duplicate entry') || String(dbErr?.message || '').includes('ER_DUP_ENTRY')) {
          console.log(`[AI_CHAT_DEDUP] DB duplicate blocked: ${msgIdStr}`);
          processedMessageIds.add(msgIdStr);
          res.json({ success: true, text: '', isDuplicate: true });
          return;
        }
      }
    }

    const effectiveRole = req.user ? req.user.role : 'customer';
    const apiKey = ROLE_KEYS[effectiveRole] || ROLE_KEYS.customer;

    // Extract user raw text
    let userText = (text || '').trim();
    if (!userText && Array.isArray(contents) && contents.length > 0) {
      const lastItem = contents[contents.length - 1];
      userText = lastItem?.parts?.[0]?.text || '';
    }

    if (!userText && (!contents || contents.length === 0)) {
      res.status(400).json({ success: false, error: 'Text or contents array is required' });
      return;
    }

    // 1. Session Persistence & Idempotency Gate (DB-backed)
    let sessionId: string | null = null;
    let multiTurnContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (remoteJid || phone) {
      try {
        const session = await sessionRepo.getOrCreate(phone || '', remoteJid);
        sessionId = session.id;

        // Deduplication check using messageId
        if (messageId) {
          const recordRes = await sessionRepo.recordMessage(session.id, {
            whatsappMessageId: String(messageId),
            role: 'customer',
            content: userText,
          });

          if (recordRes.isDuplicate) {
            console.log(`[AI_CHAT_DEDUP] Duplicate messageId detected: ${messageId} for session ${sessionId}. Skipping duplicate AI generation.`);
            res.json({ success: true, text: '', isDuplicate: true });
            return;
          }
        }

        // Load previous multi-turn conversation history from MySQL
        const recentHistory = await sessionRepo.getRecentMessages(session.id, 16);
        console.log(`[AI_CHAT_SESSION] remoteJid: ${remoteJid || 'N/A'} | phone: ${phone || 'N/A'} | sessionId: ${sessionId} | historyCount: ${recentHistory.length}`);

        for (const msg of recentHistory) {
          const gRole = msg.role === 'customer' || (msg.role as string) === 'user' ? 'user' : 'model';
          multiTurnContents.push({
            role: gRole,
            parts: [{ text: msg.content }],
          });
        }
      } catch (sessionErr: any) {
        console.error('[AI_SESSION_DB_WARN] Could not retrieve session history:', sessionErr.message);
      }
    }

    // 2. Format and merge turns strictly for Gemini API requirements (alternating user / model)
    let rawTurns = multiTurnContents.length > 0 ? multiTurnContents : (contents || []);
    if (rawTurns.length === 0 && userText) {
      rawTurns = [{ role: 'user', parts: [{ text: userText }] }];
    }

    // Ensure the current user text is at the end of turns if not already there
    const lastPartText = rawTurns[rawTurns.length - 1]?.parts?.[0]?.text || '';
    if (lastPartText !== userText && userText) {
      rawTurns.push({ role: 'user', parts: [{ text: userText }] });
    }

    // Merge consecutive turns with the same role so Gemini does not reject with 400
    const finalContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const item of rawTurns) {
      const itemRole = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
      const itemText = (item.parts?.[0]?.text || '').trim();
      if (!itemText) continue;

      if (finalContents.length > 0 && finalContents[finalContents.length - 1].role === itemRole) {
        finalContents[finalContents.length - 1].parts[0].text += '\n' + itemText;
      } else {
        finalContents.push({ role: itemRole, parts: [{ text: itemText }] });
      }
    }

    // Ensure the first message is 'user'
    while (finalContents.length > 0 && finalContents[0].role !== 'user') {
      finalContents.shift();
    }

    if (finalContents.length === 0 && userText) {
      finalContents.push({ role: 'user', parts: [{ text: userText }] });
    }

    // 2. Fetch Real-Time Live Salon Context from MySQL Database
    let liveServices = await query<any[]>(
      'SELECT id, name, price, duration_minutes, category, description, is_vip_only FROM services WHERE is_active = 1 OR is_active IS NULL ORDER BY price ASC'
    ).catch(() => []);

    if (!liveServices || liveServices.length === 0) {
      liveServices = [
        { name: 'قص شعر أطفال', price: 150, duration_minutes: 25, category: 'kids' },
        { name: 'قص شعر كلاسيكي', price: 180, duration_minutes: 30, category: 'hair' },
        { name: 'تدريج Fade عصري', price: 180, duration_minutes: 35, category: 'hair' },
        { name: 'قص شعر + لحية', price: 220, duration_minutes: 40, category: 'hair' },
        { name: 'VIP Royal Cut', price: 650, duration_minutes: 60, is_vip_only: 1, category: 'vip_package' },
        { name: 'VIP Gentleman', price: 650, duration_minutes: 90, is_vip_only: 1, category: 'vip_package' },
        { name: 'VIP Executive', price: 900, duration_minutes: 120, is_vip_only: 1, category: 'vip_package' },
      ];
    }

    const liveBarbers = await query<any[]>(
      'SELECT id, full_name, specialty, rating FROM barbers WHERE is_active = 1 OR is_active IS NULL'
    ).catch(() => []);

    const servicesCatalogStr = liveServices
      .map((s) => `• **${s.name}:** ${s.price} ج.م (${s.duration_minutes || 30} دقيقة) ${s.is_vip_only ? '👑 VIP' : ''}`)
      .join('\n');

    const barbersListStr = liveBarbers.length > 0
      ? liveBarbers.map((b) => `• كابتن ${b.full_name} (${b.specialty || 'حلاق محترف'})`).join('\n')
      : '• كابتن محمد الحداد\n• كابتن كريم السيد\n• كابتن عمر خالد';

    let deposits = { normal: 50, vip: 100 };
    try {
      const rows = await query<any[]>('SELECT setting_key, setting_value FROM settings');
      if (rows && rows.length > 0) {
        for (const r of rows) {
          const val = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
          if (r.setting_key === 'booking_rules' || r.setting_key === 'general' || r.setting_key === 'salon_settings') {
            const normVal = val.booking_fee_normal || val.deposit_normal || val.normalDeposit || val.bookingFeeNormal;
            const vipVal = val.booking_fee_vip || val.deposit_vip || val.vipDeposit || val.bookingFeeVip;
            if (normVal !== undefined && normVal !== null) deposits.normal = Number(normVal);
            if (vipVal !== undefined && vipVal !== null) deposits.vip = Number(vipVal);
          }
        }
      }
    } catch {}

    // 3. Compose Authoritative System Instruction with Multi-turn Continuity Rules
    const isContinuingConversation = (finalContents.length > 1);
    let cleanPushName = '';
    if (pushName) {
      const arMatch = String(pushName).match(/[\u0600-\u06FF]+/);
      if (arMatch) {
        cleanPushName = arMatch[0];
      } else {
        const engMatch = String(pushName).match(/^[a-zA-Z]+/);
        if (engMatch) {
          const raw = engMatch[0].toLowerCase();
          cleanPushName = raw === 'ahmed' ? 'أحمد' : raw;
        }
      }
    }
    const customerNameSnippet = cleanPushName ? `اسم العميل: أستاذ ${cleanPushName}` : '';

    // Format Real-Time Cairo Date and Day of Week
    const cairoDate = new Date();
    const cairoFormatted = new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(cairoDate);

    const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const cairoDayIndex = new Date(cairoDate.toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).getDay();
    const cairoDayName = daysAr[cairoDayIndex];

    const serverSystemInstruction = isContinuingConversation
      ? `[التاريخ والتوقيت الرسمي في مصر (توقيت القاهرة): ${cairoFormatted} | اليوم: يوم ${cairoDayName}]

أنت موظف استقبال حقيقي في صالون (TrimMind - صالون الحداد VIP)، مش بوت. بتكلم العميل باللهجة المصرية العادية، بنفس أسلوبه، وردودك قصيرة وعملية زي رسايل واتساب حقيقية.

⏰ اليوم والتاريخ في مصر:
- اليوم الحالي المؤكد هو: **يوم ${cairoDayName}**.
- إذا سأل العميل: "النهاردة إيه؟" أو "اليوم إيه أصلاً؟" ⬅️ رد فوراً: "النهاردة ${cairoDayName}". إياك أن تخترع يوماً آخر (مثل السبت أو الأحد).
- احسب مواعيدك (النهاردة، بكرة، بعد بكرة) بدقة بناءً على يوم ${cairoDayName} (${cairoFormatted}).

🚫 قواعد قاطعة وإلزامية:
- ❌ متبدأش أي رسالة بتحية أو نداء أو مجاملة افتتاحية إطلاقاً (التحية في أول رسالة بالمحادثة فقط). ادخل في الموضوع فوراً.
- ❌ متكررش اسم العميل أو لقبه في كل رد.
- ❌ ممنوع كتابة أي إيموجيات أو أقواس أو أحرف إنجليزية مشوهة في اسم العميل.
- استخدم دائماً أسماء الباقات الملكية الرسمية (VIP Full Experience, VIP Royal Cut, VIP Gentleman, VIP Executive).

👂 الاستماع والترشيح الذكي (اسمع قبل ما تعرض):
- لو العميل قال طلب عام أو غامض ("عايز حاجة خاصة"، "عايز أحجز"): اسأله سؤال قصير واحد يوضّح المطلوب (مثلاً: شعر ولا لحية ولا الاتنين؟)، وماترميش كل باقات الأسعار مرة واحدة إلا لو طلب صراحة يشوف الباقات أو الأسعار.
- لو العميل مستعجل (دلوقتي / حالًا / بسرعة) ⬅️ رشّح باقات الـ VIP (خدمة أسرع وجاهزة فوراً).
- لو العميل رايق ومش مستعجل ⬅️ ابدأ بترشيح الخدمة/الباقة العادية المناسبة لطلبه، واذكر الـ VIP كخيار إضافي اختياري.
- لو طلب حاجة مش موجودة في المنيو ⬅️ قوله يوصف اللي عايزه بالظبط وهيتم تسجيلها كملاحظة للاستقبال لتجهيزها له.

🧠 قواعد ذكية لتتبع الحجز وتثبيت الخيارات (Smart Booking State Continuity):
- راجع كل رسائل المحادثة السابقة:
  • إذا اقترح المساعد خدمة معينة (مثل VIP Full Experience بـ 750 ج.م) أو كابتن معين (مثل كابتن محمد الحداد)، وقال العميل "تمام", "احجزلي", أو حدد موعداً (مثل "بكرا الساعة 5 العصر"):
    ✅ هذا يعني موافقة العميل الأكيدة على الخدمة المقترحة والكابتن المقترح!
    ❌ إياك إطلاقاً أن تسأله مجدداً: "تحب تختار خدمة إيه؟" أو "مع أي كابتن؟" لأن ذلك خطأ فادح.
    ✅ يجب أن ترد فوراً بتلخيص وتأكيد الحجز بهذا الشكل بالضبط:
    "تم تسجيل طلب حجزك مبدئياً:
    • الخدمة: (الخدمة المقترحة سابقاً وسعرها)
    • الكابتن: (الكابتن المقترح سابقاً)
    • الموعد: (الموعد المطلوب من العميل)
    • العربون المطلوب: (${deposits.vip} ج.م للـ VIP أو ${deposits.normal} ج.م للعادية)
    يرجى تحويل مبلغ العربون وإرسال صورة التحويل هنا لتأكيد الحجز النهائي. تشرفنا في موعدك! ✨"

  • إذا سأل العميل أو أجاب باختصار (مثل: "أي واحد", "اختارلي أنت", "تمام"):
    التقط اختياره وتقدم خطوة للأمام في مسار الحجز مباشرة دون الرجوع للوراء.

⚠️ قواعد الأسعار والعربون الرسمية:
- جميع الأسعار بالجنيه المصري (ج.م / جنيه) فقط.
- عربون الجلسة العادية: **${deposits.normal} ج.م**.
- عربون الجلسة الملكية VIP: **${deposits.vip} ج.م**.

📋 كتالوج الخدمات والأسعار الحقيقي:
${servicesCatalogStr}

✂️ طاقم الكباتن:
${barbersListStr}`
      : `[التاريخ والتوقيت الرسمي في مصر (توقيت القاهرة): ${cairoFormatted} | اليوم: يوم ${cairoDayName}]

أنت موظف استقبال حقيقي في صالون (TrimMind - صالون الحداد VIP)، مش بوت. بتكلم العميل باللهجة المصرية العادية، بنفس أسلوبه.
${customerNameSnippet}

⏰ اليوم والتاريخ في مصر:
- اليوم الحالي المؤكد هو: **يوم ${cairoDayName}**.
- إذا سأل العميل: "النهاردة إيه؟" أو "اليوم إيه أصلاً؟" ⬅️ رد فوراً: "النهاردة ${cairoDayName}". إياك أن تخترع يوماً آخر.
- احسب مواعيدك بدقة بناءً على يوم ${cairoDayName} (${cairoFormatted}).

- اسمع قبل ما تعرض: لو العميل قال طلب عام، اسأله سؤال توضيحي قصير ولا ترمي كل باقات الأسعار دفعة واحدة إلا لو طلب الأسعار صراحة.
- لو العميل مستعجل ⬅️ رشّح VIP (خدمة أسرع وأولوية). لو رايق ⬅️ ابدأ بالخدمة العادية أولاً.
- لو طلب خدمة غير متوفرة في المنيو (مثل ألوان معينة أو نقوش) ⬅️ اطلب منه يوضح تفاصيلها وقوله: "هسجلك تفاصيل طلبك كملاحظة خاصة للاستقبال لتجهيزها لحضرتك في الموعد"، ولا ترفض طلبه.
- ممنوع كتابة أي إيموجيات أو أقواس أو أحرف إنجليزية في اسم العميل.

⚠️ قواعد الأسعار والعربون الرسمية:
- جميع الأسعار بالجنيه المصري (ج.م / جنيه) فقط.
- عربون الجلسة العادية: **${deposits.normal} ج.م**.
- عربون الجلسة الملكية VIP: **${deposits.vip} ج.م**.

📋 كتالوج الخدمات والأسعار الحقيقي:
${servicesCatalogStr}

✂️ طاقم الكباتن:
${barbersListStr}`;

    let responseText = '';
    let lastGeminiError: string | null = null;

    for (const model of candidateModels) {
      if (responseText) break;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload: any = {
          contents: finalContents,
          systemInstruction: {
            parts: [{ text: serverSystemInstruction }],
          },
        };

        const apiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (apiRes.ok) {
          const data: any = await apiRes.json();
          if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText = data.candidates[0].content.parts[0].text;
            break;
          }
        } else {
          const errText = await apiRes.text();
          lastGeminiError = `Model ${model} status ${apiRes.status}: ${errText}`;
          console.error(`[GEMINI_API_ERROR] ${lastGeminiError}`);
        }
      } catch (err: any) {
        lastGeminiError = `Model ${model} threw: ${err.message}`;
        console.error(`[GEMINI_FETCH_ERR] ${lastGeminiError}`);
      }
    }

    if (!responseText) {
      const normU = userText
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F]/g, '')
        .trim();

      if (normU.includes('مستعجل') || normU.includes('اقرب وقت') || normU.includes('دلوقتي') || normU.includes('حالاً') || normU.includes('بسرعه')) {
        responseText = `لو مستعجل وعايز تدخل على الكرسي فوراً بدون دقيقة انتظار واحدة ⚡، بنرشحلك فوراً **حجز جناح كبار الزوار (VIP Suite 👑)**:\n\n• **دخول فوري مباشر:** الكرسي محجوز ومجهز لك فور وصولك.\n• **خصوصية تامة:** جناح خاص معزول ومكيف مع كرسي مساج وشاشات ترفيه وضيافة ملكية.\n• **كبار الحلاقين:** الخدمة بواسطة كبار كباتن الصالون.\n• **عربون التثبيت:** ${deposits.vip} ج.م فقط (يُخصم من إجمالي الفاتورة).\n\nأو يمكنك اختيار الحجز العادي في أقرب دور متاح بالصالة العامة ✂️.`;
      } else if (normU.includes('جناح vip') || normU.includes('حجز vip') || normU.includes('باقات vip') || normU.includes('vip')) {
        responseText = `أهلاً بك في جناح كبار الزوار (VIP Suite 👑✨) بصالون **TrimMind VIP**!\n\nمزايا الجناح الملكي:\n• جناح خاص ومكيف بخصوصية تامة وشاشات ترفيه وكرسي مساج.\n• دخول فوري ومباشر بدون أي انتظار في الطابور.\n• كبار الحلاقين وضيافة كاملة ومشروبات فاخرة مجاناً.\n• عربون تثبيت الجناح: **${deposits.vip} ج.م** فقط يُخصم من الفاتورة.\n\nتفضل بحجز جناحك الآن واختيار موعدك المفضل!`;
      } else if (normU.includes('الفرق بين') || normU.includes('مميزات vip') || normU.includes('ليه vip')) {
        responseText = `إليك الفرق بين الحجز العادي وجناح VIP الملكي 💈👑:\n\n👑 **جناح كبار الزوار (VIP Suite):**\n• دخول فوري بدون أي انتظار نهائياً.\n• جناح خاص مستقل ومعزول مع شاشات ترفيه وضيافة فاخرة مجانية.\n• كبار الحلاقين وعربون الحجز **${deposits.vip} ج.م** فقط.\n\n✂️ **الحجز العادي (الصالة العامة):**\n• في صالة الصالون العامة مع طاقم الحلاقين المحترف.\n• حجز مسبق يضمن دورك في الطابور الذكي.\n• عربون الحجز **${deposits.normal} ج.م** فقط (يُخصم من الفاتورة).`;
      } else if (normU.includes('احجز') || normU.includes('حجز') || normU.includes('موعد') || normU.includes('بكره') || normU.includes('النهارده')) {
        responseText = `تشرفنا وتنورنا في **TrimMind VIP** يا فندم! 💈✨\n\nتقدر تختار موعدك وكابتنك المفضل بخطوات سريعة عبر صفحة الحجز الإلكتروني، وتأكيد الحجز برقم تليفونك وعربون بسيط (${deposits.normal} ج.م للعادي / ${deposits.vip} ج.م للـ VIP) لضمان تجهيز الكرسي لك في الموعد المحدد.`;
      } else if (normU.includes('مطور') || normU.includes('مبرمج') || normU.includes('مين عمل') || normU.includes('احمد عبدالباسط')) {
        responseText = `مطور ومبرمج هذه المنصة هو المهندس المبدع **أحمد عبدالباسط (Ahmed Abdelbaset)** 💻✨.\n\nطالب متميز بكلية الحاسبات والمعلومات والذكاء الاصطناعي، وحاصل على شهادات تدريبية معتمدة من معهد تكنولوجيا المعلومات القومي (**ITI**).\n\n📞 للتواصل مع المطور: **01285694670**`;
      } else if (normU.includes('عنوان') || normU.includes('فرع') || normU.includes('مكان') || normU.includes('مواعيد') || normU.includes('شغالين')) {
        responseText = `صالون **TrimMind VIP (الحداد)** 💈📍:\n• العنوان: سقيل - مركز أوسيم (شارع جمال عبد الناصر)\n• مواعيد العمل: يومياً من 10:00 صباحاً حتى 11:30 مساءً (الحجز الإلكتروني متاح 24/7)\n• هاتف الحجز والاستفسارات: 01285694670`;
      } else if (normU.includes('حلاق') || normU.includes('كابتن') || normU.includes('مين احسن')) {
        responseText = `طاقم كباتن صالون **TrimMind VIP** ✂️👑:\n${barbersListStr}\n\nجميع الكباتن على أعلى درجات الاحترافية والخبرة، ويمكنك اختيار كابتنك المفضل عند حجز الموعد!`;
      } else if (normU.includes('عربون') || normU.includes('دفع') || normU.includes('فودافون') || normU.includes('انستاباي')) {
        responseText = `سياسة العربون والدفع في صالون **TrimMind VIP** 💳:\n• عربون الحجز العادي: **${deposits.normal} ج.م** (يُخصم بالكامل من إجمالي الفاتورة).\n• عربون جناح VIP: **${deposits.vip} ج.م** (يُخصم بالكامل من إجمالي الفاتورة).\n• طرق التحويل المعتمدة: إنستاباي (InstaPay) أو فودافون كاش أو كاش بالصالون.`;
      } else if (normU.match(/^(ازيك|السلام عليكم|سلام|مرحبا|هاي|صباح|مساء|عامل ايه)/i)) {
        responseText = `يا هلا بيك يا فندم، منور صالون **TrimMind VIP**! 💈👑 أقدر أساعدك بإيه النهاردة في الحجز أو تفاصيل الخدمات؟`;
      } else if (normU.match(/^(ايوا|اه|تمام|ماشي|اوك|حاضر|شكرا|تسلم|تسلملي)/i)) {
        responseText = `تحت أمرك وفي خدمتك دايمًا يا فندم! 💈✨ تحب نحدد موعد لطلبك أو تستفسر عن أي خدمة تانية؟`;
      } else {
        const firstFew = liveServices.slice(0, 5).map((s) => `• **${s.name}:** ${s.price} ج.م`).join('\n');
        responseText = `أهلاً بك في صالون **TrimMind VIP**! 💈👑\n\nأبرز خدماتنا المتاحة:\n${firstFew}\n\nتحب نحدد موعد لحضرتك أو تستفسر عن باقات الـ VIP الملكية؟`;
      }
    }

    // Clean response text: remove metadata leaks and leading redundant greetings on continuing turns
    if (responseText) {
      responseText = responseText
        .replace(/\([A-Za-z0-9_\s\u00A0-\uFFFF]*[🦅⚡][^\)]*\)/g, '')
        .replace(/\([A-Z\s]{3,}\)/g, '')
        .trim();

      if (isContinuingConversation) {
        const greetingPhrases = [
          'يا أهلاً بحضرتك', 'يا أهلاً بك', 'يا أهلاً', 'أهلاً بحضرتك', 'أهلاً بك', 'أهلاً يا', 'أهلاً',
          'يا هلا بيك', 'يا هلا بك', 'يا هلا بحضرتك', 'يا هلا يا', 'يا هلا',
          'مرحباً بك', 'مرحباً بحضرتك', 'مرحباً',
          'نورتنا يا', 'نورتنا', 'نورت صالون', 'نورت',
          'منورنا دايماً', 'منورنا يا', 'منورنا', 'منور صالون', 'منور',
          'تشرفنا دائماً بخدمتك', 'تشرفنا دايماً', 'تشرفنا جداً بخدمتك', 'تشرفنا',
          'تحت أمرك يا فندم', 'تحت أمرك يا', 'تحت أمرك',
          'ولا يهمك يا فندم', 'ولا يهمك',
          'من عيوني يا فندم', 'من عيوني يا', 'من عيوني',
          'حبيبي يا فندم', 'حبيبي', 'يا فندم', 'يا غالي', 'يا بطل'
        ];

        let changed = true;
        let guard = 0;
        while (changed && guard < 10) {
          changed = false;
          guard++;
          for (const phrase of greetingPhrases) {
            const regex = new RegExp('^' + phrase + '[^.\\n!?،]*(?:[.\\n!?،]\\s*|\\s+)', 'i');
            if (regex.test(responseText)) {
              responseText = responseText.replace(regex, '').trim();
              changed = true;
            }
          }
          const prefixRegex = /^(في صالون [^.\\n!?،]+[.\\n!?،\\s]*|تنورنا [^.\\n!?،]+[.\\n!?،\\s]*|تشرفنا [^.\\n!?،]+[.\\n!?،\\s]*)/i;
          if (prefixRegex.test(responseText)) {
            responseText = responseText.replace(prefixRegex, '').trim();
            changed = true;
          }
        }
      }

      responseText = responseText.replace(/\s{2,}/g, ' ').trim();
    }

    // 4. Save Assistant Response in Persistent MySQL History
    if (sessionId && responseText) {
      await sessionRepo.recordMessage(sessionId, {
        role: 'assistant',
        content: responseText,
      }).catch((saveErr: any) => {
        console.warn('[AI_CHAT_SAVE_WARN] Could not save assistant message:', saveErr.message);
      });
    }

    res.json({
      success: true,
      text: responseText,
      isDuplicate: false,
    });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    res.status(500).json({ success: false, error: String(err?.message || err || 'Internal server error'), stack: String(err?.stack || '') });
  }
});

export default router;
