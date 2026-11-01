import { prisma } from '../prisma';
import { upsertEvent } from '../pipeline/upsert';
import type { NormalisedEvent, NormalisedTicketOption } from '../sources/types';
import { queueTicketsBackAlerts } from './reminders';

/**
 * Integration test for "tickets are back", run against a real database.
 *
 * A tier that ingestion sees go from sold out to on sale must alert everyone
 * who saved the show, exactly once, and respect the per-user opt-out.
 *
 * Requires a running database (`npm run infra:up && npm run db:migrate`).
 */

const START = new Date(Date.now() + 30 * 86_400_000);

function tier(availability: NormalisedTicketOption['availability']): NormalisedTicketOption {
  return {
    provider: 'quicket',
    tierName: 'General',
    priceMinor: 25_000,
    currency: 'ZAR',
    availability,
    purchaseUrl: 'https://www.quicket.co.za/events/restock-test',
  };
}

function event(availability: NormalisedTicketOption['availability']): NormalisedEvent {
  return {
    sourceId: 'restock-1',
    source: 'quicket',
    title: 'Restock Test Show',
    startsAt: START,
    status: availability === 'sold_out' ? 'sold_out' : 'on_sale',
    venue: { name: 'Restock Test Venue', city: 'Durban', country: 'ZA', lat: -29.8587, lng: 31.0218 },
    primaryArtist: { name: 'Restock Test Artist' },
    lineup: [{ artist: { name: 'Restock Test Artist' }, billingPosition: 0, role: 'headliner' }],
    ticketOptions: [tier(availability)],
  };
}

async function cleanup(): Promise<void> {
  await prisma.user.deleteMany({ where: { handle: { startsWith: 'restock_test' } } });
  await prisma.event.deleteMany({ where: { title: { contains: 'Restock Test' } } });
  await prisma.artist.deleteMany({ where: { name: { contains: 'Restock Test' } } });
  await prisma.venue.deleteMany({ where: { name: { contains: 'Restock Test' } } });
}

describe('tickets-back alerts', () => {
  let eventId: string;
  let fanId: string;
  let optedOutId: string;

  beforeAll(async () => {
    await cleanup();
    const created = await upsertEvent(event('sold_out'));
    eventId = created.eventId!;

    const fan = await prisma.user.create({
      data: { handle: 'restock_test_fan', displayName: 'Fan', email: 'restock_test_fan@example.test' },
    });
    const optedOut = await prisma.user.create({
      data: {
        handle: 'restock_test_optout',
        displayName: 'Opted out',
        email: 'restock_test_optout@example.test',
        notificationPrefs: { ticketsBack: false },
      },
    });
    fanId = fan.id;
    optedOutId = optedOut.id;
    await prisma.attendance.createMany({
      data: [
        { userId: fanId, eventId, state: 'interested' },
        { userId: optedOutId, eventId, state: 'going' },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const alertsFor = (userId: string) =>
    prisma.notificationOutbox.count({ where: { userId, kind: 'tickets_back' } });

  it('sends nothing while the tier is still sold out', async () => {
    await upsertEvent(event('sold_out'));
    await queueTicketsBackAlerts();
    expect(await alertsFor(fanId)).toBe(0);
  });

  it('alerts a saved fan once the tier comes back, and only once', async () => {
    await upsertEvent(event('low'));
    const option = await prisma.ticketOption.findFirstOrThrow({ where: { eventId } });
    expect(option.restockedAt).not.toBeNull();

    await queueTicketsBackAlerts();
    await queueTicketsBackAlerts();
    expect(await alertsFor(fanId)).toBe(1);
  });

  it('respects the opt-out', async () => {
    expect(await alertsFor(optedOutId)).toBe(0);
  });

  it('does not mark a restock when a tier stays on sale', async () => {
    const before = await prisma.ticketOption.findFirstOrThrow({ where: { eventId } });
    await upsertEvent(event('available'));
    const after = await prisma.ticketOption.findFirstOrThrow({ where: { eventId } });
    expect(after.restockedAt?.getTime()).toBe(before.restockedAt?.getTime());
  });
});
