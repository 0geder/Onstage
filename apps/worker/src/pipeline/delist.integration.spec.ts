import { prisma } from '../prisma';
import type { NormalisedEvent } from '../sources/types';
import { DELIST_GRACE_MS, delistVanished, type DelistScope } from './delist';
import { whyNotDelist } from './run';
import { upsertEvent } from './upsert';

/**
 * Integration test for retiring listings a source stopped returning, run
 * against a real PostGIS database (`npm run infra:up && npm run db:migrate`).
 *
 * That database holds real ingested events, and retiring is a bulk update, so
 * every pass here is fenced to a source nothing local ingests (webtickets has
 * no adapter) and to a window an hour either side of the test show.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date();
const START = new Date(NOW.getTime() + 30 * DAY);

function event(overrides: Partial<NormalisedEvent> = {}): NormalisedEvent {
  return {
    sourceId: 'delist-1',
    source: 'webtickets',
    title: 'Delist Test Show',
    startsAt: START,
    status: 'on_sale',
    venue: {
      name: 'Delist Test Venue',
      city: 'Cape Town',
      country: 'ZA',
      lat: -33.9311,
      lng: 18.4562,
    },
    primaryArtist: { name: 'Delist Test Artist' },
    lineup: [{ artist: { name: 'Delist Test Artist' }, billingPosition: 0, role: 'headliner' }],
    ticketOptions: [],
    ...overrides,
  };
}

function scope(overrides: Partial<DelistScope> = {}): DelistScope {
  return {
    source: 'webtickets',
    from: new Date(START.getTime() - HOUR),
    to: new Date(START.getTime() + HOUR),
    sweptAt: NOW,
    ...overrides,
  };
}

/** Pretends the source last returned the event `days` ago. */
async function lastSeen(eventId: string, days: number): Promise<void> {
  await prisma.event.update({
    where: { id: eventId },
    data: { lastSyncedAt: new Date(NOW.getTime() - days * DAY) },
  });
}

async function delistedAt(id: string): Promise<Date | null> {
  const row = await prisma.event.findUniqueOrThrow({ where: { id }, select: { delistedAt: true } });
  return row.delistedAt;
}

async function cleanup(): Promise<void> {
  await prisma.event.deleteMany({ where: { title: { contains: 'Delist Test' } } });
  await prisma.artist.deleteMany({ where: { name: { contains: 'Delist Test' } } });
  await prisma.venue.deleteMany({ where: { name: { contains: 'Delist Test' } } });
}

describe('retiring vanished listings', () => {
  let id: string;

  beforeAll(async () => {
    await cleanup();
    id = (await upsertEvent(event())).eventId as string;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('leaves an event the source returned within the grace period', async () => {
    await lastSeen(id, 2);
    await delistVanished(scope());
    expect(await delistedAt(id)).toBeNull();
  });

  it('leaves an event the sweep returned even if writing it failed', async () => {
    await lastSeen(id, 10);
    await delistVanished(scope({ seenSourceIds: ['delist-1'] }));
    expect(await delistedAt(id)).toBeNull();
  });

  it('leaves events outside the swept window, and other sources', async () => {
    await delistVanished(scope({ to: new Date(START.getTime() - 1000) }));
    await delistVanished(scope({ source: 'howler' }));
    expect(await delistedAt(id)).toBeNull();
  });

  it('leaves locked events alone', async () => {
    await prisma.event.update({ where: { id }, data: { isLocked: true } });
    await delistVanished(scope());
    expect(await delistedAt(id)).toBeNull();
    await prisma.event.update({ where: { id }, data: { isLocked: false } });
  });

  it('retires an event missing for longer than the grace period, without cancelling it', async () => {
    expect(DELIST_GRACE_MS).toBe(3 * DAY);
    expect(await delistVanished(scope())).toBe(1);
    const row = await prisma.event.findUniqueOrThrow({ where: { id } });
    expect(row.delistedAt).not.toBeNull();
    expect(row.status).toBe('on_sale');
  });

  it('restores the event as soon as the source returns it again', async () => {
    const outcome = await upsertEvent(event());
    expect(outcome).toMatchObject({ action: 'updated', eventId: id });
    expect(await delistedAt(id)).toBeNull();
  });

  it('keeps a show listed while another source still sells it', async () => {
    // Webtickets owns the row; Bandsintown ranks below it and only enriches it.
    await lastSeen(id, 10);
    const outcome = await upsertEvent(
      event({ source: 'bandsintown', sourceId: 'bit-delist-1', title: 'Delist Test Artist Live' }),
    );
    expect(outcome).toMatchObject({ action: 'deduped', eventId: id });
    await delistVanished(scope());
    expect(await delistedAt(id)).toBeNull();
  });
});

describe('when a pass may retire listings', () => {
  const swept = { sweepsWholeCatalogue: true };
  const clean = { fetched: 120 };

  it('allows a clean, complete sweep', () => {
    expect(whyNotDelist(swept, clean)).toBeNull();
  });

  it('refuses an incomplete sweep', () => {
    expect(whyNotDelist(swept, { ...clean, incomplete: 'page 3 failed' })).toMatch(/incomplete/);
  });

  it('refuses a failed run', () => {
    expect(whyNotDelist(swept, { ...clean, error: 'boom' })).toMatch(/failed/);
  });

  it('refuses an empty pass', () => {
    expect(whyNotDelist(swept, { fetched: 0 })).toMatch(/nothing/);
  });

  it('refuses a sampled source', () => {
    expect(whyNotDelist({ sweepsWholeCatalogue: false }, clean)).toMatch(/sampled/);
  });
});
