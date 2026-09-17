import { config } from '../config';
import { logger } from '../logger';

/**
 * HTTP for provider adapters.
 *
 * Providers rate limit, time out, and return 5xx under load. None of that may
 * take down an ingestion run, so this retries with backoff on transient failures
 * and gives up cleanly on the ones retrying cannot fix (401, 403, 404).
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Simple token-bucket spacing, applied per provider. */
class RateLimiter {
  private nextSlot = 0;

  constructor(private readonly perSecond: number) {}

  async wait(): Promise<void> {
    const interval = 1000 / this.perSecond;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + interval;
    if (slot > now) await sleep(slot - now);
  }
}

const limiters = new Map<string, RateLimiter>();

function limiterFor(provider: string): RateLimiter {
  let limiter = limiters.get(provider);
  if (!limiter) {
    limiter = new RateLimiter(config.rateLimitPerSecond);
    limiters.set(provider, limiter);
  }
  return limiter;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit = {},
  attempt = 1,
): Promise<T> {
  await limiterFor(provider).wait();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Onstage/0.1', ...init.headers },
    });

    if (!response.ok) {
      const retryable = RETRYABLE_STATUS.has(response.status);
      throw new ProviderError(
        `${provider} responded ${response.status}`,
        response.status,
        retryable,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            `${provider} request failed: ${(error as Error).message}`,
            undefined,
            // Aborts and network errors are worth one more try.
            true,
          );

    if (providerError.retryable && attempt < 3) {
      const backoff = 2 ** attempt * 500;
      logger.warn(
        { provider, attempt, status: providerError.status },
        `${providerError.message}; retrying in ${backoff}ms`,
      );
      await sleep(backoff);
      return fetchJson<T>(provider, url, init, attempt + 1);
    }

    throw providerError;
  } finally {
    clearTimeout(timer);
  }
}
