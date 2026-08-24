import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { serviceSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import { getPersistentDb } from '../services/persistentStorage.service.js';

const router = Router();

// GET /api/services (Public catalog with Persistent Fallback)
router.get('/', async (req, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    let sql = 'SELECT * FROM services WHERE is_active = 1 OR is_active IS NULL';
    const params: any[] = [];

    if (branchId) {
      sql += ' AND (branch_id = ? OR branch_id IS NULL)';
      params.push(branchId);
    }

    sql += ' ORDER BY price ASC';
    let services = await query<any[]>(sql, params).catch(() => []);

    if (!services || services.length === 0) {
      const pServices = getPersistentDb().services || [];
      services = pServices;
    }

    return res.json({ success: true, data: services });
  } catch (error: any) {
    const pServices = getPersistentDb().services || [];
    return res.json({ success: true, data: pServices });
  }
});

// POST /api/services (Manager only)
router.post('/', requireAuth, requireRoles('manager'), validateBody(serviceSchema), async (req, res: Response) => {
  try {
    const { branch_id, name, description, price, duration_minutes, category, is_vip_only, is_active, image_url } = req.body;
    const newId = uuidv4();

    await query(
      `INSERT INTO services (id, branch_id, name, description, price, duration_minutes, category, is_vip_only, is_active, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, branch_id || null, name, description || null, price, duration_minutes || 30, category || 'hair', is_vip_only ? 1 : 0, is_active ? 1 : 0, image_url || null]
    );

    const created = await query<any[]>('SELECT * FROM services WHERE id = ?', [newId]);
    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الخدمة بنجاح', data: created[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/services/:id (Manager only)
router.patch('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const updates = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'description', 'price', 'duration_minutes', 'category', 'is_vip_only', 'is_active', 'image_url', 'branch_id'].includes(key)) {
        fields.push(`\`${key}\` = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await query<any[]>('SELECT * FROM services WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث الخدمة', data: updated[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/services/:id (Manager only)
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    await query('DELETE FROM services WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الخدمة' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
