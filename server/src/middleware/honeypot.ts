import { Request, Response, NextFunction, Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redisClient, isRedisConnected } from '../config/redis.js';
import { query } from '../config/database.js';
import { getClientIp } from '../services/accountProtection.service.js';

// ============================================================================
// Intelligent Honeypot Traps & Automated Zero-Trust IP Jail System
// ============================================================================

const MEMORY_IP_JAIL = new Map<string, number>(); // ip -> unjailTimestamp
const JAIL_DURATION_SECONDS = 24 * 60 * 60; // 24 Hours Jail

/**
 * Checks if an IP is currently banned in the IP Jail
 */
export async function isIpJailed(ip: string): Promise<boolean> {
  if (!ip) return false;

  // 1. Check Redis Store
  if (isRedisConnected && redisClient) {
    try {
      const jailed = await redisClient.get(`ip_jail:${ip}`);
      if (jailed) return true;
    } catch {}
  }

  // 2. Check Memory Fallback Store
  const unjailTime = MEMORY_IP_JAIL.get(ip);
  if (unjailTime) {
    if (Date.now() < unjailTime) {
      return true;
    }
    MEMORY_IP_JAIL.delete(ip);
  }

  return false;
}

/**
 * Jails a malicious bot IP for 24 hours
 */
export async function jailMaliciousIp(ip: string, trapName: string, userAgent = 'unknown'): Promise<void> {
  const unjailTime = Date.now() + JAIL_DURATION_SECONDS * 1000;

  // Store in Memory
  MEMORY_IP_JAIL.set(ip, unjailTime);

  // Store in Redis
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(`ip_jail:${ip}`, trapName, 'EX', JAIL_DURATION_SECONDS);
    } catch {}
  }

  console.warn(`🚨 [SECURITY/HONEYPOT_TRAPPED] Malicious bot trapped and jailed! IP: ${ip} via ${trapName}`);

  // Async Audit Log
  query(
    `INSERT INTO audit_logs (id, actor_name, actor_role, action, target_table, target_id, metadata, ip_address, created_at)
     VALUES (?, 'Honeypot Shield', 'automated_security', 'HONEYPOT_BOT_JAILED', 'security_jail', ?, ?, ?, NOW())`,
    [
      uuidv4(),
      ip,
      JSON.stringify({ trapName, userAgent, jailDurationHours: 24, timestamp: new Date().toISOString() }),
      ip,
    ]
  ).catch(() => {});
}

/**
 * Super-Fast Pre-Flight IP Jail Guard (Drops connection in 0.05ms)
 */
export async function ipJailGuard(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const jailed = await isIpJailed(clientIp);

  if (jailed) {
    return res.status(403).json({
      success: false,
      error: 'تم حظر هذا العنوان لمخالفة سياسات الأمان الخاصة بالنظام (Access Denied by Security Jail).',
    });
  }

  next();
}

/**
 * Honeypot Traps Router
 */
export const honeypotRouter = Router();

const HONEYPOT_TRAP_PATHS = [
  '/.env',
  '/.git',
  '/.git/config',
  '/config.json',
  '/wp-admin',
  '/wp-login.php',
  '/admin-login',
  '/api/admin/debug-dump',
  '/api/v1/backup.sql',
  '/phpmyadmin',
  '/actuator',
  '/actuator/health',
];

HONEYPOT_TRAP_PATHS.forEach((trapPath) => {
  honeypotRouter.all(trapPath, async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || 'unknown').substring(0, 200);

    await jailMaliciousIp(clientIp, trapPath, userAgent);

    return res.status(404).json({
      success: false,
      error: 'Not Found',
    });
  });
});
