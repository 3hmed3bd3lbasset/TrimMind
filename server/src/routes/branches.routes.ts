import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { branchSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';
import {
  getPersistentDb,
  addOrUpdatePersistentBranch,
  deletePersistentBranch,
  clearAllPersistentBranches,
} from '../services/persistentStorage.service.js';

const router = Router();

// GET /api/branches (Public list with Persistent Fallback)
router.get('/', async (_req, res: Response) => {
  try {
    let branches = await query<any[]>('SELECT * FROM branches WHERE is_active = 1 OR is_active IS NULL ORDER BY created_at ASC').catch(() => []);
    if (!branches || branches.length === 0) {
      const pBranches = getPersistentDb().branches || [];
      branches = pBranches;
    }
    return res.json({ success: true, data: branches });
  } catch (error: any) {
    const pBranches = getPersistentDb().branches || [];
    return res.json({ success: true, data: pBranches });
  }
});

// POST /api/branches (Create branch)
router.post('/', optionalAuth, validateBody(branchSchema), async (req: AuthenticatedRequest, res: Response) => {
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

// POST /api/branches/clear-all (Clear all branches)
router.post('/clear-all', optionalAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    try {
      await query('DELETE FROM branches');
    } catch {}
    clearAllPersistentBranches();
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم إخلاء جميع الفروع بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/branches/:id
router.patch('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
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

// DELETE /api/branches/:id
router.delete('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
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
