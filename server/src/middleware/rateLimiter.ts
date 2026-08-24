import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { redisClient, isRedisConnected } from '../config/redis.js';
import { getClientIp, setRateLimitHeaders } from '../services/accountProtection.service.js';

// ============================================================================
// Multi-Store Universal Rate Limiting Engine (Redis + In-Memory Fail-Open)
// ============================================================================

interface LimiterConfig {
  points: number;
  duration: number; // seconds
  blockDuration?: number; // seconds
  keyPrefix: string;
  errorMessage: string;
}

export function createFlexibleLimiter(config: LimiterConfig) {
  const memoryLimiter = new RateLimiterMemory({
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration,
    keyPrefix: config.keyPrefix,
  });

  let redisLimiter: RateLimiterRedis | null = null;
  if (redisClient) {
    try {
      redisLimiter = new RateLimiterRedis({
        storeClient: redisClient,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
        keyPrefix: config.keyPrefix,
      });
    } catch (err: any) {
      console.warn(`[SECURITY/FAIL_OPEN] Error initializing Redis limiter for ${config.keyPrefix}: ${err.message}`);
    }
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const limiter = isRedisConnected && redisLimiter ? redisLimiter : memoryLimiter;

    try {
      const rateLimiterRes: RateLimiterRes = await limiter.consume(ip, 1);
      setRateLimitHeaders(res, config.points, rateLimiterRes.remainingPoints, rateLimiterRes.msBeforeNext);
      return next();
    } catch (rejRes: any) {
      if (rejRes instanceof Error) {
        // Redis connection error -> Fail-Open strategy (allow request through and log warning)
        console.warn(`⚠️ [SECURITY/FAIL_OPEN] Limiter ${config.keyPrefix} exception: ${rejRes.message}. Request allowed.`);
        return next();
      }

      // Rejection from rate-limiter-flexible (limit reached)
      const resVal = rejRes as RateLimiterRes;
      const retryAfterSeconds = Math.max(1, Math.ceil(resVal.msBeforeNext / 1000));
      setRateLimitHeaders(res, config.points, 0, resVal.msBeforeNext);

      return res.status(429).json({
        success: false,
        error: config.errorMessage,
        retryAfter: retryAfterSeconds,
      });
    }
  };
}

// 1. General API Limiter (120 req / minute)
export const apiLimiter = createFlexibleLimiter({
  points: 120,
  duration: 60,
  keyPrefix: 'rl_api_gen',
  errorMessage: 'تم تجاوز الحد المسموح من الطلبات، يرجى الانتظار دقيقة والمحاولة مرة أخرى.',
});

// 2. Auth Limiter fallback (10 attempts / 15 minutes)
export const authLimiter = createFlexibleLimiter({
  points: 10,
  duration: 15 * 60,
  blockDuration: 15 * 60,
  keyPrefix: 'rl_ip_auth',
  errorMessage: 'تم تجاوز الحد المسموح من محاولات الدخول لحماية الحساب. يرجى المحاولة بعد 15 دقيقة.',
});

// 3. Booking Creation Limiter (15 bookings / hour)
export const bookingLimiter = createFlexibleLimiter({
  points: 15,
  duration: 60 * 60,
  blockDuration: 30 * 60,
  keyPrefix: 'rl_booking_create',
  errorMessage: 'لقد قمت بإنشاء عدد كبير من الحجوزات مؤخراً. يرجى الانتظار قليلاً.',
});

// 4. File Upload Limiter (20 uploads / hour)
export const uploadLimiter = createFlexibleLimiter({
  points: 20,
  duration: 60 * 60,
  blockDuration: 30 * 60,
  keyPrefix: 'rl_upload_files',
  errorMessage: 'تم تجاوز الحد المسموح لرفع الملفات والصور. يرجى المحاولة لاحقاً.',
});

// 5. AI Assistant Query Limiter (30 queries / minute)
export const aiLimiter = createFlexibleLimiter({
  points: 30,
  duration: 60,
  keyPrefix: 'rl_ai_chat',
  errorMessage: 'تم تجاوز الحد المسموح من استفسارات المساعد الذكي. يرجى الانتظار دقيقة والمحاولة مجدداً.',
});

// 6. Agent Tools / WhatsApp Inbound Limiter (150 calls / minute per IP/Phone)
export const agentToolsLimiter = createFlexibleLimiter({
  points: 150,
  duration: 60,
  keyPrefix: 'rl_agent_tools',
  errorMessage: 'تم تجاوز الحد المسموح لطلبات أدوات الذكاء الاصطناعي، يرجى الانتظار قليلاً.',
});

