import { Router, Request, Response } from 'express';
import {
  processTelegramUpdate,
  getTelegramBotStatus,
  trackQueueAndBooking,
  startTelegramBot,
  stopTelegramBot,
} from '../services/telegramBot.service.js';

const router = Router();

// GET /api/telegram/status
router.get('/status', (req: Request, res: Response) => {
  const status = getTelegramBotStatus();
  return res.json({
    success: true,
    data: status,
  });
});

// POST /api/telegram/webhook (Optional Webhook Handler)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    if (update) {
      processTelegramUpdate(update).catch((err) => console.error('[TELEGRAM_WEBHOOK_ERR]', err));
    }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/track-preview
router.post('/track-preview', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
    const result = await trackQueueAndBooking(query);
    return res.json({ success: true, text: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
