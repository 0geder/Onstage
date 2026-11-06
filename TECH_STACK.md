# Onstage tech stack

Everything Onstage is built with, what each piece is for, and where it lives.
Versions are the ones pinned in the repo; `package.json` files are the source
of truth when they differ from this page.

## At a glance

| Part | What it is | Main technology |
| --- | --- | --- |
| `apps/mobile` | The Android and iOS app | Expo SDK 58, React Native 0.88, React 19.3 |
| `apps/api` | The backend everything talks to | NestJS 10, Prisma 5, PostgreSQL + PostGIS, Redis |
| `apps/worker` | Scheduled jobs: gig imports, reminders, account deletion | Node.js 22, Croner, Prisma |
| `apps/web` | Public website: shareable gig and artist pages, SEO | Next.js 16 (App Router) |
| `apps/admin` | Internal CMS for moderation, claims, venues and imports | Next.js 16 (App Router) |
| `packages/shared` | Types, enums and helpers used by every app | TypeScript |

One npm workspaces monorepo, TypeScript throughout, Node.js 22.

## Mobile app (`apps/mobile`)

- **Expo SDK 58** with a custom dev client (`expo-dev-client`), built with **EAS Build** (`eas.json`: development, preview and production profiles).
- **React Native 0.88**, **React 19.3**, **TypeScript 6**, React Compiler lint rules.
- **Expo Router 58**: file-based navigation (`app/`), tabs and full-screen modals such as stories.
- **TanStack Query 5**: API data fetching and caching, with optimistic updates (for example the double-tap save).
- **Firebase Auth** (JS SDK 12): email/password, Google and Apple sign-in.
  - Google uses `expo-auth-session` with a PKCE code flow.
  - Apple uses `expo-apple-authentication`.
- **MapLibre React Native 11** with **OpenFreeMap** tiles: a map that needs no API key.
- **expo-notifications**: push notifications through Expo's push service.
- **expo-location**: "near you" gigs, with a city picker if location is declined.
- **expo-image**: posters, blurred backdrops and tinted line icons.
- **i18next / react-i18next**: English, isiZulu and Afrikaans (`src/i18n/locales`).
- **Lucide** icons (ISC licence), pre-rendered as PNGs in `assets/icons`.
- Reanimated, Gesture Handler, Screens, Safe Area Context, AsyncStorage, plus the expo-* helpers for clipboard, sharing, linking, localization, crypto, file system and splash screen.
- **Sentry** (`@sentry/react-native`): crash and error reporting.

## API (`apps/api`)

- **NestJS 10** on Express, with URL versioning (`/v1`).
- **Prisma 5** ORM over **PostgreSQL 16 + PostGIS 3.4**. PostGIS handles distance-based "near you" queries. Migrations live in `prisma/migrations`.
- **Redis 7** via **ioredis**: response caching and rate-limit counters shared across instances.
- **Firebase Admin**: verifies sign-in tokens, including revoked sessions.
- **Security:**
  - Helmet for security headers.
  - An explicit CORS allow-list in production.
  - `@nestjs/throttler` for global and per-endpoint rate limits.
  - `class-validator` / `class-transformer`, rejecting any field the API doesn't expect.
- **@nestjs/swagger**: OpenAPI docs at `/docs`, off in production unless enabled.
- **@nestjs/terminus**: health checks.
- **Zod**: validates configuration.
- **Sentry** (`@sentry/nestjs`): reports server errors (5xx only).
- **Jest + Supertest**: tests.

## Worker (`apps/worker`)

- **Node.js 22** with **Croner**: cron jobs in South African time. A Postgres advisory lock stops two copies running the same job at once.
- **Gig sources:**
  - **Quicket** API
  - **Howler** Event Webhook, pushed to the API by organisers who opt in (Howler has no public listings API)
  - **Ticketmaster** Discovery API
  - **Bandsintown**
  - **MusicBrainz**, for artist data
- **Jobs:**
  - hot and cold ingestion passes
  - notification delivery (outbox)
  - on-sale, price-drop and tickets-back alerts
  - weekend digest
  - post-show ratings and badges
  - POPIA account deletion
- **Pino**: structured logging.
- **Sentry** (`@sentry/node`): reports failed jobs.
- **Jest**: tests.

## Website and CMS (`apps/web`, `apps/admin`)

- **Next.js 16** (App Router, Turbopack, `output: 'standalone'` for Docker) and **React 19.3**.
- **Website:**
  - server-rendered gig and artist pages
  - Open Graph images
  - JSON-LD event data for Google
  - sitemap and robots
  - Android App Links and iOS Universal Links files
- **CMS sign-in:**
  - operator accounts with scrypt-hashed passwords
  - signed (HMAC) session cookies
  - a lockout after repeated failed sign-ins
- **CMS to API:** the CMS calls the API with a server-only token, so the token never reaches the browser.
- **Security headers** on every response: HSTS, frame blocking and a CSP baseline.
- **Sentry** (`@sentry/nextjs`): server and browser errors.

## Infrastructure and tooling

- **Docker**:
  - The multi-stage `Dockerfile` builds the `api`, `worker`, `web`, `admin` and `migrate` images on `node:22-bookworm-slim`.
  - `docker-compose.yml` is for **local development only**, with Postgres/PostGIS, Redis and optional MinIO. Its passwords are not for production.
- **GitHub Actions** (`.github/workflows/ci.yml`): typecheck, lint, tests (shared, API, worker), iOS and Android bundle export, and Docker image builds.
- **EAS Build**: mobile builds and store submissions.
- **ESLint 9** (flat config) and **Prettier 3** for code style. **TypeScript 5.6** on the server, **TypeScript 6** in the mobile app.
- **Sentry**: error monitoring across all five apps. It stays off until DSNs are set; see `.env.example`.

## Third-party services

| Service | Used for | Configured by |
| --- | --- | --- |
| Firebase Authentication | User accounts and sign-in | `FIREBASE_*`, `EXPO_PUBLIC_FIREBASE_*` |
| Google Cloud OAuth | Google sign-in | `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` |
| Expo / EAS | Builds, push notifications | `EAS_PROJECT_ID`, `EXPO_OWNER` |
| Quicket API | South African gig listings | `QUICKET_API_KEY` |
| Howler Event Webhook | Gigs from Howler organisers who opt in, including tickets remaining | `HOWLER_WEBHOOK_TOKEN` |
| Ticketmaster Discovery API | Gig listings | `TICKETMASTER_API_KEY` |
| Bandsintown | Gig listings | `BANDSINTOWN_APP_ID` |
| MusicBrainz | Artist catalogue data | no key needed |
| OpenFreeMap | Map tiles | no key needed |
| Sentry | Error and crash reporting | `SENTRY_*`, `NEXT_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` |

Secrets live only in `.env` (git-ignored) and the hosting or EAS secret store.
`.env.example` lists every variable.
