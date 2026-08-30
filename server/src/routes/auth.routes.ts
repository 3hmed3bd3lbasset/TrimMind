import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authenticateStaff, hashPassword } from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import {
  loginSchema,
  createStaffSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '../validators/auth.schema.js';
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  completePasswordReset,
} from '../services/brevo.service.js';
import {
  getClientIp,
  checkAccountProtectionPreFlight,
  recordFailedAuthAttempt,
  recordSuccessfulAuth,
  setRateLimitHeaders,
  logRateLimitSecurityEvent,
} from '../services/accountProtection.service.js';
import {
  createSession,
  rotateRefreshToken,
  logoutSession,
} from '../services/session.service.js';
import {
  requireAuth,
  requireRoles,
  requireResourceOwnership,
  AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login (Dual-Key Redis Rate Limited, Pre-Flight Protected, & Dual-Token Rotation)
router.post('/login', validateBody(loginSchema), async (req, res: Response) => {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const { identifier, password } = req.body;

  try {
    // 1. PRE-FLIGHT CHECK: Block before touching Database queries or Bcrypt CPU hashing
    const preFlight = await checkAccountProtectionPreFlight(clientIp, identifier);
    if (!preFlight.allowed) {
      const retryAfter = preFlight.retryAfterSeconds || 900;
      setRateLimitHeaders(res, preFlight.limit || 5, 0, preFlight.resetMs || retryAfter * 1000);

      // Async Security Audit Log
      logRateLimitSecurityEvent(clientIp, identifier, preFlight.reason || 'account_or_ip_rate_limited', retryAfter).catch(() => {});

      return res.status(429).json({
        success: false,
        error: 'تم تجاوز الحد المسموح من المحاولات لحماية الحساب. يرجى المحاولة لاحقاً.',
      });
    }

    // 2. AUTHENTICATE (Constant-time execution against User Enumeration)
    const result = await authenticateStaff(identifier, password, clientIp);

    // 3. HANDLE FAILED AUTHENTICATION
    if (!result) {
      const failState = await recordFailedAuthAttempt(clientIp, identifier);
      setRateLimitHeaders(
        res,
        5,
        failState.remainingAccountPoints,
        (failState.retryAfterSeconds || 900) * 1000
      );

      if (failState.isBlocked) {
        logRateLimitSecurityEvent(clientIp, identifier, 'limit_exceeded_on_failure', failState.retryAfterSeconds).catch(() => {});
        return res.status(429).json({
          success: false,
          error: 'تم تجاوز الحد المسموح من المحاولات لحماية الحساب. يرجى المحاولة لاحقاً.',
        });
      }

      return res.status(401).json({
        success: false,
        error: 'بيانات الدخول غير صحيحة. يرجى التأكد من البيانات المدخلة.',
      });
    }

    // 4. HANDLE SUCCESSFUL AUTHENTICATION: Reset account limiter points immediately
    await recordSuccessfulAuth(clientIp, identifier);
    setRateLimitHeaders(res, 5, 5, 900000);

    // 5. Generate Dual-Token Session (15-min Access Token + 30-day Refresh Token Rotation Family)
    const sessionTokens = await createSession(
      result.user.id,
      {
        sub: result.user.id,
        role: result.user.role,
        email: result.user.email,
        branch_id: result.user.branch_id,
        barber_id: result.user.barber_id,
      },
      clientIp,
      userAgent
    );

    // Set Refresh Token in HttpOnly, Secure Cookie
    res.cookie('refresh_token', sessionTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Set short-lived Access Token in HttpOnly Cookie (15 min)
    res.cookie('access_token', sessionTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('auth_token', sessionTokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    return res.json({
      success: true,
      data: {
        token: sessionTokens.accessToken,
        accessToken: sessionTokens.accessToken,
        expiresIn: sessionTokens.expiresIn,
        user: result.user,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء معالجة تسجيل الدخول' });
  }
});

// POST /api/auth/refresh (Dual-Token Rotation with 5s Grace Period & Anti-Theft Family Revocation)
router.post('/refresh', async (req, res: Response) => {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: 'رمز التحديث غير موجود، يرجى تسجيل الدخول مجدداً',
    });
  }

  const rotationResult = await rotateRefreshToken(refreshToken, clientIp, userAgent);

  if (!rotationResult.success || !rotationResult.tokens) {
    // If theft detected or token invalid, clear cookie
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.clearCookie('auth_token');

    return res.status(rotationResult.status || 401).json({
      success: false,
      error: rotationResult.error || 'فشل تجديد الجلسة',
    });
  }

  // Set new rotated Refresh Token in HttpOnly Cookie
  res.cookie('refresh_token', rotationResult.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.cookie('access_token', rotationResult.tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('auth_token', rotationResult.tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  return res.json({
    success: true,
    data: {
      token: rotationResult.tokens.accessToken,
      accessToken: rotationResult.tokens.accessToken,
      expiresIn: rotationResult.tokens.expiresIn,
      user: rotationResult.user,
    },
  });
});

// GET /api/auth/me (Get current session user)
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    data: req.user,
  });
});

// POST /api/auth/logout (Revokes Token Family & Clears Cookies)
router.post('/logout', async (req, res: Response) => {
  const clientIp = getClientIp(req);
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

  if (refreshToken) {
    await logoutSession(refreshToken, clientIp);
  }

  res.clearCookie('refresh_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.clearCookie('auth_token', { path: '/' });
  res.clearCookie('access_token', { path: '/' });

  return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// POST /api/auth/create-staff (Manager only)
router.post(
  '/create-staff',
  requireAuth,
  requireRoles('manager'),
  validateBody(createStaffSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { full_name, phone, email, password, role, branch_id, barber_id, is_super_admin } = req.body;

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

// PATCH /api/auth/profiles/:id (Two-Layer Authorization: Role Guard + Anti-IDOR Ownership Guard)
router.patch(
  '/profiles/:id',
  requireAuth,
  requireRoles('manager', 'barber', 'receptionist'),
  requireResourceOwnership(async (req) => {
    // Fetch profile ID from DB directly, never trust URL param
    const rows = await query<any[]>('SELECT id FROM profiles WHERE id = ? LIMIT 1', [req.params.id]);
    return rows?.[0]?.id;
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { full_name, phone, email, password, role, branch_id, barber_id, is_super_admin, is_active } = req.body;
      const fields: string[] = [];
      const values: any[] = [];

      // Non-managers cannot change their own role or admin status
      if (req.user?.role !== 'manager' && !req.user?.is_super_admin) {
        if (role !== undefined || is_super_admin !== undefined || is_active !== undefined) {
          return res.status(403).json({
            success: false,
            error: 'غير مصرح: تعديل الصلاحيات والأدوار مقتصر على إدارة الصالون فقط',
          });
        }
      }

      if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
      if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
      if (email !== undefined) { fields.push('email = ?'); values.push(email); }
      if (role !== undefined && (req.user?.role === 'manager' || req.user?.is_super_admin)) {
        fields.push('role = ?');
        values.push(role);
      }
      if (branch_id !== undefined && (req.user?.role === 'manager' || req.user?.is_super_admin)) {
        fields.push('branch_id = ?');
        values.push(branch_id);
      }
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
      if (is_active !== undefined && (req.user?.role === 'manager' || req.user?.is_super_admin)) {
        fields.push('is_active = ?');
        values.push(is_active ? 1 : 0);
      }
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
  }
);

// DELETE /api/auth/profiles/:id (Manager only)
router.delete(
  '/profiles/:id',
  requireAuth,
  requireRoles('manager'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await query('DELETE FROM profiles WHERE id = ?', [req.params.id]);
      return res.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ============================================================================
// Brevo-Powered Dynamic Password Reset Engine (Email & SMS OTP)
// ============================================================================

// POST /api/auth/forgot-password (Request 6-Digit OTP via Brevo Email or SMS)
router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res: Response) => {
  const clientIp = getClientIp(req);
  const { identifier } = req.body;

  try {
    const result = await requestPasswordResetOtp(identifier, clientIp);
    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error || 'تعذر إرسال رمز التحقق. يرجى التأكد من البيانات المدخلة.',
      });
    }

    const channelArabic = result.channel === 'email' ? 'البريد الإلكتروني' : 'الرسائل القصيرة (SMS)';

    return res.json({
      success: true,
      message: `تم إرسال رمز التحقق (OTP) بنجاح إلى ${channelArabic} (${result.maskedTarget}).`,
      data: {
        channel: result.channel,
        maskedTarget: result.maskedTarget,
        expiresInMinutes: result.expiresInMinutes || 10,
      },
    });
  } catch (err: any) {
    console.error('[FORGOT_PASSWORD_ERR]:', err);
    return res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء معالجة الطلب' });
  }
});

// POST /api/auth/verify-otp (Verify 6-Digit OTP Code)
router.post('/verify-otp', validateBody(verifyOtpSchema), async (req, res: Response) => {
  const { identifier, otp } = req.body;

  try {
    const result = await verifyPasswordResetOtp(identifier, otp);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'رمز التحقق غير صحيح أو قد انتهت صلاحيته.',
      });
    }

    return res.json({
      success: true,
      message: 'تم التحقق من الرمز بنجاح. يرجى إدخال كلمة المرور الجديدة.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/reset-password (Complete Password Reset & Bcrypt Hash in MySQL)
router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res: Response) => {
  const clientIp = getClientIp(req);
  const { identifier, otp, newPassword } = req.body;

  try {
    const result = await completePasswordReset(identifier, otp, newPassword, clientIp);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'تعذر تغيير كلمة المرور. يرجى إعادة المحاولة.',
      });
    }

    return res.json({
      success: true,
      message: result.message || 'تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.',
    });
  } catch (err: any) {
    console.error('[RESET_PASSWORD_ERR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
