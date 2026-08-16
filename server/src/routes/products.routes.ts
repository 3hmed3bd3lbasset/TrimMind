import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { productSchema } from '../validators/common.schema.js';
import { broadcastGlobal } from '../socket/realtime.js';

const router = Router();

// GET /api/products
router.get('/', async (req, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    let sql = 'SELECT * FROM products WHERE is_active = 1';
    const params: any[] = [];

    if (branchId) {
      sql += ' AND (branch_id = ? OR branch_id IS NULL)';
      params.push(branchId);
    }

    const products = await query<any[]>(sql, params);
    return res.json({ success: true, data: products });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products
router.post('/', requireAuth, requireRoles('manager'), validateBody(productSchema), async (req, res: Response) => {
  try {
    const { branch_id, name, category, price, is_active, image_url, description } = req.body;
    const newId = uuidv4();

    await query(
      `INSERT INTO products (id, branch_id, name, category, price, is_active, image_url, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, branch_id || null, name, category || 'hot_drink', price, is_active ? 1 : 0, image_url || null, description || null]
    );

    const created = await query<any[]>('SELECT * FROM products WHERE id = ?', [newId]);
    broadcastGlobal('SYNC_STATE');
    return res.status(201).json({ success: true, message: 'تم إضافة المنتج بنجاح', data: created[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/products/:id
router.patch('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    const updates = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'category', 'price', 'is_active', 'image_url', 'description', 'branch_id'].includes(key)) {
        fields.push(`\`${key}\` = ?`);
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await query<any[]>('SELECT * FROM products WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم تحديث المنتج', data: updated[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, requireRoles('manager'), async (req, res: Response) => {
  try {
    await query('DELETE FROM products WHERE id = ?', [req.params.id]);
    broadcastGlobal('SYNC_STATE');
    return res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
