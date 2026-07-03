import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
}

// ─── Distributed Lock ────────────────────────────────────────

export async function acquireLock(
  key: string,
  ttlMs: number = 30000
): Promise<string | null> {
  const redis = getRedis();
  const token = `${Date.now()}-${Math.random()}`;
  const result = await redis.set(
    `lock:${key}`,
    token,
    'PX',
    ttlMs,
    'NX'
  );
  return result === 'OK' ? token : null;
}

export async function releaseLock(key: string, token: string): Promise<boolean> {
  const redis = getRedis();
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, `lock:${key}`, token);
  return result === 1;
}

// ─── Rate Limiting (Token Bucket) ────────────────────────────

export async function checkRateLimit(
  queueId: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const key = `ratelimit:queue:${queueId}`;
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    
    -- Remove expired entries
    redis.call("ZREMRANGEBYSCORE", key, "-inf", window_start)
    
    -- Count current entries
    local count = redis.call("ZCARD", key)
    
    if count < limit then
      -- Add new entry
      redis.call("ZADD", key, now, now .. "-" .. math.random(1000000))
      redis.call("EXPIRE", key, 60)
      return {1, limit - count - 1, now + 60000}
    else
      local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
      local reset_at = tonumber(oldest[2]) + 60000
      return {0, 0, reset_at}
    end
  `;

  const [allowed, remaining, resetAt] = await redis.eval(
    script,
    1,
    key,
    now.toString(),
    windowStart.toString(),
    limitPerMinute.toString()
  ) as number[];

  return { allowed: allowed === 1, remaining, resetAt };
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
