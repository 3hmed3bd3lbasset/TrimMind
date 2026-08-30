import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { branchSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import {
  getPersistentDb,
  addOrUpdatePersistentBranch,
  deletePersistentBranch,
} from '../services/persistentStorage.service.js';

const router = Router();

// GET /api/branches (Public list with resilient fallback)
router.get('/', async (_req, res: Response) => {
  try {
    let branches = await query<any[]>('SELECT * FROM branches ORDER BY created_at ASC').catch(() => []);
    if (!branches || branches.length === 0) {
      branches = getPersistentDb().branches || [];
    }
    return res.json({ success: true, data: branches });
  } catch (error: any) {
    const branches = getPersistentDb().branches || [];
    return res.json({ success: true, data: branches });
  }
});

// POST /api/branches (Manager only)
router.post('/', requireAuth, requireRoles('manager'), validateBody(branchSchema), async (req, res: Response) => {
  try {
    const { name, address, phone, opening_time, closing_time, is_active, image_url, instapay_username, vodafone_cash_number, bank_account_info } = req.body;
    const newId = req.body.id || uuidv4();

    const branchObj = {
      id: newId,
      name,
      address,
      phone,
      opening_time: opening_time || '10:00',
      closing_time: closing_time || '23:00',
      is_active: is_active !== false ? 1 : 0,
      image_url: image_url || null,
      instapay_username: instapay_username || null,
      vodafone_cash_number: vodafone_cash_number || null,
      bank_account_info: bank_account_info || null,
      created_at: new Date().toISOString(),
    };

    await query(
      `INSERT INTO branches (id, name, address, phone, opening_time, closing_time, is_active, image_url, instapay_username, vodafone_cash_number, bank_account_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), address=VALUES(address), phone=VALUES(phone)`,
      [newId, name, address, phone, branchObj.opening_time, branchObj.closing_time, branchObj.is_active, branchObj.image_url, branchObj.instapay_username, branchObj.vodafone_cash_number, branchObj.bank_account_info]
    ).catch(() => {});

    addOrUpdatePersistentBranch(branchObj);

    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة الفرع بنجاح', data: branchObj });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/branches/:id (Manager only)
router.patch('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const updates = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'address', 'phone', 'opening_time', 'closing_time', 'is_active', 'image_url', 'instapay_username', 'vodafone_cash_number', 'bank_account_info'].includes(key)) {
        fields.push(`\`${key}\` = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, values).catch(() => {});
    }

    let updatedBranch: any = null;
    const rows = await query<any[]>('SELECT * FROM branches WHERE id = ?', [req.params.id]).catch(() => []);
    if (rows && rows.length > 0) {
      updatedBranch = rows[0];
    } else {
      const pDb = getPersistentDb();
      const match = pDb.branches?.find((b: any) => b.id === req.params.id);
      updatedBranch = { ...(match || {}), ...updates, id: req.params.id };
    }

    addOrUpdatePersistentBranch(updatedBranch);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث الفرع', data: updatedBranch });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/branches/:id (Manager only)
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    await query('DELETE FROM branches WHERE id = ?', [req.params.id]).catch(() => {});
    deletePersistentBranch(req.params.id);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف الفرع' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
