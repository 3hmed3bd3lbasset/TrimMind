import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authenticateStaff, hashPassword } from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, createStaffSchema } from '../validators/auth.schema.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { requireAuth, requireRoles, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login (Strict rate limited & bcrypt authenticated)
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res: Response) => {
  try {
    const { identifier, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await authenticateStaff(identifier, password, ip);
    if (!result) {
      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة. يرجى التأكد من البريد أو رقم الهاتف وكلمة المرور.',
      });
    }

    // Set HTTP-only secure cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'فشل تسجيل الدخول' });
  }
});

// GET /api/auth/me (Get current session user)
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    data: req.user,
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (_req, res: Response) => {
  res.clearCookie('auth_token');
  return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// POST /api/auth/create-staff (Super Admin / Manager only)
router.post(
  '/create-staff',
  requireAuth,
  requireRoles('manager'),
  validateBody(createStaffSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { full_name, phone, email, password, role, branch_id, barber_id, is_super_admin } = req.body;

      // Check existing user
      const existing = await query<any[]>('SELECT id FROM profiles WHERE email = ? OR phone = ? LIMIT 1', [
        email,
        phone,
      ]);
      if (existing && existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'البريد الإلكتروني أو رقم الهاتف مسجل بالفعل مسبقاً',
        });
      }

      const password_hash = await hashPassword(password);
      const newId = uuidv4();

      await query(
        `INSERT INTO profiles (id, full_name, phone, email, password_hash, role, branch_id, barber_id, is_super_admin, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [newId, full_name, phone, email, password_hash, role, branch_id || null, barber_id || null, is_super_admin ? 1 : 0]
      );

      return res.status(201).json({
        success: true,
        message: 'تم إنشاء حساب الموظف بنجاح',
        data: { id: newId, full_name, email, phone, role },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/auth/profiles (Manager only - list all staff accounts)
router.get('/profiles', requireAuth, requireRoles('manager'), async (_req, res: Response) => {
  try {
    const profiles = await query<any[]>(
      'SELECT id, full_name, phone, email, role, is_super_admin, branch_id, barber_id, is_active, created_at, updated_at FROM profiles ORDER BY created_at ASC'
    );
    return res.json({ success: true, data: profiles });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/auth/profiles/:id (Manager only)
router.patch('/profiles/:id', requireAuth, requireRoles('manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { full_name, phone, email, password, role, branch_id, barber_id, is_super_admin, is_active } = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (branch_id !== undefined) { fields.push('branch_id = ?'); values.push(branch_id); }
    if (is_super_admin !== undefined) {
      if (!req.user?.is_super_admin) {
        return res.status(403).json({
          success: false,
          error: 'تعديل صلاحية المدير العام يتطلب حساب مدير عام رئيسي حصراً',
        });
      }
      fields.push('is_super_admin = ?');
      values.push(is_super_admin ? 1 : 0);
    }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await hashPassword(password);
      fields.push('password_hash = ?');
      values.push(hash);
    }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await query<any[]>(
      'SELECT id, full_name, phone, email, role, is_super_admin, branch_id, barber_id, is_active FROM profiles WHERE id = ?',
      [req.params.id]
    );
    return res.json({ success: true, message: 'تم تحديث حساب الموظف بنجاح', data: updated[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/auth/profiles/:id (Manager only)
router.delete('/profiles/:id', requireAuth, requireRoles('manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await query('DELETE FROM profiles WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
