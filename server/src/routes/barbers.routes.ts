import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { barberSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// GET /api/barbers (Public list)
router.get('/', async (req, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    let sql = 'SELECT * FROM barbers WHERE is_active = 1';
    const params: any[] = [];

    if (branchId) {
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY rating DESC, created_at ASC';

    const barbers = await query<any[]>(sql, params);
    const parsed = barbers.map((b) => ({
      ...b,
      service_ids: typeof b.service_ids === 'string' ? JSON.parse(b.service_ids || '[]') : b.service_ids,
    }));

    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/barbers (Manager only)
router.post('/', requireAuth, requireRoles('manager'), validateBody(barberSchema), async (req, res: Response) => {
  try {
    const { branch_id, full_name, phone, photo_url, specialty, is_active, service_ids } = req.body;
    const newId = uuidv4();

    await query(
      `INSERT INTO barbers (id, branch_id, full_name, phone, photo_url, specialty, is_active, service_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, branch_id, full_name, phone || null, photo_url || null, specialty || null, is_active ? 1 : 0, JSON.stringify(service_ids || [])]
    );

    const created = await query<any[]>('SELECT * FROM barbers WHERE id = ?', [newId]);
    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الحلاق بنجاح', data: created[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/barbers/:id
router.patch('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const updates = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['branch_id', 'full_name', 'phone', 'photo_url', 'specialty', 'is_active'].includes(key)) {
        fields.push(`\`${key}\` = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      } else if (key === 'service_ids') {
        fields.push('`service_ids` = ?');
        values.push(JSON.stringify(value || []));
      }
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE barbers SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await query<any[]>('SELECT * FROM barbers WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث بيانات الحلاق', data: updated[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/barbers/:id
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    await query('DELETE FROM barbers WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الحلاق بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
