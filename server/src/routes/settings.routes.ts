import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// GET /api/settings
router.get('/', async (_req, res: Response) => {
  try {
    const rows = await query<any[]>('SELECT * FROM settings WHERE setting_key = "general" LIMIT 1');
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: {} });
    }
    const val = typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value;
    return res.json({ success: true, data: val });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/settings (Update Settings & Shift Counter Reset)
router.patch('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const newSettings = req.body;
    const existing = await query<any[]>('SELECT * FROM settings WHERE setting_key = "general" LIMIT 1');
    let merged = newSettings;

    if (existing && existing.length > 0) {
      const current = typeof existing[0].setting_value === 'string' ? JSON.parse(existing[0].setting_value) : existing[0].setting_value;
      merged = { ...current, ...newSettings };
    }

    await query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('general', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [JSON.stringify(merged)]
    );

    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حفظ وتحديث الإعدادات وتصفير العداد بنجاح', data: merged });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
