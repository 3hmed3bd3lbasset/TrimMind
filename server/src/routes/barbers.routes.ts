import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { barberSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import {
  getPersistentDb,
  addOrUpdatePersistentBarber,
  deletePersistentBarber,
  saveBase64ImageToVolume,
} from '../services/persistentStorage.service.js';

const router = Router();

// GET /api/barbers (Public list with Persistent Volume Fallback)
router.get('/', async (req, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    let dbBarbers: any[] = [];
    try {
      let sql = 'SELECT * FROM barbers WHERE is_active = 1';
      const params: any[] = [];
      if (branchId) {
        sql += ' AND branch_id = ?';
        params.push(branchId);
      }
      sql += ' ORDER BY rating DESC, created_at ASC';
      const rows = await query<any[]>(sql, params);
      if (rows && rows.length > 0) {
        dbBarbers = rows.map((b) => ({
          ...b,
          service_ids: typeof b.service_ids === 'string' ? JSON.parse(b.service_ids || '[]') : b.service_ids,
        }));
      }
    } catch {}

    const persistentDb = getPersistentDb();
    let persistentList = persistentDb.barbers || [];
    if (branchId) {
      persistentList = persistentList.filter((b) => b.branch_id === branchId || !b.branch_id);
    }

    // Merge: prioritize existing photo_urls and persistent customization
    const mergedMap = new Map<string, any>();
    persistentList.forEach((b) => mergedMap.set(b.id, b));
    dbBarbers.forEach((b) => {
      const existing = mergedMap.get(b.id);
      mergedMap.set(b.id, {
        ...b,
        photo_url: b.photo_url || existing?.photo_url || '',
      });
    });

    const finalBarbers = Array.from(mergedMap.values()).filter((b) => b.is_active !== false && b.is_active !== 0);

    return res.json({ success: true, data: finalBarbers });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/barbers (Manager only)
router.post('/', requireAuth, requireRoles('manager'), validateBody(barberSchema), async (req, res: Response) => {
  try {
    const { branch_id, full_name, phone, photo_url, specialty, is_active, service_ids } = req.body;
    const newId = req.body.id || `barber-${uuidv4().substring(0, 8)}`;

    // Process photo: If base64, save to persistent volume physical file
    const permanentPhotoUrl = photo_url ? saveBase64ImageToVolume(photo_url, `barber_${newId}`) : '';

    const newBarberObj = {
      id: newId,
      branch_id: branch_id || 'branch-elhdad',
      full_name,
      phone: phone || null,
      photo_url: permanentPhotoUrl,
      specialty: specialty || null,
      is_active: is_active ? 1 : 0,
      service_ids: service_ids || [],
      rating: 4.9,
      rating_count: 1,
    };

    try {
      await query(
        `INSERT INTO barbers (id, branch_id, full_name, phone, photo_url, specialty, is_active, service_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), phone=VALUES(phone), photo_url=VALUES(photo_url), specialty=VALUES(specialty), is_active=VALUES(is_active)`,
        [newId, branch_id, full_name, phone || null, permanentPhotoUrl || null, specialty || null, is_active ? 1 : 0, JSON.stringify(service_ids || [])]
      );
    } catch {}

    // Save to persistent volume JSON
    addOrUpdatePersistentBarber(newBarberObj);

    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الحلاق بنجاح', data: newBarberObj });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/barbers/:id
router.patch('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const updates = { ...req.body };
    if (updates.photo_url) {
      updates.photo_url = saveBase64ImageToVolume(updates.photo_url, `barber_${req.params.id}`);
    }

    try {
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
    } catch {}

    const updatedBarber = addOrUpdatePersistentBarber({ id: req.params.id, ...updates });

    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث بيانات الحلاق', data: updatedBarber });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/barbers/:id
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    try {
      await query('DELETE FROM barbers WHERE id = ?', [req.params.id]);
    } catch {}

    deletePersistentBarber(req.params.id);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الحلاق بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
