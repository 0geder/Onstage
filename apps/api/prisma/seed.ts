/**
 * Onstage development seed.
 *
 * Seeds one city properly rather than being thin everywhere — Cape Town and
 * Johannesburg, with real venues, a mix of international headliners and local
 * acts, support slots that make the lineup discovery path work, and threads that
 * include the scam patterns moderation is supposed to catch.
 *
 * Every artist, venue and event here is fictional or public knowledge used
 * illustratively. Prices, availability and dates are invented.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import {
  AUTO_HIDE_THRESHOLD,
  DEFAULT_NOTIFICATION_PREFS,
  REVIEW_THRESHOLD,
  normaliseName,
  scoreComment,
  slugify,
} from '@onstage/shared';

const prisma = new PrismaClient();

const DAY = 86_400_000;
const now = Date.now();

/** Deterministic future date so the seed always produces upcoming events. */
function daysFromNow(days: number, hour = 20): Date {
  const date = new Date(now + days * DAY);
  date.setUTCHours(hour - 2, 0, 0, 0); // SAST is UTC+2 year round.
  return date;
}

interface ArtistSeed {
  name: string;
  aliases?: string[];
  verified?: boolean;
  bio: string;
  genres: string[];
  homeCity: string;
  country: string;
  streaming?: Record<string, string>;
  social?: Record<string, string>;
  promoted?: boolean;
}

const ARTISTS: ArtistSeed[] = [
  {
    name: 'Nomvula Dlamini',
    aliases: ['Nomvula', 'MaNomvula'],
    verified: true,
    bio: 'Amapiano vocalist and producer from Soweto. Built a following on log-drum-led sets before ever releasing a studio album.',
    genres: ['amapiano', 'house', 'afro-soul'],
    homeCity: 'Johannesburg',
    country: 'ZA',
    streaming: {
      spotify: 'https://open.spotify.com/artist/0000000000nomvula',
      apple_music: 'https://music.apple.com/za/artist/nomvula-dlamini/000000001',
      youtube: 'https://www.youtube.com/@nomvuladlamini',
      audiomack: 'https://audiomack.com/nomvuladlamini',
    },
    social: { instagram: 'https://instagram.com/nomvuladlamini', x: 'https://x.com/nomvuladlamini' },
    promoted: true,
  },
  {
    name: 'The Kalk Bay Collective',
    aliases: ['Kalk Bay Collective', 'KBC'],
    verified: true,
    bio: 'Seven-piece from the Cape peninsula folding Cape jazz into post-rock arrangements. Known for long, patient live sets.',
    genres: ['cape jazz', 'post-rock', 'instrumental'],
    homeCity: 'Cape Town',
    country: 'ZA',
    streaming: {
      spotify: 'https://open.spotify.com/artist/0000000000kalkbay',
      soundcloud: 'https://soundcloud.com/kalkbaycollective',
    },
    social: { instagram: 'https://instagram.com/kalkbaycollective' },
  },
  {
    name: 'Thabo Mokoena',
    aliases: ['DJ Thabo', 'Thabo M'],
    bio: 'Deep house DJ working the Pretoria and East Rand circuit. Residencies before releases, which is the older way round.',
    genres: ['deep house', 'afro house'],
    homeCity: 'Pretoria',
    country: 'ZA',
    streaming: { spotify: 'https://open.spotify.com/artist/0000000000thabom' },
    social: { instagram: 'https://instagram.com/djthabomokoena' },
  },
  {
    name: 'Siphokazi Ndlovu',
    aliases: ['Siphokazi'],
    bio: 'Maskandi guitarist and songwriter from Pietermaritzburg, writing in isiZulu and English.',
    genres: ['maskandi', 'folk', 'afro-soul'],
    homeCity: 'Pietermaritzburg',
    country: 'ZA',
    streaming: { youtube: 'https://www.youtube.com/@siphokazindlovu' },
    social: { tiktok: 'https://tiktok.com/@siphokazindlovu' },
  },
  {
    name: 'Riaan van Wyk',
    bio: 'Afrikaans singer-songwriter. Guitar, a loop pedal, and a room that goes quiet.',
    genres: ['folk', 'singer-songwriter', 'afrikaans'],
    homeCity: 'Stellenbosch',
    country: 'ZA',
    social: { facebook: 'https://facebook.com/riaanvanwykmusiek' },
  },
  {
    name: 'Lerato Sithole',
    aliases: ['Lee Sithole'],
    bio: 'Gqom producer from Durban. Sparse, fast, built for a room with a proper sound system.',
    genres: ['gqom', 'electronic'],
    homeCity: 'Durban',
    country: 'ZA',
    streaming: { audiomack: 'https://audiomack.com/leratosithole' },
  },
  {
    name: 'Midnight Ferry',
    verified: true,
    bio: 'London indie four-piece on their first Southern Hemisphere tour.',
    genres: ['indie rock', 'alternative'],
    homeCity: 'London',
    country: 'GB',
    streaming: { spotify: 'https://open.spotify.com/artist/0000000000midferry' },
    social: { instagram: 'https://instagram.com/midnightferryband' },
  },
  {
    name: 'Ayanda Khumalo',
    bio: 'Jazz trumpeter and bandleader, Cape Town via Gqeberha. Plays support more often than headline, which is how most people find her.',
    genres: ['jazz', 'cape jazz'],
    homeCity: 'Cape Town',
    country: 'ZA',
  },
  {
    name: 'Static Harbour',
    bio: 'Two-piece electronic act from Gqeberha. Modular synths and no laptop on stage.',
    genres: ['electronic', 'experimental'],
    homeCity: 'Gqeberha',
    country: 'ZA',
  },
  {
    name: 'Zanele Mthembu',
    bio: 'Afro-soul vocalist. Started in church choirs in KwaMashu, now filling mid-size rooms.',
    genres: ['afro-soul', 'rnb'],
    homeCity: 'Durban',
    country: 'ZA',
    streaming: { spotify: 'https://open.spotify.com/artist/0000000000zanele' },
  },
];

interface VenueSeed {
  name: string;
  addressLine: string;
  city: string;
  lat: number;
  lng: number;
  capacity: number;
  wheelchairAccess?: boolean;
  ageRestriction?: string;
  reentryPolicy?: string;
  cloakroom?: boolean;
}

const VENUES: VenueSeed[] = [
  {
    name: 'Kirstenbosch Botanical Garden',
    addressLine: 'Rhodes Drive, Newlands, Cape Town',
    city: 'Cape Town',
    lat: -33.9881,
    lng: 18.4327,
    capacity: 7000,
    wheelchairAccess: true,
    ageRestriction: 'All ages',
    reentryPolicy: 'No re-entry once you have left the concert lawn.',
    cloakroom: false,
  },
  {
    name: 'The Assembly',
    addressLine: '61 Harrington Street, Cape Town',
    city: 'Cape Town',
    lat: -33.9296,
    lng: 18.4213,
    capacity: 900,
    wheelchairAccess: false,
    ageRestriction: '18+',
    reentryPolicy: 'Re-entry allowed with a stamp until 01:00.',
    cloakroom: true,
  },
  {
    name: 'Cape Town City Hall',
    addressLine: 'Darling Street, Cape Town',
    city: 'Cape Town',
    lat: -33.9256,
    lng: 18.4245,
    capacity: 1500,
    wheelchairAccess: true,
    ageRestriction: 'All ages',
    cloakroom: true,
  },
  {
    name: 'Bassline Fest Grounds',
    addressLine: 'Newtown, Johannesburg',
    city: 'Johannesburg',
    lat: -26.2019,
    lng: 28.0325,
    capacity: 5000,
    wheelchairAccess: true,
    ageRestriction: '18+',
    reentryPolicy: 'No re-entry.',
    cloakroom: true,
  },
  {
    name: 'The Orbit',
    addressLine: '81 De Korte Street, Braamfontein, Johannesburg',
    city: 'Johannesburg',
    lat: -26.1929,
    lng: 28.0305,
    capacity: 250,
    wheelchairAccess: true,
    ageRestriction: 'Under 18s with an adult',
    cloakroom: false,
  },
  {
    name: 'Durban Amphitheatre',
    addressLine: 'Snell Parade, North Beach, Durban',
    city: 'Durban',
    lat: -29.8467,
    lng: 31.0407,
    capacity: 3000,
    wheelchairAccess: true,
    ageRestriction: 'All ages',
  },
];

async function main(): Promise<void> {
  console.log('Seeding Onstage...');

  await reset();
  const artists = await seedArtists();
  const venues = await seedVenues();
  const users = await seedUsers();
  const events = await seedEvents(artists, venues);
  await seedSocial(events, users);
  await seedRatings(artists, events, users);

  console.log(
    `Done: ${Object.keys(artists).length} artists, ${Object.keys(venues).length} venues, ` +
      `${events.length} events, ${users.length} users.`,
  );
}

/** Seeds are re-runnable: wipe the domain tables and rebuild from scratch. */
async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE artists, venues, users, events, comments, ratings, attendances,
             follows, user_follows, ticket_options, event_lineups, artist_aliases,
             ticket_clicks, ticket_price_snapshots, user_badges, user_consents,
             referral_codes, referrals, notification_outbox, push_tokens,
             ingestion_runs, comment_likes, comment_reports, artist_claims
    RESTART IDENTITY CASCADE
  `);
}

async function seedArtists(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};

  for (const seed of ARTISTS) {
    const artist = await prisma.artist.create({
      data: {
        name: seed.name,
        slug: slugify(seed.name),
        verified: seed.verified ?? false,
        bio: seed.bio,
        genres: seed.genres,
        homeCity: seed.homeCity,
        country: seed.country,
        profileImage: `https://picsum.photos/seed/${slugify(seed.name)}-avatar/400/400`,
        bannerImage: `https://picsum.photos/seed/${slugify(seed.name)}-banner/1200/480`,
        streamingLinks: (seed.streaming ?? {}) as Prisma.InputJsonValue,
        socialLinks: (seed.social ?? {}) as Prisma.InputJsonValue,
        externalIds: {} as Prisma.InputJsonValue,
        isPromoted: seed.promoted ?? false,
        promotedUntil: seed.promoted ? new Date(now + 30 * DAY) : null,
        aliases: {
          create: (seed.aliases ?? []).map((alias) => ({
            alias,
            normalisedAlias: normaliseName(alias),
          })),
        },
      },
    });
    ids[seed.name] = artist.id;
  }

  return ids;
}

async function seedVenues(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};

  for (const seed of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        name: seed.name,
        slug: slugify(`${seed.name}-${seed.city}`),
        addressLine: seed.addressLine,
        city: seed.city,
        country: 'ZA',
        lat: seed.lat,
        lng: seed.lng,
        capacity: seed.capacity,
        timezone: 'Africa/Johannesburg',
        image: `https://picsum.photos/seed/${slugify(seed.name)}-venue/1200/800`,
        wheelchairAccess: seed.wheelchairAccess ?? null,
        ageRestriction: seed.ageRestriction ?? null,
        reentryPolicy: seed.reentryPolicy ?? null,
        cloakroom: seed.cloakroom ?? null,
      },
    });
    ids[seed.name] = venue.id;
  }

  return ids;
}

interface SeededUser {
  id: string;
  handle: string;
}

async function seedUsers(): Promise<SeededUser[]> {
  const people = [
    { handle: 'thandi', displayName: 'Thandi M.', city: 'Cape Town', lat: -33.9249, lng: 18.4241 },
    { handle: 'sipho', displayName: 'Sipho K.', city: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
    { handle: 'aisha', displayName: 'Aisha P.', city: 'Cape Town', lat: -33.9149, lng: 18.4241 },
    { handle: 'johan', displayName: 'Johan B.', city: 'Stellenbosch', lat: -33.9321, lng: 18.8602 },
    { handle: 'lindiwe', displayName: 'Lindiwe N.', city: 'Durban', lat: -29.8587, lng: 31.0218 },
    // Deliberately fresh account: the scam heuristics key off account age, and
    // the moderation queue needs something real to show.
    { handle: 'quickseller99', displayName: 'Quick Seller', city: 'Johannesburg', lat: -26.2041, lng: 28.0473, brandNew: true },
    { handle: 'curator', displayName: 'Onstage Curator', city: 'Cape Town', lat: -33.9249, lng: 18.4241, admin: true },
  ];

  const users: SeededUser[] = [];

  for (const person of people) {
    const user = await prisma.user.create({
      data: {
        // Dev auth accepts "Bearer dev:<authUid>", so these are directly usable.
        authUid: person.handle,
        handle: person.handle,
        displayName: person.displayName,
        email: `${person.handle}@example.co.za`,
        avatar: `https://picsum.photos/seed/${person.handle}-avatar/200/200`,
        homeCity: person.city,
        homeLat: person.lat,
        homeLng: person.lng,
        locale: person.handle === 'johan' ? 'af' : person.handle === 'lindiwe' ? 'zu' : 'en',
        isAdmin: person.admin ?? false,
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS as unknown as Prisma.InputJsonValue,
        onboardedAt: person.brandNew ? null : new Date(now - 40 * DAY),
        // Account age gates ratings and drives the scam score.
        createdAt: person.brandNew ? new Date(now - 3_600_000) : new Date(now - 120 * DAY),
      },
    });
    users.push({ id: user.id, handle: user.handle });
  }

  return users;
}

interface SeededEvent {
  id: string;
  title: string;
  status: string;
}

interface TicketSeed {
  provider: 'quicket' | 'webtickets' | 'computicket' | 'ticketmaster' | 'howler' | 'other';
  tier: string;
  price: number;
  availability?: 'available' | 'low' | 'sold_out';
}

interface EventSeed {
  title: string;
  artist: string;
  venue: string;
  /** Negative for shows already past, which Past Shows and live ratings need. */
  inDays: number;
  status: 'announced' | 'on_sale' | 'low_stock' | 'sold_out' | 'postponed' | 'cancelled';
  onSaleDays: number;
  support: string[];
  tickets: TicketSeed[];
  promoted?: boolean;
}

async function seedEvents(
  artists: Record<string, string>,
  venues: Record<string, string>,
): Promise<SeededEvent[]> {
  const plan: EventSeed[] = [
    {
      title: 'Nomvula Dlamini — Homecoming',
      artist: 'Nomvula Dlamini',
      venue: 'Bassline Fest Grounds',
      inDays: 12,
      status: 'on_sale',
      promoted: true,
      onSaleDays: -20,
      support: ['Thabo Mokoena', 'Lerato Sithole'],
      tickets: [
        { provider: 'quicket', tier: 'General Access', price: 45000 },
        { provider: 'quicket', tier: 'Golden Circle', price: 89000 },
        { provider: 'howler', tier: 'VIP', price: 150000, availability: 'low' as const },
      ],
    },
    {
      title: 'The Kalk Bay Collective at Kirstenbosch',
      artist: 'The Kalk Bay Collective',
      venue: 'Kirstenbosch Botanical Garden',
      inDays: 5,
      status: 'sold_out',
      onSaleDays: -45,
      support: ['Ayanda Khumalo'],
      tickets: [
        {
          provider: 'webtickets',
          tier: 'Lawn',
          price: 32000,
          availability: 'sold_out',
        },
      ],
    },
    {
      title: 'Midnight Ferry — Cape Town',
      artist: 'Midnight Ferry',
      venue: 'The Assembly',
      inDays: 21,
      status: 'low_stock',
      onSaleDays: -14,
      support: ['Static Harbour', 'Riaan van Wyk'],
      tickets: [
        {
          provider: 'quicket',
          tier: 'Standing',
          price: 55000,
          availability: 'low',
        },
      ],
    },
    {
      title: 'Sunday Session: Deep House',
      artist: 'Thabo Mokoena',
      venue: 'The Orbit',
      inDays: 3,
      status: 'on_sale',
      onSaleDays: -10,
      support: ['Lerato Sithole'],
      tickets: [{ provider: 'quicket', tier: 'Entry', price: 15000 }],
    },
    {
      title: 'Siphokazi Ndlovu — Live at the City Hall',
      artist: 'Siphokazi Ndlovu',
      venue: 'Cape Town City Hall',
      inDays: 33,
      status: 'announced',
      onSaleDays: 4,
      support: ['Riaan van Wyk'],
      tickets: [],
    },
    {
      title: 'Zanele Mthembu — Amphitheatre Sessions',
      artist: 'Zanele Mthembu',
      venue: 'Durban Amphitheatre',
      inDays: 9,
      status: 'on_sale',
      onSaleDays: -30,
      support: ['Lerato Sithole', 'Siphokazi Ndlovu'],
      tickets: [
        { provider: 'computicket', tier: 'General', price: 28000 },
        { provider: 'computicket', tier: 'Seated', price: 42000 },
      ],
    },
    // A past show, so Past Shows and the live-performance rating path both work.
    {
      title: 'Nomvula Dlamini — Braamfontein',
      artist: 'Nomvula Dlamini',
      venue: 'The Orbit',
      inDays: -14,
      status: 'on_sale',
      onSaleDays: -60,
      support: ['Ayanda Khumalo'],
      tickets: [{ provider: 'quicket', tier: 'Entry', price: 22000 }],
    },
  ];

  const events: SeededEvent[] = [];

  for (const item of plan) {
    const startsAt = daysFromNow(item.inDays);
    const event = await prisma.event.create({
      data: {
        title: item.title,
        slug: slugify(`${item.title}-${startsAt.toISOString().slice(0, 10)}`),
        primaryArtistId: artists[item.artist],
        venueId: venues[item.venue],
        startsAt,
        doorsOpenAt: new Date(startsAt.getTime() - 90 * 60_000),
        onSaleAt: daysFromNow(item.onSaleDays, 9),
        localTimezone: 'Africa/Johannesburg',
        status: item.status,
        ageRestriction: '18+',
        description: `${item.artist} live at ${item.venue}. Doors open 90 minutes before the first act.`,
        posterImage: `https://picsum.photos/seed/${slugify(item.title)}-poster/800/1200`,
        source: 'manual',
        sourceId: `seed-${slugify(item.title)}`,
        isLocked: true,
        isPromoted: item.promoted ?? false,
        promotedUntil: item.promoted ? new Date(now + 20 * DAY) : null,
        lastSyncedAt: new Date(),
        lineup: {
          create: [
            { artistId: artists[item.artist], billingPosition: 0, role: 'headliner' as const },
            ...item.support.map((name, index) => ({
              artistId: artists[name],
              billingPosition: index + 1,
              role: (index === 0 ? 'support' : 'opener') as 'support' | 'opener',
            })),
          ],
        },
        ticketOptions: {
          create: item.tickets.map((ticket) => ({
            provider: ticket.provider,
            tierName: ticket.tier,
            priceMinor: ticket.price,
            currency: 'ZAR',
            availability: ticket.availability ?? 'available',
            purchaseUrl: `https://tickets.example.co.za/${slugify(item.title)}/${slugify(ticket.tier)}`,
            lastCheckedAt: new Date(),
          })),
        },
      },
    });

    events.push({ id: event.id, title: event.title, status: event.status });
  }

  return events;
}

async function seedSocial(events: SeededEvent[], users: SeededUser[]): Promise<void> {
  const byHandle = Object.fromEntries(users.map((user) => [user.handle, user.id]));
  const soldOut = events.find((event) => event.status === 'sold_out');
  const upcoming = events.find((event) => event.status === 'on_sale');
  if (!soldOut || !upcoming) return;

  // Artist follows, so "From artists you follow" is populated on first run.
  const artists = await prisma.artist.findMany({ select: { id: true } });
  for (const user of users.slice(0, 5)) {
    for (const artist of artists.slice(0, 4)) {
      await prisma.follow.create({ data: { userId: user.id, artistId: artist.id } });
      await prisma.artist.update({
        where: { id: artist.id },
        data: { followerCount: { increment: 1 } },
      });
    }
  }

  // Person-to-person connections, so Group Plans has something to show.
  await prisma.userFollow.createMany({
    data: [
      { followerId: byHandle.thandi, followeeId: byHandle.aisha },
      { followerId: byHandle.aisha, followeeId: byHandle.thandi },
      { followerId: byHandle.thandi, followeeId: byHandle.sipho },
    ],
  });

  await prisma.attendance.createMany({
    data: [
      { userId: byHandle.aisha, eventId: soldOut.id, state: 'going' },
      { userId: byHandle.sipho, eventId: soldOut.id, state: 'interested' },
      { userId: byHandle.thandi, eventId: upcoming.id, state: 'going' },
    ],
  });
  await prisma.event.update({
    where: { id: soldOut.id },
    data: { goingCount: 1, interestedCount: 1 },
  });
  await prisma.event.update({ where: { id: upcoming.id }, data: { goingCount: 1 } });

  const thread: {
    handle: string;
    body: string;
    tag: 'none' | 'have_tickets' | 'want_tickets' | 'going' | 'question';
    replies?: { handle: string; body: string }[];
  }[] = [
    {
      handle: 'thandi',
      body: 'Gutted this sold out in under an hour. Anyone know if they release more closer to the date?',
      tag: 'want_tickets',
      replies: [
        { handle: 'aisha', body: 'They did last year, about a week before. Worth watching the Quicket page.' },
      ],
    },
    {
      handle: 'aisha',
      body: 'Have two lawn tickets, can no longer make it. Happy to meet at the gate and transfer through the official app.',
      tag: 'have_tickets',
      replies: [{ handle: 'sipho', body: 'Sent you a message.' }],
    },
    {
      handle: 'sipho',
      body: 'Does anyone know what time Ayanda Khumalo is on? Trying to work out parking.',
      tag: 'question',
    },
    {
      handle: 'lindiwe',
      body: 'Third time seeing them at Kirstenbosch. Get there early, the lawn fills up fast.',
      tag: 'going',
    },
    // The one the moderation queue is meant to catch: brand-new account, resale
    // tag, offsite payment, urgency. It should come back scored and hidden.
    {
      handle: 'quickseller99',
      body: 'SELLING 4 TICKETS CHEAP!!! Pay by EFT first and I send immediately. WhatsApp me on 082 555 1234, quick sale, last ones going fast',
      tag: 'have_tickets',
    },
  ];

  for (const entry of thread) {
    // Score seeded comments through the same heuristics the API uses, so the
    // moderation queue shows what it would really show rather than a fixture
    // that has quietly bypassed the rules it is meant to demonstrate.
    const accountAgeHours = entry.handle === 'quickseller99' ? 1 : 120 * 24;
    const { score, signals } = scoreComment({
      body: entry.body,
      tag: entry.tag,
      accountAgeHours,
      recentCommentCount: 1,
      duplicateBodyCount: 0,
    });

    const root = await prisma.comment.create({
      data: {
        eventId: soldOut.id,
        userId: byHandle[entry.handle],
        body: entry.body,
        tag: entry.tag,
        thread: 'planning',
        scamScore: score,
        scamSignals: signals as unknown as Prisma.InputJsonValue,
        isHidden: score >= AUTO_HIDE_THRESHOLD,
        moderationState:
          score >= AUTO_HIDE_THRESHOLD
            ? 'hidden'
            : score >= REVIEW_THRESHOLD
              ? 'flagged'
              : 'visible',
      },
    });

    for (const reply of entry.replies ?? []) {
      await prisma.comment.create({
        data: {
          eventId: soldOut.id,
          userId: byHandle[reply.handle],
          parentCommentId: root.id,
          body: reply.body,
          tag: 'none',
          thread: 'planning',
        },
      });
      await prisma.comment.update({
        where: { id: root.id },
        data: { replyCount: { increment: 1 } },
      });
    }
  }

  const commentCount = await prisma.comment.count({ where: { eventId: soldOut.id } });
  await prisma.event.update({ where: { id: soldOut.id }, data: { commentCount } });

  // A recap thread on the past show, which only opens after the start time.
  const past = events[events.length - 1];
  await prisma.comment.create({
    data: {
      eventId: past.id,
      userId: byHandle.thandi,
      body: 'The encore with the horn section was worth the ticket on its own.',
      tag: 'none',
      thread: 'recap',
    },
  });
}

async function seedRatings(
  artists: Record<string, string>,
  events: SeededEvent[],
  users: SeededUser[],
): Promise<void> {
  const byHandle = Object.fromEntries(users.map((user) => [user.handle, user.id]));
  const past = events[events.length - 1];

  // Attendance must be confirmed before a live rating is allowed, so the seed
  // sets it the same way the post-show worker would.
  await prisma.attendance.createMany({
    data: [
      { userId: byHandle.thandi, eventId: past.id, state: 'attended' },
      { userId: byHandle.sipho, eventId: past.id, state: 'attended' },
    ],
  });
  await prisma.event.update({ where: { id: past.id }, data: { attendedCount: 2 } });

  await prisma.rating.createMany({
    data: [
      {
        userId: byHandle.thandi,
        artistId: artists['Nomvula Dlamini'],
        score: 5,
        reviewText: 'Been listening for years and she is better live than recorded.',
      },
      { userId: byHandle.aisha, artistId: artists['Nomvula Dlamini'], score: 4 },
      {
        userId: byHandle.lindiwe,
        artistId: artists['The Kalk Bay Collective'],
        score: 5,
        reviewText: 'Patient, unhurried, and they trust the audience to sit with it.',
      },
      // Live performance ratings, tied to the show that was attended.
      {
        userId: byHandle.thandi,
        artistId: artists['Nomvula Dlamini'],
        eventId: past.id,
        score: 5,
        reviewText: 'Started 40 minutes late and still worth it.',
      },
      {
        userId: byHandle.sipho,
        artistId: artists['Nomvula Dlamini'],
        eventId: past.id,
        score: 4,
      },
    ],
  });

  // Recompute the denormalised aggregates the same way the API does.
  for (const artistId of Object.values(artists)) {
    await prisma.$executeRaw`
      UPDATE artists a
      SET rating_avg = overall.avg,
          rating_count = overall.count,
          live_rating_avg = live.avg,
          live_rating_count = live.count
      FROM (
        SELECT ROUND(AVG(score)::numeric, 2)::float8 AS avg, COUNT(*)::int AS count
        FROM ratings WHERE artist_id = ${artistId}::uuid AND event_id IS NULL
      ) overall,
      (
        SELECT ROUND(AVG(score)::numeric, 2)::float8 AS avg, COUNT(*)::int AS count
        FROM ratings WHERE artist_id = ${artistId}::uuid AND event_id IS NOT NULL
      ) live
      WHERE a.id = ${artistId}::uuid
    `;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
