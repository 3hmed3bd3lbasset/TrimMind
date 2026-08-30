import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { serviceSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import {
  getPersistentDb,
  addOrUpdatePersistentService,
  deletePersistentService,
} from '../services/persistentStorage.service.js';

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
    const newId = req.body.id || uuidv4();

    const serviceObj = {
      id: newId,
      branch_id: branch_id || null,
      name,
      description: description || null,
      price: Number(price),
      duration_minutes: duration_minutes ? Number(duration_minutes) : 30,
      category: category || 'hair',
      is_vip_only: is_vip_only ? 1 : 0,
      is_active: is_active !== false ? 1 : 0,
      image_url: image_url || null,
      created_at: new Date().toISOString(),
    };

    await query(
      `INSERT INTO services (id, branch_id, name, description, price, duration_minutes, category, is_vip_only, is_active, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), description=VALUES(description), duration_minutes=VALUES(duration_minutes)`,
      [newId, serviceObj.branch_id, name, serviceObj.description, serviceObj.price, serviceObj.duration_minutes, serviceObj.category, serviceObj.is_vip_only, serviceObj.is_active, serviceObj.image_url]
    ).catch(() => {});

    addOrUpdatePersistentService(serviceObj);

    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الخدمة بنجاح', data: serviceObj });
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
      await query(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values).catch(() => {});
    }

    let updatedService: any = null;
    const rows = await query<any[]>('SELECT * FROM services WHERE id = ?', [req.params.id]).catch(() => []);
    if (rows && rows.length > 0) {
      updatedService = rows[0];
    } else {
      const pDb = getPersistentDb();
      const match = pDb.services?.find((s: any) => s.id === req.params.id);
      updatedService = { ...(match || {}), ...updates, id: req.params.id };
    }

    addOrUpdatePersistentService(updatedService);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث الخدمة', data: updatedService });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/services/:id (Manager only)
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    await query('DELETE FROM services WHERE id = ?', [req.params.id]).catch(() => {});
    deletePersistentService(req.params.id);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الخدمة' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
