import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

// ============================================================================
// Enterprise Dual-Token & Session Management Engine (HS256 Rotation & Anti-Theft)
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_elite_salon_platform_development_123456789';
const ACCESS_TOKEN_EXPIRY = '15m'; // Strict 15-Minute Short-Lived Access Token
const REFRESH_TOKEN_EXPIRY_DAYS = 30; // 30-Day Absolute Session Expiry
const GRACE_PERIOD_MS = 5000; // 5-Second Grace Period for Concurrent Requests

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 900 seconds
}

export interface UserSessionPayload {
  sub: string;
  role: string;
  email?: string | null;
  branch_id?: string | null;
  barber_id?: string | null;
}

/**
 * Signs a short-lived 15-minute Access Token with HS256 algorithm explicitly
 * Minimal payload without passwords or sensitive secrets
 */
export function signAccessToken(payload: UserSessionPayload): string {
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      email: payload.email || null,
      branch_id: payload.branch_id || null,
      barber_id: payload.barber_id || null,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_EXPIRY,
    }
  );
}

/**
 * Strictly verifies Access Token with algorithm allow-list (rejects alg:none)
 */
export function verifyAccessToken(token: string): UserSessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as any;
    if (!decoded || !decoded.sub) return null;
    return {
      sub: decoded.sub,
      role: decoded.role,
      email: decoded.email,
      branch_id: decoded.branch_id,
      barber_id: decoded.barber_id,
    };
  } catch {
    return null;
  }
}

/**
 * Generates a high-entropy cryptographically secure refresh token
 */
export function generateSecureRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Hashes a refresh token with SHA-256 for secure database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a brand new session and Token Family
 */
export async function createSession(
  userId: string,
  userPayload: UserSessionPayload,
  ipAddress: string,
  userAgent: string
): Promise<TokenPair> {
  const familyId = uuidv4();
  const rawRefreshToken = generateSecureRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const tokenId = uuidv4();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, is_revoked, expires_at, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
    [tokenId, userId, tokenHash, familyId, expiresAt, ipAddress, (userAgent || '').substring(0, 250)]
  );

  const accessToken = signAccessToken(userPayload);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: 900, // 15 minutes
  };
}

/**
 * Rotates Refresh Token with 5-Second Grace Period and Token Reuse Theft Detection
 */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  ipAddress: string,
  userAgent: string
): Promise<{ success: boolean; tokens?: TokenPair; user?: any; error?: string; status?: number }> {
  if (!rawRefreshToken) {
    return { success: false, error: 'رمز التحديث غير موجود', status: 401 };
  }

  const tokenHash = hashToken(rawRefreshToken);

  const records = await query<any[]>(
    `SELECT rt.*, p.full_name, p.phone, p.email, p.role, p.is_super_admin, p.branch_id, p.barber_id, p.assigned_branch_ids, p.is_active
     FROM refresh_tokens rt
     JOIN profiles p ON rt.user_id = p.id
     WHERE rt.token_hash = ? LIMIT 1`,
    [tokenHash]
  );

  if (!records || records.length === 0) {
    return { success: false, error: 'جلسة التحديث غير صالحة', status: 401 };
  }

  const record = records[0];

  // 1. Check account active status
  if (!record.is_active) {
    return { success: false, error: 'تم تعطيل الحساب', status: 401 };
  }

  // 2. Check Absolute Expiry (30 days)
  if (new Date(record.expires_at) < new Date()) {
    return { success: false, error: 'انتهت صلاحية الجلسة بالكامل، يرجى تسجيل الدخول مجدداً', status: 401 };
  }

  // 3. Check Token Revocation & Theft Detection
  if (record.is_revoked === 1) {
    const revokedTime = record.revoked_at ? new Date(record.revoked_at).getTime() : 0;
    const nowTime = Date.now();
    const elapsedSinceRevocation = nowTime - revokedTime;

    // A. Grace Period (5 Seconds) for parallel concurrent requests (Race Condition Defense)
    if (elapsedSinceRevocation <= GRACE_PERIOD_MS) {
      console.info(`ℹ️ [AUTH/GRACE_PERIOD] Valid concurrent refresh within 5s grace period for family ${record.family_id}`);

      const userPayload: UserSessionPayload = {
        sub: record.user_id,
        role: record.role,
        email: record.email,
        branch_id: record.branch_id,
        barber_id: record.barber_id,
      };

      const newAccessToken = signAccessToken(userPayload);
      const newRawRefreshToken = generateSecureRefreshToken();
      const newTokenHash = hashToken(newRawRefreshToken);
      const newTokenId = uuidv4();

      await query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, is_revoked, expires_at, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
        [newTokenId, record.user_id, newTokenHash, record.family_id, record.expires_at, ipAddress, (userAgent || '').substring(0, 250)]
      );

      return {
        success: true,
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRawRefreshToken,
          expiresIn: 900,
        },
        user: {
          id: record.user_id,
          full_name: record.full_name,
          phone: record.phone,
          email: record.email,
          role: record.role,
          is_super_admin: Boolean(record.is_super_admin),
          branch_id: record.branch_id,
          barber_id: record.barber_id,
          assigned_branch_ids: typeof record.assigned_branch_ids === 'string' ? JSON.parse(record.assigned_branch_ids || '[]') : record.assigned_branch_ids,
        },
      };
    }

    // B. Replay Attack / Token Theft Detected (> 5 seconds after revocation)
    console.error(`🚨 [SECURITY/TOKEN_THEFT_DETECTED] Attempt to reuse revoked refresh token! Revoking entire family ${record.family_id} for user ${record.user_id}`);

    // Invalidate ALL tokens in this family immediately
    await query(
      `UPDATE refresh_tokens SET is_revoked = 1, revoked_at = NOW() WHERE family_id = ?`,
      [record.family_id]
    );

    // Record High-Severity Security Incident in Audit Logs
    await query(
      `INSERT INTO audit_logs (id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address, created_at)
       VALUES (?, ?, 'security_guard', 'REFRESH_TOKEN_THEFT_DETECTED', 'refresh_tokens', ?, ?, ?, NOW())`,
      [
        uuidv4(),
        `User: ${record.user_id}`,
        record.family_id,
        JSON.stringify({
          alert: 'POSSIBLE_TOKEN_HIJACKING',
          user_id: record.user_id,
          family_id: record.family_id,
          attacker_ip: ipAddress,
          user_agent: userAgent,
          original_revocation_time: record.revoked_at,
          attempt_time: new Date().toISOString(),
        }),
        ipAddress,
      ]
    ).catch(() => {});

    return {
      success: false,
      error: 'تم اكتشاف نشاط غير مصرح به. تم إلغاء جميع الجلسات المرتبطة لحماية الحساب.',
      status: 403,
    };
  }

  // 4. Token is Active -> Perform Clean Rotation
  // Mark current token as revoked with exact timestamp
  await query(
    `UPDATE refresh_tokens SET is_revoked = 1, revoked_at = NOW() WHERE id = ?`,
    [record.id]
  );

  // Generate new pair
  const userPayload: UserSessionPayload = {
    sub: record.user_id,
    role: record.role,
    email: record.email,
    branch_id: record.branch_id,
    barber_id: record.barber_id,
  };

  const newAccessToken = signAccessToken(userPayload);
  const newRawRefreshToken = generateSecureRefreshToken();
  const newTokenHash = hashToken(newRawRefreshToken);
  const newTokenId = uuidv4();

  // Inherit the family_id and original absolute expiry
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, is_revoked, expires_at, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
    [newTokenId, record.user_id, newTokenHash, record.family_id, record.expires_at, ipAddress, (userAgent || '').substring(0, 250)]
  );

  return {
    success: true,
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    },
    user: {
      id: record.user_id,
      full_name: record.full_name,
      phone: record.phone,
      email: record.email,
      role: record.role,
      is_super_admin: Boolean(record.is_super_admin),
      branch_id: record.branch_id,
      barber_id: record.barber_id,
      assigned_branch_ids: typeof record.assigned_branch_ids === 'string' ? JSON.parse(record.assigned_branch_ids || '[]') : record.assigned_branch_ids,
    },
  };
}

/**
 * Revokes all tokens in the family on Logout
 */
export async function logoutSession(rawRefreshToken: string, ipAddress: string): Promise<boolean> {
  if (!rawRefreshToken) return false;
  try {
    const tokenHash = hashToken(rawRefreshToken);
    const records = await query<any[]>(
      `SELECT family_id, user_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );

    if (records && records.length > 0) {
      const { family_id, user_id } = records[0];
      await query(
        `UPDATE refresh_tokens SET is_revoked = 1, revoked_at = NOW() WHERE family_id = ?`,
        [family_id]
      );

      await query(
        `INSERT INTO audit_logs (id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address, created_at)
         VALUES (?, ?, 'user', 'AUTH_LOGOUT', 'profiles', ?, ?, ?, NOW())`,
        [
          uuidv4(),
          `User: ${user_id}`,
          user_id,
          JSON.stringify({ family_id, ip: ipAddress, timestamp: new Date().toISOString() }),
          ipAddress,
        ]
      ).catch(() => {});
    }
    return true;
  } catch (err: any) {
    console.warn(`[AUTH/LOGOUT_ERROR]: ${err?.message}`);
    return false;
  }
}

/**
 * Daily Garbage Collection: Purges expired and long-revoked tokens
 */
export async function purgeExpiredTokens(): Promise<number> {
  try {
    const result = await query<any>(
      `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW() 
          OR (is_revoked = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY))`
    );
    const affected = result?.affectedRows || 0;
    if (affected > 0) {
      console.log(`🧹 [GC/REFRESH_TOKENS] Cleaned up ${affected} expired/revoked session tokens.`);
    }
    return affected;
  } catch (err: any) {
    console.warn(`⚠️ [GC/REFRESH_TOKENS_ERROR]: ${err?.message}`);
    return 0;
  }
}
