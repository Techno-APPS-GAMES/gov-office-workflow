import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/** Redis-backed throttle counters; falls back to in-memory when Redis is down. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private redis: Redis | null = null;
  private memory = new Map<string, { totalHits: number; expiresAt: number; isBlocked: boolean; blockExpiresAt: number }>();

  constructor() {
    try {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.redis.connect().catch(() => {
        this.redis?.disconnect();
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
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
    if (this.redis) {
      try {
        const blockKey = `${key}:block`;
        const blockedTtl = await this.redis.pttl(blockKey);
        if (blockedTtl > 0) {
          return {
            totalHits: limit + 1,
            timeToExpire: ttl,
            isBlocked: true,
            timeToBlockExpire: blockedTtl,
          };
        }
        const multi = this.redis.multi();
        multi.incr(key);
        multi.pttl(key);
        const results = await multi.exec();
        const totalHits = Number(results?.[0]?.[1] || 1);
        let timeToExpire = Number(results?.[1]?.[1] || -1);
        if (timeToExpire < 0) {
          await this.redis.pexpire(key, ttl);
          timeToExpire = ttl;
        }
        let isBlocked = false;
        let timeToBlockExpire = 0;
        if (totalHits > limit && blockDuration > 0) {
          await this.redis.set(blockKey, '1', 'PX', blockDuration);
          isBlocked = true;
          timeToBlockExpire = blockDuration;
        }
        return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
      } catch {
        /* fall through */
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
