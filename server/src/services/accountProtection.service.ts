import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { redisClient, isRedisConnected } from '../config/redis.js';
import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Dual-Key Rate Limiter & Account Protection Engine (Fail-Open Architecture)
// ============================================================================

// 1. IP Key Configuration: 10 attempts per 15 minutes (graceful for NAT / public WiFi)
const IP_LIMITER_OPTS = {
  points: 10,
  duration: 15 * 60, // 15 minutes in seconds
  blockDuration: 15 * 60, // Block for 15 minutes if limit reached
  keyPrefix: 'rl_ip_auth',
};

// 2. Email / Account Key Configuration: 5 failed attempts per 15 minutes (Anti-Brute Force)
const ACCOUNT_LIMITER_OPTS = {
  points: 5,
  duration: 15 * 60, // 15 minutes in seconds
  blockDuration: 15 * 60, // Block for 15 minutes
  keyPrefix: 'rl_acc_auth',
};

// 3. Progressive / Exponential Backoff Limiter for repeated account lockout protection
const CONSECUTIVE_FAILS_OPTS = {
  points: 15,
  duration: 24 * 60 * 60, // 24 hours
  blockDuration: 60 * 60, // 1 hour block for persistent attackers
  keyPrefix: 'rl_consec_fails',
};

// In-Memory Fallback Limiters (Guarantees Fail-Open operation if Redis is unavailable)
const ipLimiterMem = new RateLimiterMemory(IP_LIMITER_OPTS);
const accountLimiterMem = new RateLimiterMemory(ACCOUNT_LIMITER_OPTS);
const consecutiveFailsMem = new RateLimiterMemory(CONSECUTIVE_FAILS_OPTS);

// Distributed Redis Limiters (Multi-instance compatible, initialized if Redis is configured)
let ipLimiterRedis: RateLimiterRedis | null = null;
let accountLimiterRedis: RateLimiterRedis | null = null;
let consecutiveFailsRedis: RateLimiterRedis | null = null;

if (redisClient) {
  try {
    ipLimiterRedis = new RateLimiterRedis({
      storeClient: redisClient,
      ...IP_LIMITER_OPTS,
      inMemoryBlockOnConsumed: 10,
      inMemoryBlockDuration: 15 * 60,
    });

    accountLimiterRedis = new RateLimiterRedis({
      storeClient: redisClient,
      ...ACCOUNT_LIMITER_OPTS,
      inMemoryBlockOnConsumed: 5,
      inMemoryBlockDuration: 15 * 60,
    });

    consecutiveFailsRedis = new RateLimiterRedis({
      storeClient: redisClient,
      ...CONSECUTIVE_FAILS_OPTS,
    });
  } catch (err: any) {
    console.warn(`⚠️ [SECURITY/REDIS_FAIL_OPEN] Error setting up RateLimiterRedis: ${err.message}. Operating in Memory Fail-Open mode.`);
  }
}

/**
 * Resolves active limiter with Fail-Open resilience
 */
function getActiveLimiter(type: 'ip' | 'account' | 'consecutive') {
  if (isRedisConnected && redisClient) {
    if (type === 'ip' && ipLimiterRedis) return ipLimiterRedis;
    if (type === 'account' && accountLimiterRedis) return accountLimiterRedis;
    if (type === 'consecutive' && consecutiveFailsRedis) return consecutiveFailsRedis;
  }
  // Fallback to Memory limiter
  if (type === 'ip') return ipLimiterMem;
  if (type === 'account') return accountLimiterMem;
  return consecutiveFailsMem;
}

/**
 * Extracts true client IP behind reverse proxies / load balancers
 */
export function getClientIp(req: any): string {
  const xForwarded = req.headers?.['x-forwarded-for'];
  if (typeof xForwarded === 'string' && xForwarded.trim()) {
    return xForwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Masks identifier (Email or Phone) for safe security logging without leaking PII
 */
export function maskIdentifier(identifier: string): string {
  if (!identifier) return '***';
  const clean = identifier.trim();
  if (clean.includes('@')) {
    const [user, domain] = clean.split('@');
    const maskedUser = user.length > 2 ? `${user.substring(0, 2)}***` : `${user}***`;
    return `${maskedUser}@${domain}`;
  }
  if (clean.length >= 7) {
    return `${clean.substring(0, 3)}****${clean.substring(clean.length - 2)}`;
  }
  return `${clean.substring(0, 2)}***`;
}

/**
 * Standard HTTP RateLimit & Retry-After response headers
 */
export function setRateLimitHeaders(
  res: any,
  limit: number,
  remaining: number,
  resetMs: number
) {
  const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
  const resetEpoch = Math.ceil((Date.now() + resetMs) / 1000);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(resetEpoch));

  if (remaining <= 0) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
}

export interface PreFlightCheckResult {
  allowed: boolean;
  reason?: 'ip_blocked' | 'account_blocked';
  retryAfterSeconds?: number;
  limit?: number;
  remaining?: number;
  resetMs?: number;
}

/**
 * Pre-Flight Check: Evaluates limits BEFORE hitting Database queries or Bcrypt CPU hashing.
 */
export async function checkAccountProtectionPreFlight(
  ip: string,
  rawIdentifier: string
): Promise<PreFlightCheckResult> {
  const identifier = (rawIdentifier || '').toLowerCase().trim();

  try {
    const ipLimiter = getActiveLimiter('ip');
    const accountLimiter = getActiveLimiter('account');

    // Parallel check on both IP and Account keys without consuming points
    const [ipRes, accRes] = await Promise.all([
      ipLimiter.get(ip).catch((err) => {
        console.warn(`[SECURITY/REDIS_FAIL_OPEN] IP Pre-Flight error: ${err?.message}`);
        return null;
      }),
      accountLimiter.get(identifier).catch((err) => {
        console.warn(`[SECURITY/REDIS_FAIL_OPEN] Account Pre-Flight error: ${err?.message}`);
        return null;
      }),
    ]);

    // Check if IP is currently blocked
    if (ipRes && ipRes.remainingPoints <= 0 && ipRes.msBeforeNext > 0) {
      return {
        allowed: false,
        reason: 'ip_blocked',
        retryAfterSeconds: Math.ceil(ipRes.msBeforeNext / 1000),
        limit: IP_LIMITER_OPTS.points,
        remaining: 0,
        resetMs: ipRes.msBeforeNext,
      };
    }

    // Check if Account is currently blocked
    if (accRes && accRes.remainingPoints <= 0 && accRes.msBeforeNext > 0) {
      return {
        allowed: false,
        reason: 'account_blocked',
        retryAfterSeconds: Math.ceil(accRes.msBeforeNext / 1000),
        limit: ACCOUNT_LIMITER_OPTS.points,
        remaining: 0,
        resetMs: accRes.msBeforeNext,
      };
    }

    const lowestRemaining = Math.min(
      ipRes ? ipRes.remainingPoints : IP_LIMITER_OPTS.points,
      accRes ? accRes.remainingPoints : ACCOUNT_LIMITER_OPTS.points
    );

    return {
      allowed: true,
      limit: ACCOUNT_LIMITER_OPTS.points,
      remaining: lowestRemaining,
      resetMs: Math.max(ipRes?.msBeforeNext || 0, accRes?.msBeforeNext || 0),
    };
  } catch (err: any) {
    // Fail-Open: allow request to proceed if rate limiter engine throws unexpected error
    console.warn(`⚠️ [SECURITY/FAIL_OPEN] Pre-Flight rate limiter exception: ${err.message}. Request allowed.`);
    return { allowed: true, limit: 10, remaining: 10, resetMs: 0 };
  }
}

/**
 * Consumes points upon failed authentication (Wrong password or non-existent user).
 */
export async function recordFailedAuthAttempt(
  ip: string,
  rawIdentifier: string
): Promise<{ remainingAccountPoints: number; retryAfterSeconds: number; isBlocked: boolean }> {
  const identifier = (rawIdentifier || '').toLowerCase().trim();
  let remainingAccountPoints = ACCOUNT_LIMITER_OPTS.points;
  let retryAfterSeconds = 0;
  let isBlocked = false;

  try {
    const ipLimiter = getActiveLimiter('ip');
    const accountLimiter = getActiveLimiter('account');
    const consecutiveLimiter = getActiveLimiter('consecutive');

    // Consume points from both limiters
    const results = await Promise.allSettled([
      ipLimiter.consume(ip, 1),
      accountLimiter.consume(identifier, 1),
      consecutiveLimiter.consume(identifier, 1),
    ]);

    // Handle account limiter outcome
    const accResult = results[1];
    if (accResult.status === 'fulfilled') {
      const resVal = accResult.value as RateLimiterRes;
      remainingAccountPoints = resVal.remainingPoints;
    } else {
      // Limit was exceeded, points consumed
      isBlocked = true;
      const rejVal = accResult.reason as RateLimiterRes;
      remainingAccountPoints = 0;
      retryAfterSeconds = Math.ceil((rejVal?.msBeforeNext || 900000) / 1000);
    }

    // Handle IP limiter outcome
    const ipResult = results[0];
    if (ipResult.status === 'rejected') {
      isBlocked = true;
      const rejVal = ipResult.reason as RateLimiterRes;
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((rejVal?.msBeforeNext || 900000) / 1000));
    }
  } catch (err: any) {
    console.warn(`⚠️ [SECURITY/FAIL_OPEN] Error consuming rate limit points: ${err.message}`);
  }

  return { remainingAccountPoints, retryAfterSeconds, isBlocked };
}

/**
 * Resets account limiter points immediately upon successful authentication.
 */
export async function recordSuccessfulAuth(ip: string, rawIdentifier: string): Promise<void> {
  const identifier = (rawIdentifier || '').toLowerCase().trim();

  try {
    const accountLimiter = getActiveLimiter('account');
    const consecutiveLimiter = getActiveLimiter('consecutive');

    await Promise.allSettled([
      accountLimiter.delete(identifier),
      consecutiveLimiter.delete(identifier),
      // We also reward/decay the IP limiter
      getActiveLimiter('ip').reward(ip, 1).catch(() => {}),
    ]);
  } catch (err: any) {
    console.warn(`⚠️ [SECURITY/FAIL_OPEN] Error resetting account rate limit: ${err.message}`);
  }
}

/**
 * Records Rate Limit Rejection event in Database Security Audit Logs.
 */
export async function logRateLimitSecurityEvent(
  ip: string,
  rawIdentifier: string,
  reason: string,
  retryAfterSeconds: number
): Promise<void> {
  try {
    const masked = maskIdentifier(rawIdentifier);
    await query(
      `INSERT INTO audit_logs (id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address, created_at)
       VALUES (?, ?, 'security_guard', 'RATE_LIMIT_BLOCKED', 'auth', ?, ?, ?, NOW())`,
      [
        uuidv4(),
        `IP: ${ip}`,
        masked,
        JSON.stringify({
          ip,
          target_identifier: masked,
          block_reason: reason,
          retry_after_seconds: retryAfterSeconds,
          timestamp: new Date().toISOString(),
          defense_layer: 'DualKey_Redis_AccountProtection',
        }),
        ip,
      ]
    );
  } catch (err: any) {
    // Non-blocking log failure
    console.warn(`[SECURITY/AUDIT_LOG_ERROR] Could not record rate limit audit event: ${err.message}`);
  }
}
