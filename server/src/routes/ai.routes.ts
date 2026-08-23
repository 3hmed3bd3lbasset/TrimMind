import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const ROLE_KEYS: Record<string, string> = {
  customer: process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || '',
  manager: process.env.GEMINI_API_KEY_MANAGER || process.env.GEMINI_API_KEY || '',
  receptionist: process.env.GEMINI_API_KEY_RECEPTIONIST || process.env.GEMINI_API_KEY || '',
  barber: process.env.GEMINI_API_KEY_BARBER || process.env.GEMINI_API_KEY || '',
};

const candidateModels = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

router.post('/chat', aiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { contents, systemInstruction: clientSystemInstruction, customContext } = req.body;

    const effectiveRole = req.user ? req.user.role : 'customer';
    const apiKey = ROLE_KEYS[effectiveRole] || ROLE_KEYS.customer;

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      res.status(400).json({ success: false, error: 'Contents array is required' });
      return;
    }

    // 1. Fetch Real-Time Live Salon Context from MySQL Database
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

    // 2. Compose Authoritative System Instruction
    const serverSystemInstruction = `أنت المساعد الذكي الرسمي لصالون TrimMind VIP.
أسلوبك: راقي، مهذب، سريع، ومفيد باللهجة المصرية الراقية والفصحى السلسة.

⚠️ قاعدة حاسمة وصارمة للعملة والأسعار:
- جميع الأسعار بالجنيه المصري (ج.م / جنيه) فقط لا غير!
- ممنوع منعاً باتاً ذكر عملة الريال أو الدولار أو أي عملة أخرى.

📋 كتالوج الخدمات والأسعار الحقيقي المعتمد من قاعدة البيانات:
${servicesCatalogStr}

✂️ طاقم الكباتن الحلاقين:
${barbersListStr}

- عند طلب العميل "افتح الكتالوج" أو السؤال عن الخدمات أو الأسعار، اعرض له فوراً الكتالوج الحقيقي أعلاه بأسعاره الدقيقة بالجنيه المصري (ج.م).

${clientSystemInstruction || ''}
${customContext ? `\nسياق إضافي: ${String(customContext).slice(0, 500)}` : ''}`;

    let responseText = '';

    for (const model of candidateModels) {
      if (responseText) break;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload: any = {
          contents,
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

    res.json({ success: true, text: responseText });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

export default router;
