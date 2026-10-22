import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/** Redis-backed throttle counters; falls back to in-memory when Redis is down. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly log = new Logger(RedisThrottlerStorage.name);
  private redis: Redis | null = null;
  private memory = new Map<string, { totalHits: number; expiresAt: number; isBlocked: boolean; blockExpiresAt: number }>();

  constructor() {
    this.redis = this.createRedisClient();
  }

  private createRedisClient(): Redis | null {
    try {
      const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy: (times: number) => (times > 20 ? null : Math.min(times * 200, 3000)),
        reconnectOnError: (err: Error) => {
          const msg = err.message || '';
          return /READONLY|ETIMEDOUT|ECONNRESET|EPIPE/i.test(msg);
        },
      });
      client.on('error', (err) => {
        this.log.warn(`Redis throttle error: ${err.message}`);
      });
      client.on('connect', () => {
        this.log.debug('Redis throttle connected');
      });
      client.on('close', () => {
        this.log.warn('Redis throttle connection closed — will retry');
      });
      client.connect().catch(() => {
        this.log.warn('Redis throttle initial connect failed; using memory until reconnect');
      });
      return client;
    } catch {
      return null;
    }
  }

  /** Re-create client if the previous one was dropped after a command failure. */
  private ensureRedis(): Redis | null {
    if (this.redis && this.redis.status !== 'end') {
      return this.redis;
    }
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    this.redis = this.createRedisClient();
    return this.redis;
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redis = this.ensureRedis();
    if (redis && redis.status !== 'end') {
      try {
        const blockKey = `${key}:block`;
        const blockedTtl = await redis.pttl(blockKey);
        if (blockedTtl > 0) {
          return {
            totalHits: limit + 1,
            timeToExpire: ttl,
            isBlocked: true,
            timeToBlockExpire: blockedTtl,
          };
        }
        const multi = redis.multi();
        multi.incr(key);
        multi.pttl(key);
        const results = await multi.exec();
        const totalHits = Number(results?.[0]?.[1] || 1);
        let timeToExpire = Number(results?.[1]?.[1] || -1);
        if (timeToExpire < 0) {
          await redis.pexpire(key, ttl);
          timeToExpire = ttl;
        }
        let isBlocked = false;
        let timeToBlockExpire = 0;
        if (totalHits > limit && blockDuration > 0) {
          await redis.set(blockKey, '1', 'PX', blockDuration);
          isBlocked = true;
          timeToBlockExpire = blockDuration;
        }
        return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
      } catch (err) {
        this.log.warn(
          `Redis throttle increment failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.redis?.disconnect();
        this.redis = null;
      }
    }

    const now = Date.now();
    let cur = this.memory.get(key);
    if (cur?.isBlocked && cur.blockExpiresAt > now) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.max(0, cur.expiresAt - now),
        isBlocked: true,
        timeToBlockExpire: cur.blockExpiresAt - now,
      };
    }
    if (!cur || cur.expiresAt <= now) {
      cur = { totalHits: 1, expiresAt: now + ttl, isBlocked: false, blockExpiresAt: 0 };
      this.memory.set(key, cur);
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
    cur.totalHits += 1;
    if (cur.totalHits > limit && blockDuration > 0) {
      cur.isBlocked = true;
      cur.blockExpiresAt = now + blockDuration;
    }
    return {
      totalHits: cur.totalHits,
      timeToExpire: Math.max(0, cur.expiresAt - now),
      isBlocked: cur.isBlocked,
      timeToBlockExpire: Math.max(0, cur.blockExpiresAt - now),
    };
  }
}
