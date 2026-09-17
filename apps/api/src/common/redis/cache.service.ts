import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Read-through cache for hot artist and event pages.
 *
 * Redis being down is never allowed to take the API with it: every method here
 * swallows connection errors and falls through to the loader. A slow page beats
 * an error screen.
 */
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
   * Fixed-window counter used for posting and rating rate limits.
   * Returns the count within the current window.
   */
  async increment(key: string, windowSeconds: number): Promise<number> {
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, windowSeconds);
      return count;
    } catch {
      // If the counter is unavailable we let the request through; the database
      // level checks (account age, duplicate detection) still apply.
      return 0;
    }
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
