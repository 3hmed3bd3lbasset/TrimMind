import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { JWT_SECRET } from '../config/jwt.js';

// ============================================================================
// Two-Layer Authorization (Role + Ownership/Anti-IDOR) & Default-Deny Security
// ============================================================================

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

/**
 * Core Authentication Guard: Verifies short-lived Access Token
 * Fixed HS256 algorithm enforcement, strictly rejects alg:none
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies) {
      // 2. Fallback to HttpOnly Cookie
      token = req.cookies.access_token || req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: يرجى تسجيل الدخول أولاً',
      });
    }

    // Strict validation with explicit HS256 allow-list (blocks alg:none attacks)
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as any;

    const userId = decoded.sub || decoded.id;
    if (!decoded || !userId) {
      return res.status(401).json({
        success: false,
        error: 'جلسة الدخول غير صالحة أو منتهية',
      });
    }

    // Verify user is still active in database
    const users = await query<any[]>('SELECT * FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1', [
      userId,
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
      assigned_branch_ids:
        typeof u.assigned_branch_ids === 'string'
          ? JSON.parse(u.assigned_branch_ids || '[]')
          : u.assigned_branch_ids || [],
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'انتهت صلاحية الجلسة، يرجى تجديد التوكن أو إعادة تسجيل الدخول',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'رمز الدخول غير صالح',
    });
  }
}

/**
 * Optional Auth helper for public-facing endpoints with enhanced context
 */
export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies) {
      token = req.cookies.access_token || req.cookies.auth_token;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      const userId = decoded?.sub || decoded?.id;
      if (userId) {
        const users = await query<any[]>('SELECT * FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1', [
          userId,
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
            assigned_branch_ids:
              typeof u.assigned_branch_ids === 'string'
                ? JSON.parse(u.assigned_branch_ids || '[]')
                : u.assigned_branch_ids || [],
          };
        }
      }
    }
  } catch {}
  next();
}

// ============================================================================
// LAYER 1: Role-Based Authorization Guard (Coarse-Grained / خشن)
// ============================================================================
export function requireRoles(...roles: Array<'customer' | 'receptionist' | 'manager' | 'barber'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
    }

    // Super Admin & Manager have universal management bypass
    if (req.user.is_super_admin || (roles.includes('manager') && req.user.role === 'manager')) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'غير مصرح: ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء (403 Forbidden)',
      });
    }

    next();
  };
}

// ============================================================================
// LAYER 2: Resource Ownership Guard (Fine-Grained / ناعم / Anti-IDOR Defense)
// ============================================================================
export function requireResourceOwnership(
  fetchOwnerId: (req: AuthenticatedRequest) => Promise<string | null | undefined>
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول أولاً' });
    }

    // Admins and Managers have global management authority
    if (req.user.is_super_admin || req.user.role === 'manager') {
      return next();
    }

    try {
      const ownerId = await fetchOwnerId(req);
      if (!ownerId) {
        return res.status(404).json({ success: false, error: 'المورد المطلوب غير موجود' });
      }

      if (ownerId !== req.user.id && ownerId !== req.user.barber_id) {
        return res.status(403).json({
          success: false,
          error: 'غير مصرح: لا تملك حق الوصول أو التعديل على هذا المورد (Anti-IDOR Protection)',
        });
      }

      next();
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'خطأ أثناء التحقق من ملكية المورد' });
    }
  };
}

// ============================================================================
// Branch Isolation Guard (Multi-Tenant Isolation)
// ============================================================================
export function requireBranchAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
  }

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

// ============================================================================
// DEFAULT-DENY Security Middleware Architecture (Explicit Whitelist Only)
// ============================================================================
const PUBLIC_EXACT_PATHS = new Set([
  // Authentication & Health
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/health',
  '/api/debug-logs',
  // Public Catalog & Availability
  '/api/services',
  '/api/barbers',
  '/api/branches',
  '/api/chairs',
  '/api/queue/board',
  '/api/bookings/track',
  '/api/upload',
  '/api/sync/bootstrap',
  '/api/sync/backup',
  '/api/ai/chat',
]);

export function defaultDenyAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const reqPath = req.path.toLowerCase().replace(/\/+$/, ''); // normalize trailing slashes
  const method = req.method.toUpperCase();

  // Allow non-API assets
  if (!reqPath.startsWith('/api') || reqPath.startsWith('/uploads')) {
    return next();
  }

  // 1. Check exact public whitelist
  if (PUBLIC_EXACT_PATHS.has(reqPath)) {
    return optionalAuth(req, res, next);
  }

  // 2. Allow specific public customer operations on bookings
  if (
    (reqPath === '/api/bookings' && method === 'POST') || // Public booking creation form
    (reqPath === '/api/waitlist' && method === 'POST') || // Public waitlist entry
    (reqPath.startsWith('/api/bookings/') && reqPath.endsWith('/payment-proof') && method === 'POST') ||
    (reqPath.startsWith('/api/bookings/') && reqPath.endsWith('/rate') && method === 'POST') ||
    (reqPath.startsWith('/api/bookings/') && reqPath.endsWith('/cancel') && method === 'POST') ||
    (reqPath.startsWith('/api/agent-tools') || reqPath.startsWith('/api/whatsapp') || reqPath.startsWith('/api/telegram')) // Managed by requireAgentAuth / Telegram API
  ) {
    return optionalAuth(req, res, next);
  }

  // 3. Default-Deny: Block any other endpoint (including GET /api/bookings) unless authenticated
  return requireAuth(req, res, next);
}
