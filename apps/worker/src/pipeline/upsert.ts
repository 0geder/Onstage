import { isManualSource, normaliseName, slugify } from '@onstage/shared';
import type { Prisma } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../prisma';
import type { NormalisedArtist, NormalisedEvent, NormalisedVenue } from '../sources/types';
import { findDuplicate, shouldOverwrite } from './dedupe';

/**
 * Writing an ingested event into the database.
 *
 * Two invariants hold here and are the reason this is not a plain upsert:
 *
 *  1. Idempotency. Every write keys on (source, sourceId), so running the same
 *     pass twice changes nothing. Re-running ingestion has to be boring.
 *  2. Curated data is untouchable. A locked event — anything a curator or a
 *     verified artist created — is never overwritten by a feed. Local coverage
 *     is built by hand and cannot be undone by a provider's bad record.
 */

export interface UpsertOutcome {
  action: 'created' | 'updated' | 'skipped' | 'deduped';
  eventId?: string;
  reason?: string;
}

export async function upsertEvent(incoming: NormalisedEvent): Promise<UpsertOutcome> {
  const existing = await prisma.event.findFirst({
    where: { source: incoming.source, sourceId: incoming.sourceId },
    select: { id: true, isLocked: true },
  });

  if (existing) {
    if (existing.isLocked) {
      return { action: 'skipped', eventId: existing.id, reason: 'locked by a curator' };
    }
    await updateEvent(existing.id, incoming);
    return { action: 'updated', eventId: existing.id };
  }

  // Not seen from this source before — but another source may already have it.
  const duplicate = await findDuplicate(incoming);
  if (duplicate) {
    if (duplicate.isLocked || !shouldOverwrite(duplicate.existingSource, incoming.source)) {
      logger.debug(
        { eventId: duplicate.eventId, reason: duplicate.reason },
        'Duplicate ignored; existing record takes precedence',
      );
      // Still worth enriching: another source may carry ticket options this one lacks.
      await mergeTicketOptions(duplicate.eventId, incoming);
      return { action: 'deduped', eventId: duplicate.eventId, reason: duplicate.reason };
    }

    logger.info(
      { eventId: duplicate.eventId, from: duplicate.existingSource, to: incoming.source },
      'Duplicate superseded by a higher-precedence source',
    );
    await updateEvent(duplicate.eventId, incoming);
    return { action: 'deduped', eventId: duplicate.eventId, reason: duplicate.reason };
  }

  const eventId = await createEvent(incoming);
  return { action: 'created', eventId };
}

async function createEvent(incoming: NormalisedEvent): Promise<string> {
  const venueId = await resolveVenue(incoming.venue);
  const primaryArtistId = await resolveArtist(incoming.primaryArtist);

  const lineup: Prisma.EventLineupCreateWithoutEventInput[] = [];
  for (const entry of incoming.lineup) {
    const artistId = await resolveArtist(entry.artist);
    // A provider sometimes lists the headliner twice; the unique index would
    // reject that, so collapse it here.
    if (lineup.some((existing) => existing.artist.connect?.id === artistId)) continue;
    lineup.push({
      artist: { connect: { id: artistId } },
      billingPosition: entry.billingPosition,
      role: entry.role,
    });
  }

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { timezone: true, city: true },
  });

  const event = await prisma.event.create({
    data: {
      title: incoming.title,
      slug: await uniqueEventSlug(incoming, venue.city),
      primaryArtistId,
      venueId,
      startsAt: incoming.startsAt,
      doorsOpenAt: incoming.doorsOpenAt ?? null,
      onSaleAt: incoming.onSaleAt ?? null,
      localTimezone: incoming.venue.timezone ?? venue.timezone,
      status: incoming.status,
      ageRestriction: incoming.ageRestriction ?? null,
      description: incoming.description ?? null,
      posterImage: incoming.posterImage ?? null,
      source: incoming.source,
      sourceId: incoming.sourceId,
      sourceUrl: incoming.sourceUrl ?? null,
      lastSyncedAt: new Date(),
      isLocked: false,
      lineup: { create: lineup },
    },
    select: { id: true },
  });

  await mergeTicketOptions(event.id, incoming);
  return event.id;
}

async function updateEvent(eventId: string, incoming: NormalisedEvent): Promise<void> {
  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: incoming.title,
      startsAt: incoming.startsAt,
      doorsOpenAt: incoming.doorsOpenAt ?? null,
      onSaleAt: incoming.onSaleAt ?? undefined,
      status: incoming.status,
      description: incoming.description ?? undefined,
      posterImage: incoming.posterImage ?? undefined,
      sourceUrl: incoming.sourceUrl ?? undefined,
      lastSyncedAt: new Date(),
    },
  });

  await mergeTicketOptions(eventId, incoming);
}

/**
 * Ticket options are merged, never replaced.
 *
 * Different providers sell different tiers for the same show, so replacing would
 * delete a competitor's listing on every run. A price change also writes a
 * snapshot, which is what makes price-drop alerts possible.
 */
async function mergeTicketOptions(eventId: string, incoming: NormalisedEvent): Promise<void> {
  for (const option of incoming.ticketOptions) {
    const existing = await prisma.ticketOption.findFirst({
      where: { eventId, provider: option.provider, tierName: option.tierName },
    });

    if (!existing) {
      const created = await prisma.ticketOption.create({
        data: {
          eventId,
          provider: option.provider,
          tierName: option.tierName,
          priceMinor: option.priceMinor ?? null,
          currency: option.currency,
          availability: option.availability,
          purchaseUrl: option.purchaseUrl,
          lastCheckedAt: new Date(),
        },
      });
      if (option.priceMinor !== undefined) {
        await prisma.ticketPriceSnapshot.create({
          data: {
            ticketOptionId: created.id,
            priceMinor: option.priceMinor,
            currency: option.currency,
          },
        });
      }
      continue;
    }

    const priceChanged =
      option.priceMinor !== undefined && option.priceMinor !== existing.priceMinor;

    await prisma.ticketOption.update({
      where: { id: existing.id },
      data: {
        priceMinor: option.priceMinor ?? existing.priceMinor,
        currency: option.currency,
        availability: option.availability,
        purchaseUrl: option.purchaseUrl,
        lastCheckedAt: new Date(),
      },
    });

    if (priceChanged && option.priceMinor !== undefined) {
      await prisma.ticketPriceSnapshot.create({
        data: {
          ticketOptionId: existing.id,
          priceMinor: option.priceMinor,
          currency: option.currency,
        },
      });
    }
  }
}

/**
 * Venues are matched by Google Place id, then by proximity, and only created as
 * a last resort. Creating a near-duplicate venue would quietly break the dedupe
 * rule for every future event at that address.
 */
async function resolveVenue(incoming: NormalisedVenue): Promise<string> {
  if (incoming.googlePlaceId) {
    const byPlace = await prisma.venue.findUnique({
      where: { googlePlaceId: incoming.googlePlaceId },
      select: { id: true },
    });
    if (byPlace) return byPlace.id;
  }

  const [nearby] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM venues
    WHERE ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(${incoming.lng}, ${incoming.lat}), 4326)::geography,
            150
          )
    ORDER BY ST_Distance(
      geog,
      ST_SetSRID(ST_MakePoint(${incoming.lng}, ${incoming.lat}), 4326)::geography
    ) ASC
    LIMIT 1
  `;
  if (nearby) return nearby.id;

  const venue = await prisma.venue.create({
    data: {
      name: incoming.name,
      slug: await uniqueSlug('venue', slugify(`${incoming.name}-${incoming.city}`)),
      addressLine: incoming.addressLine ?? null,
      city: incoming.city,
      country: incoming.country.slice(0, 2).toUpperCase(),
      lat: incoming.lat,
      lng: incoming.lng,
      capacity: incoming.capacity ?? null,
      googlePlaceId: incoming.googlePlaceId ?? null,
      timezone: incoming.timezone ?? 'Africa/Johannesburg',
    },
    select: { id: true },
  });
  return venue.id;
}

/**
 * Artists are matched on the normalised name and on aliases, so an act arriving
 * under a variant spelling attaches to the existing profile instead of
 * fragmenting into a second one.
 */
async function resolveArtist(incoming: NormalisedArtist): Promise<string> {
  const key = normaliseName(incoming.name);

  const alias = await prisma.artistAlias.findFirst({
    where: { normalisedAlias: key },
    select: { artistId: true },
  });
  if (alias) return alias.artistId;

  const bySlug = await prisma.artist.findUnique({
    where: { slug: slugify(incoming.name) },
    select: { id: true },
  });
  if (bySlug) return bySlug.id;

  const created = await prisma.artist.create({
    data: {
      name: incoming.name,
      slug: await uniqueSlug('artist', slugify(incoming.name)),
      genres: incoming.genres ?? [],
      profileImage: incoming.imageUrl ?? null,
      externalIds:
        incoming.externalId && incoming.externalIdKey
          ? ({ [incoming.externalIdKey]: incoming.externalId } as Prisma.InputJsonValue)
          : ({} as Prisma.InputJsonValue),
      aliases: { create: [{ alias: incoming.name, normalisedAlias: key }] },
    },
    select: { id: true },
  });
  return created.id;
}

async function uniqueEventSlug(incoming: NormalisedEvent, city: string): Promise<string> {
  const base = slugify(`${incoming.title}-${city}-${incoming.startsAt.toISOString().slice(0, 10)}`);
  return uniqueSlug('event', base);
}

async function uniqueSlug(model: 'artist' | 'venue' | 'event', base: string): Promise<string> {
  const seed = base || 'entry';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? seed : `${seed}-${attempt + 1}`;
    const taken =
      model === 'artist'
        ? await prisma.artist.findUnique({ where: { slug }, select: { id: true } })
        : model === 'venue'
          ? await prisma.venue.findUnique({ where: { slug }, select: { id: true } })
          : await prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

export { isManualSource };
