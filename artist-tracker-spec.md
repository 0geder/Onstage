# Artist Tracker — Product & Technical Specification

**Working name:** Onstage (placeholder — swap for your brand)
**One-liner:** Look up any artist and instantly see where they're playing, who's on the lineup, how to get tickets, how to get there, and what other fans are saying.
**Primary market:** South Africa first, architecture built for global expansion.

---

## 1. Problem & Positioning

Fans currently piece together an artist's movements from Instagram stories, WhatsApp groups, scattered ticketing sites and word of mouth. Smaller and emerging artists get almost no structured discovery at all.

This platform centralises the **artist** as the unit of discovery, rather than the venue or the promoter. Everything — events, lineups, tickets, travel, conversation, ratings, streaming links — hangs off the artist profile.

**Competitive reference points:** Bandsintown and Songkick (tour tracking), Quicket and Webtickets (SA ticketing), Twitter/X and TikTok (comment threads), Letterboxd (ratings culture done well).

**Differentiator:** the four things nobody combines — discovery, the social thread, the ticket-resale conversation, and the ride to the door.

---

## 2. Target Users

| Segment | Core need |
|---|---|
| Fans | Know where my favourite artist is playing and get there |
| Casual gig-goers | Find something worth attending near me this weekend |
| Emerging artists | Be findable; get listens; get rated; fill rooms |
| Promoters & venues | Reach an audience already filtered by taste |

---

## 3. Data Model

### Artist
```
id, name, slug, verified (bool), bio, genres[], home_city, country,
profile_image, banner_image,
streaming_links { spotify, apple_music, youtube, soundcloud, audiomack },
social_links { instagram, x, tiktok, facebook },
follower_count, rating_avg, rating_count,
external_ids { bandsintown_id, songkick_id, spotify_id, musicbrainz_id },
created_at, updated_at
```

### Event
```
id, title, primary_artist_id, lineup[] (ordered artist_ids + billing_position),
venue_id, starts_at (UTC), local_timezone, doors_open_at,
status (announced | on_sale | low_stock | sold_out | postponed | cancelled),
age_restriction, description, poster_image,
source (bandsintown | songkick | ticketmaster | quicket | manual | artist_submitted),
source_url, last_synced_at, created_at, updated_at
```

### Venue
```
id, name, address_line, city, country, lat, lng,
capacity, place_id (Google Places), image, website
```

### TicketOption
```
id, event_id, provider (quicket | webtickets | computicket | ticketmaster | howler | other),
tier_name, price_minor, currency, availability (available | low | sold_out),
purchase_url, last_checked_at
```

### User
```
id, handle, display_name, email, avatar,
home_lat, home_lng, home_city,
followed_artist_ids[], notification_prefs, created_at
```

### Rating
```
id, user_id, artist_id, event_id (nullable — set for post-show ratings),
score (1–5), review_text (nullable), created_at
```
Constraint: one general rating per user per artist; one post-show rating per user per event.

### Comment
```
id, event_id, user_id, parent_comment_id (nullable — enables threading),
body, tag (none | have_tickets | want_tickets | going | question),
like_count, reply_count, is_hidden, created_at
```

### Follow / Attendance
```
follows: user_id, artist_id, created_at
attendance: user_id, event_id, state (interested | going | attended)
```

---

## 4. Feature Specifications

### 4.1 Artist Lookup & Profile
- Full-text search across artist name, aliases, genre. Typo-tolerant.
- Profile shows: banner, verified tick, rating, follower count, **Upcoming shows**, **Past shows**, streaming link buttons, socials, similar artists.
- "Follow" triggers push notifications for new event announcements within the user's region.

### 4.2 Where They'll Be
- **Critical constraint:** this tracks *announced and confirmed* appearances. It does not track an artist's live physical location. No real-time GPS of artists, ever — it is neither obtainable nor acceptable.
- Sources, in priority order:
  1. Aggregator APIs (Bandsintown, Songkick) for international and mid-tier artists
  2. Ticketing APIs (Ticketmaster Discovery, Quicket, Webtickets) for anything on sale
  3. Verified artist/promoter submissions through a claim-your-profile flow
  4. Manual curation for the local scene that no API covers — this is where SA coverage will live or die
- Deduplication is mandatory: the same show will arrive from three sources. Match on (normalised artist name + venue proximity + date within 24h).

### 4.3 Lineup
- Events store an ordered lineup with billing position (headliner, support, opener, DJ set).
- Every lineup name is a tappable link to that artist's profile. This is the discovery engine — most new-artist exposure will come from someone tapping a support act.

### 4.4 Tickets
- Show all known ticket options with price ranges and a clear availability badge.
- Primary CTA: "Get tickets" → out to the official provider. Never take payment in the MVP.
- When **sold out**, the CTA flips to "Find tickets in the thread" and drops the user into the event thread filtered to `have_tickets`.

### 4.5 Event Thread (the social layer)
- Twitter/TikTok-style threaded comments per event: top-level comments, nested replies, likes, sort by top or newest.
- Tag selector when posting: **I have tickets** / **Looking for tickets** / **Going** / **Question**.
- Filter chips at the top of the thread for those tags.
- Deep-link: `/event/{id}#comment-{id}` so threads are shareable.
- Moderation: report button, rate limiting, automated scam-pattern flagging (offsite payment requests, repeated identical posts, new accounts posting only sale offers), human review queue.

### 4.6 Resale — Scope Decision
**MVP position:** the platform hosts *conversation* about resale. It does not process resale transactions, hold funds, or take a cut.

Reasoning: the moment you facilitate the transaction you become a ticket marketplace — which brings payment processing, escrow, chargebacks, fraud liability, and consumer-protection obligations (SA Consumer Protection Act; in other markets, outright resale restrictions). Stay a forum first, validate demand, then decide whether a verified escrow marketplace is worth building.

Mandatory even as a forum:
- Persistent warning banner on the thread: transactions happen at users' own risk, never pay before verifying, the platform is not a party to any sale.
- Scam-reporting flow and account bans.
- No in-app payment links or crypto wallet addresses.

### 4.7 Getting There
- Map view of the venue with a pin.
- "Directions" → Google Maps / Apple Maps deep link from the user's current location.
- "Get a ride" → deep link into **Uber** and **Bolt** with the venue pre-filled as the destination. Bolt has the larger SA footprint — include it as a first-class option, not an afterthought.
- Never build the rideshare. Deep links only: `uber://?action=setPickup&dropoff[latitude]=...` and Bolt's equivalent universal link, with a web fallback if the app isn't installed.

### 4.8 Ratings
- 1–5 stars on the artist profile, with an optional short review.
- Separate **live performance rating** prompted by push notification the morning after an event the user marked as attended. This is the rating that's actually useful and that no competitor owns.
- Display both: overall artist rating and average live rating.
- Anti-abuse: one rating per user per artist, editable; require an account older than 24 hours; flag coordinated bursts.

### 4.9 Listening
- Streaming provider buttons on every artist profile, deep-linked to the artist's page on Spotify, Apple Music, YouTube Music, SoundCloud, Audiomack.
- Embed a Spotify preview player where licensing permits. Do not host or stream audio yourself — that is a licensing problem you do not want.

### 4.10 Discovery Feed
- "Near you" — events within a configurable radius, sorted by date.
- "From artists you follow" — the retention driver.
- "This weekend" and genre filters.

---

## 5. Architecture

```
┌─────────────────────────────────────────────┐
│  Mobile app (React Native / Expo)           │
│  + responsive web client                    │
└───────────────┬─────────────────────────────┘
                │ HTTPS / REST + WebSocket
┌───────────────▼─────────────────────────────┐
│  API Gateway                                │
│  auth, rate limiting, request routing       │
└───┬────────┬────────┬────────┬──────────────┘
    │        │        │        │
┌───▼──┐ ┌───▼───┐ ┌──▼────┐ ┌─▼────────┐
│ Core │ │Search │ │Social │ │Notif.    │
│ API  │ │Service│ │Service│ │Service   │
└───┬──┘ └───┬───┘ └──┬────┘ └─┬────────┘
    │        │        │        │
┌───▼────────▼────────▼────────▼───────────┐
│ PostgreSQL (+ PostGIS)   Redis   OpenSearch│
│ S3-compatible object storage               │
└────────────────────────────────────────────┘
                ▲
┌───────────────┴─────────────────────────────┐
│  Ingestion Pipeline (scheduled workers)     │
│  Bandsintown · Songkick · Ticketmaster ·    │
│  Quicket · Webtickets · manual admin CMS    │
│  → normalise → dedupe → upsert              │
└─────────────────────────────────────────────┘
```

### Services
- **Core API** — artists, events, venues, tickets, users, follows, ratings. Node.js (NestJS) or Python (FastAPI).
- **Search service** — OpenSearch or Postgres full-text for MVP. Typo tolerance, genre facets, geo-filtering.
- **Social service** — comments, threads, likes, reports. Separated because it has a completely different read/write profile to event data and will need to scale independently.
- **Notification service** — push via Firebase Cloud Messaging / APNs, plus email. Fan-out on new event announcements to followers.
- **Ingestion workers** — scheduled jobs (hourly for on-sale events, daily for the long tail). Idempotent upserts keyed on `(source, source_id)`.

### Data stores
- **PostgreSQL + PostGIS** — primary store. Relational fits this model cleanly; PostGIS handles "events within 50 km of me".
- **Redis** — caching hot artist/event pages, rate limiting, feed fan-out.
- **OpenSearch** — search index, rebuilt from Postgres.
- **Object storage** — posters, avatars, banners, served via CDN.

### Suggested stack
| Layer | Choice | Why |
|---|---|---|
| Mobile | React Native (Expo) | One codebase, iOS + Android, fast iteration |
| Backend | NestJS (TypeScript) | Shared language with the client, strong structure |
| DB | PostgreSQL + PostGIS | Relational data + geospatial queries |
| Auth | Firebase Auth or Auth0 | Social login out of the box; don't roll your own |
| Maps | Google Maps SDK or Mapbox | Mapbox is cheaper at scale, Google has better SA place data |
| Push | Firebase Cloud Messaging | Cross-platform, free tier |
| Hosting | Managed containers (Railway/Render/Fly.io to start, AWS/GCP later) | Keep ops cost near zero pre-traction |
| Analytics | PostHog or Mixpanel | Funnel and retention tracking from day one |

---

## 6. Third-Party Integrations

| Purpose | Service | Notes |
|---|---|---|
| Tour data | Bandsintown API, Songkick API | Check current terms; both have historically required partner approval for commercial use |
| Ticketing (intl) | Ticketmaster Discovery API, SeatGeek, Eventbrite | Event + availability data |
| Ticketing (SA) | Quicket, Webtickets, Computicket, Howler | May require direct partnership or scraping; verify what's permitted |
| Streaming | Spotify Web API, Apple Music API | Artist metadata, images, deep links, preview embeds |
| Maps & directions | Google Maps Platform / Mapbox | Geocoding, places, directions |
| Rides | Uber deep links, Bolt deep links | Deep link only — no ride booking in-app |
| Push | FCM / APNs | |

**Verify every API's current terms yourself** — availability, pricing and commercial-use rules for these change often, and several have tightened significantly in recent years.

---

## 7. Build Phases

### Phase 1 — MVP (target 8–12 weeks)
Artist search → artist profile with streaming links → upcoming events → event page with lineup → ticket link-out → venue map + directions + ride deep link → basic accounts and follows.
**Success test:** a user can go from "I like this artist" to "I'm holding a ticket and I know how I'm getting there" without leaving the app until checkout.

### Phase 2 — Social
Event threads with tags and filters, likes, replies, reporting and moderation tools, resale-conversation disclaimers, push notifications for followed artists.

### Phase 3 — Ratings & Artist Tools
Artist ratings, post-show live ratings, claim-your-profile flow, artist dashboard (self-submit events, view follower geography), promoter accounts.

### Phase 4 — Depth
Personalised recommendation feed, friends/attendance graph, verified resale marketplace (only if Phase 2 proves the demand), festival lineup support, setlist archives.

---

## 8. Key Risks

| Risk | Mitigation |
|---|---|
| **Data coverage** — aggregator APIs barely cover the SA local scene | Manual curation team + artist self-submission from day one. Treat coverage as the product, not a feature. |
| **API access revoked or priced out** | Abstract every provider behind an adapter interface so any single source can be swapped without touching core logic. |
| **Resale fraud** | Forum-only stance, prominent warnings, scam detection, fast bans, never touch funds. |
| **Cold start (empty threads, no ratings)** | Launch city by city. Seed one scene properly rather than being thin everywhere. |
| **Legal exposure on resale** | Get local legal advice before enabling any transaction feature. Consumer Protection Act and ticketing regulations vary widely by market. |
| **Review bombing** | Rate limits, account age gates, anomaly detection on rating bursts. |

---

## 9. Build Prompt

> Copy the block below into your coding agent or AI builder. Trim to Phase 1 scope if you want a working prototype rather than a full build.

---

```
Build a cross-platform mobile application called Onstage that lets music fans
discover where artists are performing, buy tickets, get to the venue, discuss
events with other fans, and rate artists.

TECH STACK
- Mobile: React Native with Expo (iOS + Android)
- Backend: NestJS (TypeScript), REST API
- Database: PostgreSQL with PostGIS
- Cache: Redis
- Search: PostgreSQL full-text (upgrade path to OpenSearch)
- Auth: Firebase Auth (email, Google, Apple sign-in)
- Maps: Google Maps SDK
- Push: Firebase Cloud Messaging
- Storage: S3-compatible object storage with CDN

DATA MODEL
Implement these entities with the relationships described:
- Artist: name, slug, verified, bio, genres[], home_city, country, images,
  streaming_links (spotify/apple_music/youtube/soundcloud/audiomack),
  social_links, follower_count, rating_avg, rating_count, external_ids
- Venue: name, address, city, country, lat, lng, capacity, google_place_id
- Event: title, primary_artist_id, venue_id, starts_at (UTC), local_timezone,
  doors_open_at, status (announced|on_sale|low_stock|sold_out|postponed|
  cancelled), age_restriction, description, poster_image, source, source_url,
  last_synced_at
- EventLineup: join table of event_id, artist_id, billing_position (int),
  role (headliner|support|opener|dj_set)
- TicketOption: event_id, provider, tier_name, price_minor, currency,
  availability, purchase_url, last_checked_at
- User: handle, display_name, email, avatar, home_lat, home_lng, home_city,
  notification_prefs
- Follow: user_id, artist_id
- Attendance: user_id, event_id, state (interested|going|attended)
- Rating: user_id, artist_id, event_id (nullable), score 1-5, review_text.
  Unique constraint on (user_id, artist_id, event_id)
- Comment: event_id, user_id, parent_comment_id (nullable, self-referencing
  for threading), body, tag (none|have_tickets|want_tickets|going|question),
  like_count, reply_count, is_hidden

SCREENS AND FEATURES

1. Search — typo-tolerant artist search with results showing artist image,
   name, genre and next upcoming show. Recent searches persisted locally.

2. Artist Profile — banner, avatar, verified tick, rating (overall and live
   performance shown separately), follower count, Follow button, bio,
   streaming platform buttons that deep-link out, social links, tabbed
   Upcoming Shows and Past Shows lists, Similar Artists row.

3. Event Page —
   - Poster, title, date/time in venue local time, venue name
   - Lineup list in billing order; every name taps through to that artist
   - Availability badge derived from event status
   - Ticket options with price range and a "Get tickets" button that opens the
     provider URL in an in-app browser
   - When status is sold_out, primary CTA becomes "Find tickets in the thread"
     and scrolls to the thread filtered to the have_tickets tag
   - Venue map preview, "Directions" button (Google/Apple Maps deep link from
     the user's current location), and "Get a ride" button offering Uber and
     Bolt deep links with the venue pre-filled as destination, with a web
     fallback if the app is not installed
   - Interested / Going buttons
   - Event thread below

4. Event Thread — threaded comments, one level of nesting for replies,
   likes, sort by Top or Newest. Composer includes a tag selector
   (I have tickets / Looking for tickets / Going / Question). Filter chips at
   the top of the thread for those tags. A persistent, non-dismissible warning
   banner states that ticket transactions between users happen at their own
   risk and that the platform is not a party to any sale. Report button on
   every comment. Rate limit posting. The platform must NOT process payments
   or hold funds for any user-to-user ticket sale.

5. Discovery Feed — three sections: Near You (PostGIS radius query from the
   user's location, configurable radius), From Artists You Follow, and This
   Weekend. Genre filter chips.

6. Ratings — 1-5 star rating with optional short review on the artist profile.
   Separately, when a user has marked an event as attended, prompt them the
   following morning via push notification to rate the live performance.
   Display overall rating and live rating separately on the artist profile.
   Enforce one rating per user per artist, editable. Require account age of at
   least 24 hours before rating.

7. Profile — followed artists, upcoming events the user is going to, past
   ratings, settings, notification preferences, home location.

INGESTION
Build a scheduled worker service that pulls event data from external providers
behind a common EventSource adapter interface, so any provider can be added or
removed without changing core logic. Implement adapters for at least one
aggregator (Bandsintown or Songkick) and one ticketing provider. Normalise into
the Event/Venue/TicketOption schema. Deduplicate incoming events by matching on
normalised artist name + venue within 500m + start time within 24 hours.
Upserts must be idempotent, keyed on (source, source_id). Run hourly for events
that are on sale and daily for everything else.

Also build an admin CMS allowing manual event creation and editing, because
local and emerging-artist shows will not appear in any third-party API. Manual
entries must never be overwritten by an ingestion run.

CONSTRAINTS
- The app tracks announced and confirmed performances only. Do not implement,
  imply, or design for real-time location tracking of artists.
- Do not host or stream audio. Link out to streaming platforms only.
- Do not process ticket payments. All ticket purchases link out to the official
  provider.
- Do not build rideshare functionality. Deep link to Uber and Bolt only.
- All external provider credentials via environment variables, never committed.
- Every external API call must handle failure gracefully and degrade to cached
  data rather than showing an error screen.

DELIVERABLES
- Database schema and migrations
- Backend API with the endpoints implied above, documented with OpenAPI
- React Native app implementing all screens listed
- Ingestion worker with at least two source adapters
- Admin CMS for manual event curation
- Seed script with realistic sample artists, venues, events and comments
- README covering local setup and required environment variables

Start with the database schema and backend API, then the mobile app, then
ingestion. Use South African English throughout the UI copy.
```

---

## 10. Addendum — Growth, Retention & Business Layer

> Copy the block below into your coding agent alongside the Section 9 prompt, or run it as a follow-up once Phase 1 is built.

```
Extend the Onstage app (as previously specified) with the following additions.
These are growth, retention and business-layer features, to be treated as
Phase 2+ unless stated otherwise.

GROWTH & DISCOVERY
- Generate a public, unauthenticated web page for every Artist and every Event
  (server-rendered, SEO-indexable), linking back into the app via deep link /
  app store fallback for logged-out visitors. This is the primary source of
  organic, off-platform discovery and must be crawlable by search engines.
- Add a "Share" action on Event and Artist pages that generates a shareable
  image card (poster, date, venue, artist name) sized for Instagram/X Stories,
  with a tracked link back into the app.
- Add a referral flow: invite-a-friend generates a unique code; both the
  inviter and invitee receive a small unlock (e.g. early on-sale alert access
  or a profile badge) once the invitee completes signup.

RETENTION
- Add an onboarding flow that prompts new users to pick genres and follow at
  least three artists before landing on the Discovery Feed, so Near You and
  Following are never empty on first use.
- Extend notification_prefs and the notification service to support granular
  categories: new event announced, on-sale reminder (user-configurable lead
  time), price drop on a followed event, and "shows near you this weekend"
  (a scheduled weekly digest).
- Add an attendance badge/streak system: track consecutive months with at
  least one attended event, and award badges at defined thresholds. Display
  on the user's profile.

PRACTICAL FEATURES
- Add a Group Plans feature: a user can mark an event as "Going" and see
  which of their followed/mutual connections are also going, without this
  becoming a ticket transaction feature.
- Add a post-event Recap Thread, separate from the pre-event planning thread,
  unlocked only after the event's start time, for photos and short clips from
  attendees.
- Add accessibility and logistics fields to Venue: wheelchair_access (bool),
  age_restriction, reentry_policy, cloakroom (bool). Display these on the
  Event page.
- Support multi-language UI strings, minimum English, isiZulu and Afrikaans,
  using a standard i18n library (e.g. i18next) so further languages can be
  added without code changes.

BUSINESS & COMPLIANCE
- Add an affiliate/referral tracking parameter to every outbound ticket link
  (purchase_url) so commission from ticket providers can be attributed and
  measured, even though no payment is processed in-app.
- Add a "Promoted" flag on Artist and Event records with a distinct visual
  treatment in feed and search results, to support a future paid-placement
  revenue stream. Do not implement billing yet — just the data model and
  display logic.
- Add a POPIA-compliant consent flow: explicit opt-in for location collection,
  a privacy policy screen, and a data-deletion request path from account
  settings. Log consent timestamps against the user record.

Do not implement in-app payments, escrow, or billing in this phase. These
additions extend discovery, retention and data collection only.
```

---

## 11. Immediate Next Steps

1. Pick a launch city and manually build a complete event calendar for it — this proves whether coverage is achievable before you write any code.
2. Confirm API access and commercial terms for Bandsintown/Songkick and at least one SA ticketing provider.
3. Decide the resale stance formally and get it reviewed before Phase 2 ships.
4. Build the Phase 1 MVP.
