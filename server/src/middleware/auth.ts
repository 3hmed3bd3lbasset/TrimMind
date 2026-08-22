import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

export interface AuthUser {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  role: 'customer' | 'receptionist' | 'manager' | 'barber';
  is_super_admin?: boolean;
  branch_id?: string;
  barber_id?: string;
  assigned_branch_ids?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret_only_change_in_prod_123456789';

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: يرجى تسجيل الدخول أولاً',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        error: 'جلسة الدخول غير صالحة أو منتهية',
      });
    }

    // Lookup user in DB to ensure not deleted or disabled
    const users = await query<any[]>('SELECT * FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1', [
      decoded.id,
    ]);

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'المستخدم غير موجود أو تم تعطيل حسابه',
      });
    }

    const u = users[0];
    req.user = {
      id: u.id,
      full_name: u.full_name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      is_super_admin: Boolean(u.is_super_admin),
      branch_id: u.branch_id,
      barber_id: u.barber_id,
      assigned_branch_ids: typeof u.assigned_branch_ids === 'string' ? JSON.parse(u.assigned_branch_ids || '[]') : u.assigned_branch_ids,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
    }
    return res.status(401).json({ success: false, error: 'رمز الدخول غير صالح' });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id) {
        const users = await query<any[]>('SELECT * FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1', [
          decoded.id,
        ]);
        if (users && users.length > 0) {
          const u = users[0];
          req.user = {
            id: u.id,
            full_name: u.full_name,
            phone: u.phone,
            email: u.email,
            role: u.role,
            is_super_admin: Boolean(u.is_super_admin),
            branch_id: u.branch_id,
            barber_id: u.barber_id,
            assigned_branch_ids: typeof u.assigned_branch_ids === 'string' ? JSON.parse(u.assigned_branch_ids || '[]') : u.assigned_branch_ids,
          };
        }
      }
    }
  } catch {}
  next();
}

// Role-Based Access Control (RBAC) Guard
export function requireRoles(...roles: Array<'customer' | 'receptionist' | 'manager' | 'barber'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
    }

    // Super Admin has universal access
    if (req.user.is_super_admin) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'عذراً، ليس لديك الصلاحيات الكافية للقيام بهذا الإجراء',
      });
    }

    next();
  };
}

// Branch access guard (Prevents IDOR across branches)
export function requireBranchAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
  }

  // Super admin can access all branches
  if (req.user.is_super_admin || req.user.role === 'manager') {
    return next();
  }

  const requestedBranchId = req.body?.branchId || req.query?.branchId || req.params?.branchId;

  if (requestedBranchId && req.user.branch_id && req.user.branch_id !== requestedBranchId) {
    return res.status(403).json({
      success: false,
      error: 'ليس لديك صلاحية للوصول لبيانات هذا الفرع',
    });
  }

  next();
}
