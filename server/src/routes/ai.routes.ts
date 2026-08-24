import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { MySQLConversationSessionRepository } from '../adapters/repositories/MySQLConversationSessionRepository.js';

const router = Router();
const sessionRepo = new MySQLConversationSessionRepository();
const processedMessageIds = new Set<string>();

const ROLE_KEYS: Record<string, string> = {
  customer: process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || '',
  manager: process.env.GEMINI_API_KEY_MANAGER || process.env.GEMINI_API_KEY || '',
  receptionist: process.env.GEMINI_API_KEY_RECEPTIONIST || process.env.GEMINI_API_KEY || '',
  barber: process.env.GEMINI_API_KEY_BARBER || process.env.GEMINI_API_KEY || '',
};

const candidateModels = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

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
        { name: 'قص شعر كلاسيكي (Classic Haircut)', price: 180, duration_minutes: 30 },
        { name: 'VIP Royal Cut', price: 480, duration_minutes: 60 },
        { name: 'VIP Gentleman', price: 650, duration_minutes: 90 },
        { name: 'VIP Full Experience', price: 750, duration_minutes: 120 },
        { name: 'VIP Executive', price: 900, duration_minutes: 130 },
        { name: 'قص شعر + لحية', price: 220, duration_minutes: 40 },
        { name: 'تحديد لحية', price: 100, duration_minutes: 30 },
        { name: 'قص شعر أطفال', price: 120, duration_minutes: 40 },
        { name: 'تدرج Fade', price: 180, duration_minutes: 35 },
        { name: 'بروتين وترطيب شعر', price: 300, duration_minutes: 60 },
        { name: 'تنظيف بشرة', price: 240, duration_minutes: 45 },
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
    const customerNameSnippet = pushName ? `اسم العميل: (${pushName})` : '';
    const serverSystemInstruction = `أنت المساعد الذكي الرسمي لصالون TrimMind VIP.
أسلوبك: راقي، مهذب، سريع، ومفيد باللهجة المصرية الراقية والفصحى السلسة.
${customerNameSnippet}

🧠 قواعد استمرارية المحادثة والسياق (Multi-turn Context):
- أنت في محادثة مستمرة ومباشرة مع العميل.
- راجع سجل الرسائل السابقة بدقة. إذا كان العميل يرد على سؤالك السابق (مثل: اختيار كابتن، تحديد موعد، اختيار خدمة، أو قال "أي واحد" أو "تمام") ⬅️ تابع الحوار من النقطة الحالية فوراً وسجل اختياره، وممنوع منعاً باتاً إعادة التحية الكاملة ("أهلاً بحضرتك...") أو إعادة عرض الكتالوج بالكامل إلا إذا طلب العميل صراحة "عايز الكتالوج" أو "الأسعار إيه".
- كن سريعاً ومختصراً ومباشراً وودوداً.

⚠️ قاعدة حاسمة وصارمة للعملة ومبالغ العربون:
- جميع الأسعار بالجنيه المصري (ج.م / جنيه) فقط لا غير! وممنوع منعاً باتاً ذكر أي عملة أخرى.
- سياسة العربون المعتمدة من الإعدادات:
  • عربون حجز الجلسة العادية: **${deposits.normal} ج.م** فقط.
  • عربون حجز الجلسة الـ VIP الملكية: **${deposits.vip} ج.م** فقط.
- التزم بهذه المبالغ بدقة ولا تذكر أي أرقام أخرى للعربون.

📋 كتالوج الخدمات والأسعار الحقيقي المعتمد من قاعدة البيانات:
${servicesCatalogStr}

✂️ طاقم الكباتن الحلاقين:
${barbersListStr}

${clientSystemInstruction || ''}
${customContext ? `\nسياق إضافي: ${String(customContext).slice(0, 500)}` : ''}`;

    let responseText = '';

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
        }
      } catch (err) {
        // try next candidate model
      }
    }

    if (!responseText) {
      // Dynamic deterministic fallback based on live database services
      const firstFew = liveServices.slice(0, 6).map((s) => `• **${s.name}:** ${s.price} ج.م`).join('\n');
      responseText = `أهلاً بك في صالون **TrimMind VIP**! 💈👑\n\nإليك كتالوج خدماتنا وباقاتنا الرسمية المتاحة:\n\n${firstFew}\n\nيسعدنا حجز موعدك واختيار الكابتن المفضل لحضرتك في أي وقت! ✨`;
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

    res.json({ success: true, text: responseText, isDuplicate: false });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    res.status(500).json({ success: false, error: String(err?.message || err || 'Internal server error'), stack: String(err?.stack || '') });
  }
});

export default router;
