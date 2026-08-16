import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = Router();

// GET /api/audit-logs (Manager only)
router.get('/', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const action = req.query.action as string;
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (action && action !== 'all') {
      sql += ' AND action = ?';
      params.push(action);
    }

    sql += ' ORDER BY created_at DESC LIMIT 150';

    const rows = await query<any[]>(sql, params);
    const parsed = rows.map((r) => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata,
    }));

    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
