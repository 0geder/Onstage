'use server';

import { revalidatePath } from 'next/cache';
import { adminRequest } from '../lib/api';
import { requireOperator } from '../lib/session';

/**
 * Server actions.
 *
 * All admin mutations go through here so the token stays server-side. Each one
 * returns a plain result object rather than throwing, because these are called
 * from forms and a thrown error in a form action gives the curator a blank
 * screen instead of a message they can act on.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

function toResult(error: unknown): ActionResult {
  return { ok: false, message: (error as Error).message };
}

// Server actions are public POST endpoints: anything reaching an API path is
// checked here, never trusted because "the UI only sends valid values".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_STATUSES = ['announced', 'on_sale', 'low_stock', 'sold_out', 'postponed', 'cancelled'];

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Invalid ${what}.`);
  return encodeURIComponent(value);
}

/** Empty string from a form field means "not provided", not "empty value". */
function text(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function number(form: FormData, key: string): number | undefined {
  const value = text(form, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A tri-state select: yes / no / unknown. Unknown must stay null, never false. */
function triState(form: FormData, key: string): boolean | undefined {
  const value = text(form, key);
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

export async function createVenue(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireOperator();
    const lat = number(form, 'lat');
    const lng = number(form, 'lng');
    if (lat === undefined || lng === undefined) {
      return { ok: false, message: 'Latitude and longitude are required — they drive "near me" search and deduplication.' };
    }

    await adminRequest('/admin/venues', {
      method: 'POST',
      body: {
        name: text(form, 'name'),
        addressLine: text(form, 'addressLine'),
        city: text(form, 'city'),
        country: (text(form, 'country') ?? 'ZA').toUpperCase(),
        lat,
        lng,
        capacity: number(form, 'capacity'),
        timezone: text(form, 'timezone') ?? 'Africa/Johannesburg',
        wheelchairAccess: triState(form, 'wheelchairAccess'),
        cloakroom: triState(form, 'cloakroom'),
        ageRestriction: text(form, 'ageRestriction'),
        reentryPolicy: text(form, 'reentryPolicy'),
      },
    });

    revalidatePath('/venues');
    return { ok: true, message: 'Venue created.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function createArtist(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireOperator();
    const aliases = text(form, 'aliases')
      ?.split(',')
      .map((alias) => alias.trim())
      .filter(Boolean);

    await adminRequest('/admin/artists', {
      method: 'POST',
      body: {
        name: text(form, 'name'),
        // Aliases feed both search and ingestion matching, so an act known by
        // two names does not end up as two profiles.
        aliases,
        genres: text(form, 'genres')
          ?.split(',')
          .map((genre) => genre.trim().toLowerCase())
          .filter(Boolean),
        homeCity: text(form, 'homeCity'),
        country: (text(form, 'country') ?? 'ZA').toUpperCase(),
        bio: text(form, 'bio'),
      },
    });

    revalidatePath('/events/new');
    return { ok: true, message: 'Artist created.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function createEvent(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireOperator();
    const startsAt = text(form, 'startsAt');
    if (!startsAt) return { ok: false, message: 'A start time is required.' };

    const supportIds = form
      .getAll('supportArtistIds')
      .map((value) => String(value).trim())
      .filter(Boolean);

    const primaryArtistId = text(form, 'primaryArtistId');
    if (!primaryArtistId) return { ok: false, message: 'Choose a headline artist.' };

    await adminRequest('/admin/events', {
      method: 'POST',
      body: {
        title: text(form, 'title'),
        primaryArtistId,
        venueId: text(form, 'venueId'),
        // The form collects local time; the API stores UTC.
        startsAt: new Date(startsAt).toISOString(),
        doorsOpenAt: text(form, 'doorsOpenAt')
          ? new Date(text(form, 'doorsOpenAt') as string).toISOString()
          : undefined,
        onSaleAt: text(form, 'onSaleAt')
          ? new Date(text(form, 'onSaleAt') as string).toISOString()
          : undefined,
        status: text(form, 'status') ?? 'announced',
        ageRestriction: text(form, 'ageRestriction'),
        description: text(form, 'description'),
        posterImage: text(form, 'posterImage'),
        source: 'manual',
        // Locked by default: an ingestion run must never overwrite curated work.
        isLocked: true,
        lineup: [
          { artistId: primaryArtistId, billingPosition: 0, role: 'headliner' },
          ...supportIds.map((artistId, index) => ({
            artistId,
            billingPosition: index + 1,
            role: index === 0 ? 'support' : 'opener',
          })),
        ],
      },
    });

    revalidatePath('/events');
    revalidatePath('/');
    return { ok: true, message: 'Event created and locked against ingestion.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function setEventStatus(eventId: string, status: string): Promise<ActionResult> {
  try {
    await requireOperator();
    if (!EVENT_STATUSES.includes(status)) throw new Error('Invalid status.');
    await adminRequest(`/admin/events/${id(eventId, 'event')}`, { method: 'PATCH', body: { status } });
    revalidatePath('/events');
    return { ok: true, message: 'Status updated.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function moderateComment(
  commentId: string,
  action: 'hide' | 'restore',
): Promise<ActionResult> {
  try {
    await requireOperator();
    if (action !== 'hide' && action !== 'restore') throw new Error('Invalid action.');
    await adminRequest(`/admin/moderation/comments/${id(commentId, 'comment')}`, {
      method: 'POST',
      body: { action },
    });
    revalidatePath('/moderation');
    return { ok: true, message: action === 'hide' ? 'Comment hidden.' : 'Comment restored.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function banUser(userId: string, reason: string): Promise<ActionResult> {
  try {
    await requireOperator();
    const trimmed = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (!trimmed) throw new Error('Give a reason for the ban.');
    await adminRequest(`/admin/moderation/users/${id(userId, 'user')}/ban`, {
      method: 'POST',
      body: { reason: trimmed },
    });
    revalidatePath('/moderation');
    return { ok: true, message: 'Account banned and its posts hidden.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function reviewArtistClaim(
  claimId: string,
  decision: 'approve' | 'reject',
): Promise<ActionResult> {
  try {
    await requireOperator();
    if (decision !== 'approve' && decision !== 'reject') throw new Error('Invalid decision.');
    await adminRequest(`/admin/artist-claims/${id(claimId, 'claim')}/${decision}`, {
      method: 'POST',
    });
    revalidatePath('/claims');
    return {
      ok: true,
      message:
        decision === 'approve'
          ? 'Claim approved. The profile is now verified and the claimant can edit it.'
          : 'Claim rejected. The claimant has been told and can resubmit.',
    };
  } catch (error) {
    return toResult(error);
  }
}
