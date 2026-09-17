import { prisma } from '../prisma';
import { upsertEvent } from './upsert';
import type { NormalisedEvent } from '../sources/types';

/**
 * Integration test for the dedupe rule, run against a real PostGIS database.
 *
 * The rule under test is the one the spec calls mandatory: the same show
 * arriving from three sources must collapse into one event, matched on
 * normalised artist name + venue within 500 m + start time within 24 hours.
 *
 * Requires a running database (`npm run infra:up && npm run db:migrate`).
 */

const START = new Date('2027-03-14T19:00:00.000Z');

function event(overrides: Partial<NormalisedEvent> = {}): NormalisedEvent {
  return {
    sourceId: 'base-1',
    source: 'ticketmaster',
    title: 'Dedupe Test Show',
    startsAt: START,
    status: 'on_sale',
    venue: {
      name: 'Dedupe Test Venue',
      city: 'Cape Town',
      country: 'ZA',
      lat: -33.9249,
      lng: 18.4241,
    },
    primaryArtist: { name: 'Dedupe Test Artist' },
    lineup: [
      { artist: { name: 'Dedupe Test Artist' }, billingPosition: 0, role: 'headliner' },
    ],
    ticketOptions: [],
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  await prisma.event.deleteMany({ where: { title: { contains: 'Dedupe Test' } } });
  await prisma.artist.deleteMany({ where: { name: { contains: 'Dedupe Test' } } });
  await prisma.venue.deleteMany({ where: { name: { contains: 'Dedupe Test' } } });
}

describe('ingestion dedupe', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates the event on first sight', async () => {
    const outcome = await upsertEvent(event());
    expect(outcome.action).toBe('created');
  });

  it('is idempotent: the same source record updates rather than duplicating', async () => {
    const outcome = await upsertEvent(event({ status: 'low_stock' }));
    expect(outcome.action).toBe('updated');
    expect(await prisma.event.count({ where: { title: { contains: 'Dedupe Test' } } })).toBe(1);
  });

  it('collapses the same show arriving from another source', async () => {
    const outcome = await upsertEvent(
      event({
        source: 'bandsintown',
        sourceId: 'bit-1',
        // Different title, venue ~120 m away, starting 3 hours later — exactly
        // the kind of divergence real providers produce for one show.
        title: 'Dedupe Test Artist Live In Concert',
        startsAt: new Date(START.getTime() + 3 * 3_600_000),
        venue: {
          name: 'Dedupe Test Venue (Main Room)',
          city: 'Cape Town',
          country: 'ZA',
          lat: -33.9259,
          lng: 18.4245,
        },
      }),
    );

    expect(outcome.action).toBe('deduped');
    expect(await prisma.event.count({ where: { title: { contains: 'Dedupe Test' } } })).toBe(1);
  });

  it('matches through an artist alias rather than an exact name', async () => {
    const artist = await prisma.artist.findFirstOrThrow({
      where: { name: 'Dedupe Test Artist' },
    });
    await prisma.artistAlias.create({
      data: { artistId: artist.id, alias: 'DTA', normalisedAlias: 'dta' },
    });

    const outcome = await upsertEvent(
      event({
        source: 'songkick',
        sourceId: 'sk-1',
        primaryArtist: { name: 'DTA' },
        lineup: [{ artist: { name: 'DTA' }, billingPosition: 0, role: 'headliner' }],
      }),
    );

    expect(outcome.action).toBe('deduped');
    expect(await prisma.event.count({ where: { title: { contains: 'Dedupe Test' } } })).toBe(1);
  });

  it('treats a genuinely different date as a different show', async () => {
    const outcome = await upsertEvent(
      event({
        source: 'bandsintown',
        sourceId: 'bit-2',
        title: 'Dedupe Test Second Night',
        // Three days later: same artist, same venue, a different show.
        startsAt: new Date(START.getTime() + 3 * 86_400_000),
      }),
    );

    expect(outcome.action).toBe('created');
    expect(await prisma.event.count({ where: { title: { contains: 'Dedupe Test' } } })).toBe(2);
  });

  it('never overwrites a curated event', async () => {
    const curated = await prisma.event.findFirstOrThrow({
      where: { title: 'Dedupe Test Second Night' },
    });
    await prisma.event.update({
      where: { id: curated.id },
      data: { isLocked: true, source: 'manual', sourceId: 'curated-1' },
    });

    const outcome = await upsertEvent(
      event({
        source: 'manual',
        sourceId: 'curated-1',
        title: 'Overwritten By A Feed',
        startsAt: new Date(START.getTime() + 3 * 86_400_000),
      }),
    );

    expect(outcome.action).toBe('skipped');
    const after = await prisma.event.findUniqueOrThrow({ where: { id: curated.id } });
    expect(after.title).toBe('Dedupe Test Second Night');
  });
});
