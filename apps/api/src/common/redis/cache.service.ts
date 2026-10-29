import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Read-through cache for hot artist and event pages.
 *
 * Redis being down is never allowed to take the API with it: the cache methods
 * swallow connection errors and fall through to the loader. A slow page beats
 * an error screen. The rate-limit primitives are the exception — they report
 * failure so the caller can choose to fail closed.
 */

/** INCR and the window's expiry in one step, so a crash can't leave a key without a TTL. */
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;
  private healthy = true;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('redisUrl') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      // A hung Redis must not hang every request that consults the rate limiter.
      commandTimeout: 1000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('error', (error) => {
      if (this.healthy) {
        this.healthy = false;
        this.logger.warn(`Redis unavailable, serving uncached: ${error.message}`);
      }
    });
    this.client.on('ready', () => {
      this.healthy = true;
      this.logger.log('Redis ready');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache writes are best-effort by design.
    }
  }

  /** Fetch from cache, or run the loader and cache its result. */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // Ignore: the entry will expire on its own TTL.
    }
  }

  /** Invalidate by prefix using SCAN, never KEYS — this runs against production. */
  async invalidatePrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, found] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (found.length > 0) await this.client.del(...found);
      } while (cursor !== '0');
    } catch {
      // Ignore.
    }
  }

  /**
   * Atomic fixed-window counter used for posting and rating rate limits.
   * Returns the count within the current window, or null when Redis is
   * unavailable — the caller decides whether that fails open or closed.
   */
  async increment(key: string, windowSeconds: number): Promise<number | null> {
    try {
      return Number(await this.client.eval(INCREMENT_SCRIPT, 1, key, windowSeconds * 1000));
    } catch {
      return null;
    }
  }

  /** Runs a Lua script atomically. Throws when Redis is unavailable. */
  async evalScript<T>(script: string, keys: string[], args: (string | number)[]): Promise<T> {
    return (await this.client.eval(script, keys.length, ...keys, ...args)) as T;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
