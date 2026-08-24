import { Redis } from 'ioredis';
import type { Redis as RedisClientType } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export let redisClient: RedisClientType | null = null;
export let isRedisConnected = false;

try {
  const commonOptions: any = {
    enableOfflineQueue: false,
    connectTimeout: 4000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy(times: number) {
      // Exponential backoff capped at 3 seconds
      const delay = Math.min(times * 250, 3000);
      return delay;
    },
  };

  if (redisUrl) {
    redisClient = new Redis(redisUrl, commonOptions);
  } else if (process.env.ENABLE_LOCAL_REDIS === 'true' || process.env.REDIS_HOST) {
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      ...commonOptions,
    });
  }

  if (redisClient) {
    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('✅ [SECURITY/REDIS] Redis client connected successfully for Distributed Rate Limiting & Account Protection.');
    });

    redisClient.on('ready', () => {
      isRedisConnected = true;
    });

    redisClient.on('error', (err: any) => {
      isRedisConnected = false;
      console.warn(`⚠️ [SECURITY/REDIS_FAIL_OPEN] Redis connection error: ${err.message}. Fail-Open strategy active.`);
    });

    redisClient.on('close', () => {
      isRedisConnected = false;
    });

    // Non-blocking initial connection attempt
    redisClient.connect().catch((err: any) => {
      isRedisConnected = false;
      console.info(`ℹ️ [SECURITY/REDIS_FAIL_OPEN] Redis not immediately reachable (${err.message}). High-Performance In-Memory Fail-Open store active.`);
    });
  } else {
    console.info('ℹ️ [SECURITY/RATE_LIMITER] Running with High-Performance In-Memory Store (Redis URL not configured).');
  }
} catch (err: any) {
  console.warn(`⚠️ [SECURITY/REDIS_INIT] Error initializing Redis client: ${err.message}`);
  redisClient = null;
  isRedisConnected = false;
}
