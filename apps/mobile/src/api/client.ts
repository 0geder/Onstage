import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * API client.
 *
 * Two rules from the spec are enforced here rather than left to each screen:
 * every call degrades to cached data rather than showing an error screen, and
 * nothing throws its way to the user without a readable message.
 */

const CONFIGURED_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined);

/** False in a release build that was made without EXPO_PUBLIC_API_BASE_URL. */
export const apiConfigured = Boolean(CONFIGURED_BASE_URL) || __DEV__;

// localhost is only a sensible default on a developer's machine; a release
// build without a configured URL renders a setup error instead (see _layout).
const BASE_URL = CONFIGURED_BASE_URL ?? 'http://localhost:3000';

const API = `${BASE_URL.replace(/\/$/, '')}/v1`;

const CACHE_PREFIX = 'onstage:cache:';
/** Where earlier builds persisted the raw ID token; cleared on startup. */
const LEGACY_TOKEN_KEY = 'onstage:auth-token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the response came from cache after a failed request. */
    readonly servedStale = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Supplies the bearer token for each request. Firebase registers itself here
 * (see lib/auth): it caches the ID token in memory and refreshes it before it
 * expires, so asking per request never sends a stale token and the token is
 * never written to disk by us.
 */
type TokenProvider = (forceRefresh: boolean) => Promise<string | null>;

let tokenProvider: TokenProvider = async () => null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider ?? (async () => null);
}

/** Removes the plaintext token older builds stored on the device. */
export async function clearLegacyToken(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY).catch(() => undefined);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Serve a cached copy when the network fails. GET requests only. */
  cache?: { key: string; ttlSeconds: number };
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';

  const send = async (forceRefresh: boolean) => {
    const token = await tokenProvider(forceRefresh).catch(() => null);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return {
      hadToken: Boolean(token),
      response: await fetch(`${API}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      }),
    };
  };

  try {
    const first = await send(false);
    let response = first.response;
    // A 401 with a token usually means it was revoked or expired mid-flight:
    // force one refresh before treating the user as signed out.
    if (response.status === 401 && first.hadToken) response = (await send(true)).response;

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      const message = Array.isArray(payload?.message)
        ? payload.message[0]
        : (payload?.message ?? 'Something went wrong.');

      // A 4xx is a real answer from the server, so cache is not a substitute.
      if (response.status >= 500 && options.cache) {
        const stale = await readCache<T>(options.cache.key);
        if (stale) return stale;
      }
      throw new ApiError(message, response.status);
    }

    // 204 No Content has no body to parse.
    if (response.status === 204) return undefined as T;

    const data = (await response.json()) as T;
    if (options.cache) await writeCache(options.cache.key, data);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // Offline, or the request timed out. This is exactly when a slightly old
    // lineup beats an error screen.
    if (options.cache) {
      const stale = await readCache<T>(options.cache.key);
      if (stale) return stale;
    }
    throw new ApiError('You appear to be offline. Check your connection.', 0);
  }
}

interface CacheEnvelope<T> {
  storedAt: number;
  data: T;
}

async function writeCache(key: string, data: unknown): Promise<void> {
  try {
    const envelope: CacheEnvelope<unknown> = { storedAt: Date.now(), data };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // A full disk must never break a working request.
  }
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope.data;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  if (ours.length) await AsyncStorage.multiRemove(ours);
}

/** Recent searches live on the device only — they are never sent anywhere. */
const RECENT_KEY = 'onstage:recent-searches';
const RECENT_LIMIT = 8;

export async function recentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function rememberSearch(term: string): Promise<void> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return;
  try {
    const existing = await recentSearches();
    const next = [trimmed, ...existing.filter((item) => item !== trimmed)].slice(0, RECENT_LIMIT);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not worth surfacing.
  }
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
}

export { API as apiBaseUrl };
