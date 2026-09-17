import 'server-only';

/**
 * Admin API access.
 *
 * The admin token lives only in this server process and never reaches a
 * browser: every call here runs in a server component or a server action. That
 * is the whole reason the CMS is a server-rendered app rather than a SPA.
 */

const API_BASE = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/v1`;

function authHeaders(): Record<string, string> {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token || token === 'change-me-in-every-environment') {
    throw new Error(
      'ADMIN_API_TOKEN is not configured. Set it in .env before using the admin CMS.',
    );
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function adminRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: authHeaders(),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Curation is a live view of the data; a cached list is worse than useless.
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : (payload?.message ?? `Request failed (${response.status})`);
    throw new AdminApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── Types the CMS screens use ─────────────────────────────

export interface AdminEvent {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  status: string;
  source: string;
  isLocked: boolean;
  isPromoted: boolean;
  primaryArtist: { id: string; name: string };
  venue: { id: string; name: string; city: string };
  ticketOptions: { id: string; tierName: string; priceMinor: number | null; provider: string }[];
}

export interface AdminVenue {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
  lat: number;
  lng: number;
  wheelchairAccess: boolean | null;
  cloakroom: boolean | null;
  ageRestriction: string | null;
  reentryPolicy: string | null;
}

export interface CoverageRow {
  city: string;
  country: string;
  upcoming: number;
  manual: number;
  sources: string[];
}

export interface IngestionRun {
  id: string;
  source: string;
  tier: string;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  deduped: number;
  failed: number;
  error: string | null;
}

export interface QueuedComment {
  id: string;
  body: string;
  tag: string;
  scamScore: number;
  scamSignals: { code: string; detail: string; weight: number }[];
  moderationState: string;
  isHidden: boolean;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; createdAt: string };
  event: { id: string; title: string; slug: string };
  openReports: { reason: string; detail: string | null }[];
}
