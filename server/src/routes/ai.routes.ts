import { Router, Request, Response } from 'express';

import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const ROLE_KEYS: Record<string, string> = {
  customer: process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || '',
  manager: process.env.GEMINI_API_KEY_MANAGER || process.env.GEMINI_API_KEY || '',
  receptionist: process.env.GEMINI_API_KEY_RECEPTIONIST || process.env.GEMINI_API_KEY || '',
  barber: process.env.GEMINI_API_KEY_BARBER || process.env.GEMINI_API_KEY || '',
};

const candidateModels = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

const SYSTEM_PROMPT_TEMPLATES: Record<string, string> = {
  customer: 'أنت المساعد الذكي لصالون الحلاقة الراقي TrimMind. وظيفتك الإجابة عن استفسارات العملاء حول الخدمات والمواعيد والعناوين بأسلوب مهذب ومرحب واحترافي.',
  barber: 'أنت المساعد الذكي لكابتن الحلاقة في صالون TrimMind. ساعد في إدارة المواعيد والخدمات والعملاء.',
  receptionist: 'أنت المساعد الذكي لموظف الاستقبال في صالون TrimMind. ساعد في تنظيم الطابور والحجوزات ومراجعة الإيصالات.',
  manager: 'أنت المساعد التحليلي لمدير صالون TrimMind. قدم تحليلات وتقارير مالية وتوصيات إدارية دقيقة.',
};

router.post('/chat', aiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { contents, customContext } = req.body;

    // Server-enforced role: Only authenticated users can use staff roles
    const effectiveRole = req.user ? req.user.role : 'customer';
    const apiKey = ROLE_KEYS[effectiveRole] || ROLE_KEYS.customer;

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      res.status(400).json({ success: false, error: 'Contents array is required' });
      return;
    }

    const baseSystemPrompt = SYSTEM_PROMPT_TEMPLATES[effectiveRole] || SYSTEM_PROMPT_TEMPLATES.customer;
    const finalSystemPrompt = customContext ? `${baseSystemPrompt}\n\nسياق إضافي للصالون: ${String(customContext).slice(0, 500)}` : baseSystemPrompt;

    let responseText = '';

    for (const model of candidateModels) {
      if (responseText) break;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const payload: any = {
          contents,
          systemInstruction: {
            parts: [{ text: finalSystemPrompt }],
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
        // try next model
      }
    }

    if (responseText) {
      res.json({ success: true, text: responseText });
    } else {
      res.status(502).json({ success: false, error: 'Gemini service unavailable' });
    }
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

export default router;
