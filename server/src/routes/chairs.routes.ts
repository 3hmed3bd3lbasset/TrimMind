import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { chairSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import { clearAllPersistentChairs } from '../services/persistentStorage.service.js';

const router = Router();

// GET /api/chairs
router.get('/', async (req, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    let sql = 'SELECT * FROM chairs WHERE is_active = 1';
    const params: any[] = [];

    if (branchId) {
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }

    const chairs = await query<any[]>(sql, params);
    return res.json({ success: true, data: chairs || [] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/chairs
router.post('/', optionalAuth, validateBody(chairSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branch_id, barber_id, name, mode, is_active } = req.body;
    const newId = uuidv4();

    await query(
      `INSERT INTO chairs (id, branch_id, barber_id, name, mode, is_active, status)
       VALUES (?, ?, ?, ?, ?, ?, 'available')`,
      [newId, branch_id, barber_id || null, name, mode || 'normal', is_active ? 1 : 0]
    );

    const created = await query<any[]>('SELECT * FROM chairs WHERE id = ?', [newId]);
    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الكرسي بنجاح', data: created[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/chairs/clear-all (Clear all chairs)
router.post('/clear-all', optionalAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    try {
      await query('DELETE FROM chairs');
    } catch {}
    clearAllPersistentChairs();
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم إخلاء جميع الكراسي بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/chairs/:id
router.patch('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'mode', 'is_active', 'status', 'barber_id', 'branch_id', 'current_booking_id'].includes(key)) {
        fields.push(`\`${key}\` = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE chairs SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await query<any[]>('SELECT * FROM chairs WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث الكرسي', data: updated[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/chairs/:id
router.delete('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await query('DELETE FROM chairs WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الكرسي' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
