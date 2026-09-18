# Onstage

Discover where your favourite artists are playing, get tickets, get there and talk about it. All in one place.

South Africa first, architecture built for global expansion. See [`artist-tracker-spec.md`](artist-tracker-spec.md) for the full product and technical specification this build implements.

## What's here

A monorepo with six workspaces:

| Path | What it is |
|---|---|
| [`packages/shared`](packages/shared) | Domain types, enums, deep-link builders, formatting, the scam-scoring heuristics and affiliate-tagging logic — shared by every app |
| [`apps/api`](apps/api) | NestJS core API: artists, events, venues, tickets, threads, ratings, feed, admin, OpenAPI docs at `/docs` |
| [`apps/worker`](apps/worker) | Scheduled ingestion (Bandsintown, Ticketmaster) and notification jobs (announcements, on-sale/price-drop reminders, post-show rating prompts, badges) |
| [`apps/mobile`](apps/mobile) | React Native / Expo app — the primary product surface, English/isiZulu/Afrikaans |
| [`apps/web`](apps/web) | Public, server-rendered, crawlable artist and event pages (SEO, share cards, sitemap) |
| [`apps/admin`](apps/admin) | Admin CMS for manual event curation and moderation — this is where South African coverage actually gets built |

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL + PostGIS, Redis, and MinIO locally)
- npm (workspaces are used throughout — don't mix in yarn/pnpm)

## Local setup

```bash
# 1. Install everything
npm install

# 2. Copy the environment template and fill in what you have.
#    Every external provider key is optional — a missing key disables that
#    adapter/feature rather than crashing anything.
cp .env.example .env

# 3. Start Postgres, Redis and MinIO
npm run infra:up

# 4. Generate the Prisma client, then apply the migration
npm run db:generate
npm run db:migrate

# 5. Seed realistic sample data (artists, venues, events, comments — including
#    a deliberately scored scam post so moderation has something to show)
npm run db:seed

# 6. Run the pieces you need
npm run dev:api                # NestJS API on :3000  (docs at /docs, routes under /v1)
npm run dev:worker             # scheduled ingestion + notification jobs
npm run dev:mobile             # Expo dev server
cd apps/web && npm run dev     # public site on :3002
cd apps/admin && npm run dev   # admin CMS on :3001
```

Each app also needs its own env file with the subset of variables it uses:

```
apps/api/.env          — DATABASE_URL, REDIS_URL, ADMIN_API_TOKEN, AUTH_MODE, etc.
apps/admin/.env.local   — API_BASE_URL, ADMIN_API_TOKEN
apps/web/.env.local     — API_BASE_URL, NEXT_PUBLIC_WEB_BASE_URL
```

In development, `AUTH_MODE=dev` accepts bearer tokens of the form `Bearer dev:<handle>` (no Firebase project required) — the seed script provisions users `thandi`, `sipho`, `aisha`, `johan`, `lindiwe`, `quickseller99` (a deliberately fresh, scam-flagged account) and `curator` (an admin). `AUTH_MODE=dev` refuses to start when `NODE_ENV=production`.

### Wiring up real sign-in (Firebase)

The mobile app supports email/password, Google and Apple sign-in via Firebase Auth. Two independent halves need connecting:

1. **Server (Admin SDK)** — [Firebase console](https://console.firebase.google.com) → your project → Project settings → Service accounts → Generate new private key. Map the downloaded JSON into `apps/api/.env`:
   ```
   AUTH_MODE=firebase
   FIREBASE_PROJECT_ID=<project_id>
   FIREBASE_CLIENT_EMAIL=<client_email>
   FIREBASE_PRIVATE_KEY="<private_key, \n escapes kept literal, wrapped in quotes>"
   ```
   Never commit that JSON file.

2. **Client (mobile)** — Project settings → General → Your apps → register an iOS/Android app matching the `bundleIdentifier`/`package` in [`apps/mobile/app.json`](apps/mobile/app.json) (`za.co.onstage`). This gives you a public `firebaseConfig` — safe to ship in the app binary, unlike the Admin SDK credentials above:
   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_APP_ID=
   ```
   For Google sign-in, enabling the Google provider under Authentication → Sign-in method auto-creates a Web OAuth client under Google Cloud Console → APIs & Services → Credentials; add iOS/Android client IDs there too and set:
   ```
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
   ```
   For Apple sign-in, enable "Sign In with Apple" as a capability on your App ID in the Apple Developer portal. **Apple sign-in needs a custom dev client or EAS build** — `expo-apple-authentication` is a native module and does not work in plain Expo Go. Google sign-in (browser-based OAuth via `expo-auth-session`) and email/password both work fine in Expo Go.

Without any `EXPO_PUBLIC_FIREBASE_*` set, the sign-in screen renders a plain "not configured" message instead of crashing — useful for running the rest of the app signed out during early setup.

### Running tests

```bash
cd packages/shared && npm test   # pure logic: scam scoring, name normalisation, affiliate tagging, badges
cd apps/worker && npm test       # dedupe pipeline, run against a real PostGIS database
```

The worker's dedupe tests are integration tests, not unit tests — they need `npm run infra:up` and a migrated database, and they exercise the exact rule from the spec: same show, three sources, collapsed on normalised artist name + venue within 500 m + start time within 24 hours.

## Environment variables

All variables live in [`.env.example`](.env.example), grouped by purpose:

- **Datastores** — `DATABASE_URL` (PostgreSQL + PostGIS), `REDIS_URL`
- **API** — port, base URL, CORS origins
- **Auth** — `AUTH_MODE` (`dev` | `firebase`) and Firebase Admin credentials
- **Admin CMS** — `ADMIN_API_TOKEN`, a shared secret held only by the CMS server process, never exposed to a browser
- **Ingestion providers** — Bandsintown, Songkick, Ticketmaster, Quicket credentials. Each is independently optional; the worker adapter registry skips any provider with no key configured and logs that it did, rather than failing the run
- **Streaming / Maps / Push** — Spotify, Google Maps, FCM
- **Object storage** — S3-compatible (MinIO locally)
- **Mobile (Expo)** — `EXPO_PUBLIC_*` variables, bundled at build time
- **Public web** — base URL, app store links for the hand-off banner
- **Affiliate attribution** — `AFFILIATE_ID` / `AFFILIATE_PARAMS`, tags outbound ticket links for commission attribution; no payment is ever processed in-app
- **POPIA** — `PRIVACY_POLICY_VERSION`, stamped against every consent record

**Never commit a filled-in `.env`.** All provider credentials are environment variables only, per the build constraints.

## Constraints this build holds to

These are load-bearing, not incidental — several are enforced in code, not just by convention:

- **No real-time artist location tracking, ever.** Only announced and confirmed appearances. There is no field on `User` or anywhere else that means "where an artist is right now," and there never will be.
- **No audio hosting.** Streaming buttons deep-link out to Spotify/Apple Music/YouTube/SoundCloud/Audiomack. The Spotify preview embed is the only audio surface, and it's the provider's own iframe.
- **No ticket payments.** Every "Get tickets" action links to the provider's own checkout. The API's `tickets` module only records a click for affiliate attribution — it never touches a card number.
- **No rideshare booking.** Uber and Bolt are deep links only (`uber://`, `bolt://`, with web fallbacks). Bolt is listed first — larger South African footprint.
- **No user-to-user payment processing.** The event thread hosts resale *conversation* only. A non-dismissible warning banner ships with every thread response. Automated scam-pattern scoring (offsite payment requests, crypto wallets, urgency language, new accounts posting only sale offers) auto-hides high-scoring posts pending human review — nothing is ever silently deleted.
- **Graceful degradation.** The API's cache layer serves stale data on a Redis outage rather than failing; the mobile client caches GET responses and serves them when offline; ingestion adapters degrade to "skip this provider" rather than aborting a run.

## Architecture notes

- **Ingestion is adapter-based** ([`apps/worker/src/sources`](apps/worker/src/sources)) specifically so any single provider (API access revoked, pricing changed, terms tightened) can be swapped without touching the pipeline, schema, or API.
- **Manual curation always wins.** Every event created through the admin CMS is written with `source: manual` and `isLocked: true`. The upsert pipeline checks the lock before writing anything, on every pass, forever.
- **Search is Postgres full-text + trigram**, not a separate search service — typo tolerance ("kalk bey colective" → The Kalk Bay Collective) comes from `pg_trgm` similarity combined with a generated `tsvector` column, which is enough for the traffic this product will see for a long while.
- **Geospatial queries use PostGIS** (`ST_DWithin`, `ST_Distance` on generated `geography` columns) for both the discovery feed's "near me" radius search and the ingestion dedupe rule's venue-proximity match.

## What's out of scope for this build

Per the spec's Phase boundaries: in-app payments, an escrow resale marketplace, and a promoter/artist self-serve dashboard beyond the claim-your-profile data model. The **Growth, Retention & Business Layer addendum** (referrals, onboarding, attendance badges, Group Plans, recap threads, venue accessibility fields, i18n, affiliate tracking, promoted placement, POPIA consent) is implemented — see the `growth.ts` / `affiliate.ts` modules in `packages/shared` and the corresponding API modules (`referrals`, `badges`, `consent`).

The privacy and terms pages in `apps/web` are functional placeholders reflecting actual system behaviour — they need review by a South African attorney before this goes anywhere near real users, particularly the resale clause.
