import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import { CacheService } from './cache.service';

/** Not re-exported from the package root, so derived from the interface. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * One atomic step per request: count the hit, start the window on the first
 * one, and open a block once the limit is passed. Returns
 * [hits, window ms left, block ms left].
 */
const THROTTLE_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local blocked = redis.call('PTTL', KEYS[2])
if blocked <= 0 and hits > tonumber(ARGV[2]) then
  local duration = tonumber(ARGV[3])
  if duration <= 0 then duration = ttl end
  redis.call('SET', KEYS[2], '1', 'PX', duration)
  blocked = duration
end
return { hits, ttl, blocked }
`;

/**
 * Throttler storage shared across API replicas via Redis, so the per-IP limit
 * is one limit rather than one per pod.
 *
 * If Redis is unavailable it degrades to the library's in-memory counter: the
 * limit becomes per-process for the outage, but requests are never failed
 * because the limiter itself is down.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private degraded = false;

  constructor(private readonly cache: CacheService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    try {
      const [totalHits, windowMs, blockMs] = await this.cache.evalScript<[number, number, number]>(
        THROTTLE_SCRIPT,
        [base, `${base}:block`],
        [ttl, limit, blockDuration],
      );
      if (this.degraded) {
        this.degraded = false;
        this.logger.log('Redis back; throttling is shared across replicas again.');
      }
      const isBlocked = blockMs > 0;
      return {
        totalHits,
        timeToExpire: Math.ceil(windowMs / 1000),
        isBlocked,
        timeToBlockExpire: isBlocked ? Math.ceil(blockMs / 1000) : 0,
      };
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.warn(
          `Redis unavailable, throttling in memory: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
