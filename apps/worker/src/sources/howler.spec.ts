import type { ArtistIndex } from './acts';
import { cityFromAddress, translateHowlerEvent, type HowlerEventPayload } from './howler';
import type { FetchWindow } from './types';

const NOW = new Date('2026-11-06T10:00:00+02:00');
const window: FetchWindow = {
  tier: 'cold',
  from: new Date('2026-11-05T00:00:00Z'),
  to: new Date('2027-11-05T00:00:00Z'),
  markets: ['ZA'],
};
const artists: ArtistIndex = new Map([['bokani dyer', 'Bokani Dyer']]);

/** Shaped like Howler Webhooks v1's Event payload. */
function payload(overrides: Partial<HowlerEventPayload> = {}): HowlerEventPayload {
  return {
    event_id: 4821,
    event_name: 'Bokani Dyer Trio Live at The Orbit',
    event_header_image_url: 'https://cdn.howler.co.za/poster.jpg',
    event_url: 'https://www.howler.co.za/events/bokani-dyer-orbit',
    event_status: 'active',
    event_country: 'South Africa',
    event_details: '<p>An evening of jazz &amp; improvisation.</p>',
    event_sold_out: false,
    event_venue: {
      name: 'The Orbit',
      address: '81 De Korte St, Braamfontein, Johannesburg, 2001',
      latitude: '-26.1929',
      longitude: '28.0360',
    },
    event_start_time: '2026-11-20T20:00:00+02:00',
    event_end_time: '2026-11-20T23:30:00+02:00',
    event_currency: 'ZAR',
    event_ticket_types: [
      {
        ticket_type_name: 'General',
        ticket_type_quantity: 200,
        ticket_type_remaining: 120,
        ticket_type_cost_cents: 25000,
        ticket_type_cost_currency: 'ZAR',
      },
      {
        ticket_type_name: 'Front row',
        ticket_type_quantity: 40,
        ticket_type_remaining: 3,
        ticket_type_cost_cents: 45000,
        ticket_type_cost_currency: 'ZAR',
      },
    ],
    ...overrides,
  };
}

describe('translateHowlerEvent', () => {
  it('turns a webhook payload into an event', () => {
    const event = translateHowlerEvent(payload(), window, artists, NOW);
    expect(event).toMatchObject({
      source: 'howler',
      sourceId: '4821',
      title: 'Bokani Dyer Trio Live at The Orbit',
      startsAt: new Date('2026-11-20T18:00:00Z'),
      description: 'An evening of jazz & improvisation.',
      posterImage: 'https://cdn.howler.co.za/poster.jpg',
      sourceUrl: 'https://www.howler.co.za/events/bokani-dyer-orbit',
      primaryArtist: { name: 'Bokani Dyer' },
      venue: { name: 'The Orbit', city: 'Johannesburg', country: 'ZA', lat: -26.1929 },
    });
  });

  it('keeps cents as cents and reports what is left per tier', () => {
    const event = translateHowlerEvent(payload(), window, artists, NOW);
    expect(event?.ticketOptions).toEqual([
      expect.objectContaining({
        tierName: 'General',
        priceMinor: 25000,
        availability: 'available',
      }),
      expect.objectContaining({ tierName: 'Front row', priceMinor: 45000, availability: 'low' }),
    ]);
    expect(event?.ticketOptions.every((t) => t.provider === 'howler')).toBe(true);
    expect(event?.status).toBe('low_stock');
  });

  it('marks sold-out and cancelled events', () => {
    const soldOut = payload({
      event_ticket_types: [{ ticket_type_name: 'General', ticket_type_remaining: 0 }],
    });
    expect(translateHowlerEvent(soldOut, window, artists, NOW)?.status).toBe('sold_out');
    expect(
      translateHowlerEvent(payload({ event_status: 'cancelled' }), window, artists, NOW)?.status,
    ).toBe('cancelled');
  });

  it('announces events whose tickets are not on sale yet', () => {
    const event = translateHowlerEvent(
      payload({
        event_ticket_types: [
          {
            ticket_type_name: 'Early bird',
            ticket_type_onsale_start_time: '2026-11-10T09:00:00+02:00',
          },
        ],
      }),
      window,
      artists,
      NOW,
    );
    expect(event?.status).toBe('announced');
    expect(event?.onSaleAt).toEqual(new Date('2026-11-10T07:00:00Z'));
  });

  it('drops tiers whose sales have closed', () => {
    const event = translateHowlerEvent(
      payload({
        event_ticket_types: [
          {
            ticket_type_name: 'Early bird',
            ticket_type_onsale_end_time: '2026-11-01T00:00:00+02:00',
          },
          { ticket_type_name: 'General', ticket_type_cost_cents: 30000 },
        ],
      }),
      window,
      artists,
      NOW,
    );
    expect(event?.ticketOptions.map((t) => t.tierName)).toEqual(['General']);
  });

  it('reads offset-less times as SAST', () => {
    const event = translateHowlerEvent(
      payload({ event_start_time: '2026-11-20T20:00:00', event_end_time: null }),
      window,
      artists,
      NOW,
    );
    expect(event?.startsAt).toEqual(new Date('2026-11-20T18:00:00Z'));
  });

  it.each([
    ['unpublished', { event_status: 'pending' as const }],
    ['abroad', { event_country: 'Kenya' }],
    ['without coordinates', { event_venue: { name: 'The Orbit', latitude: '', longitude: '' } }],
    ['without a recognisable act', { event_name: 'Sunday Market Day' }],
    ['outside the window', { event_start_time: '2028-01-01T20:00:00+02:00' }],
    [
      'a season pass',
      {
        event_end_time: '2026-12-31T23:00:00+02:00',
        event_start_time: '2026-11-20T20:00:00+02:00',
      },
    ],
  ])('skips events %s', (_label, overrides) => {
    expect(translateHowlerEvent(payload(overrides), window, artists, NOW)).toBeNull();
  });
});

describe('cityFromAddress', () => {
  it('takes the last part that is not a postal code or the country', () => {
    expect(cityFromAddress('12 Long St, Cape Town, 8001, South Africa')).toBe('Cape Town');
    expect(cityFromAddress('Somewhere')).toBeNull();
    expect(cityFromAddress(undefined)).toBeNull();
  });
});
