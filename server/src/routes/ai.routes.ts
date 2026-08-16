import { Router, Request, Response } from 'express';

const router = Router();

const ROLE_KEYS: Record<string, string> = {
  customer: process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || '',
  manager: process.env.GEMINI_API_KEY_MANAGER || process.env.GEMINI_API_KEY || '',
  receptionist: process.env.GEMINI_API_KEY_RECEPTIONIST || process.env.GEMINI_API_KEY || '',
  barber: process.env.GEMINI_API_KEY_BARBER || process.env.GEMINI_API_KEY || '',
};

const candidateModels = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { role = 'customer', systemInstruction, contents } = req.body;
    const apiKey = ROLE_KEYS[role] || ROLE_KEYS.customer;

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      res.status(400).json({ error: 'Contents array is required' });
      return;
    }

    let responseText = '';

    for (const model of candidateModels) {
      if (responseText) break;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const payload: any = { contents };
        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

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
