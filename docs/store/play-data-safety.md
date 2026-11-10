# Google Play — Data safety form answers

The answers below describe the code as of commit `89c3068` on `build/onstage-mvp`. If the
code changes (a new SDK, analytics, email sending, photo upload), update this form
**and** `apps/web/app/privacy/page.tsx`.

Terms used below:
- **Collected** means data leaves the device to Onstage's servers or to a provider
  working on our behalf.
- **Shared** means it goes to a third party that is *not* our service provider.
  Firebase, Sentry, Expo push and our host are service providers, so sending data to
  them is collection, not sharing, under Play's definitions.

## Section 1 — Data collection and security

| Question | Answer | Evidence |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** | see the table below |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Production API is `https://api.onstage.co.za` (`apps/mobile/eas.json`); Firebase, Sentry, Expo push and OpenFreeMap are HTTPS-only. **Owner check:** the API host must refuse plain HTTP. |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in-app, plus a web page | In-app: Profile → Privacy → Delete my account (`apps/mobile/app/settings/privacy.tsx`), which calls `POST /me/deletion-request` (`apps/api/src/modules/consent/consent.controller.ts`) and is carried out by `apps/worker/src/jobs/account-deletion.ts`. Web: https://onstage.co.za/delete-account (`apps/web/app/delete-account/page.tsx`) |
| Account creation method | **Username/password and OAuth** (email and password, Google, Apple) | `apps/mobile/src/lib/auth.ts` |
| Delete account URL | `https://onstage.co.za/delete-account` | |
| Independent security review (MASA) | No | optional |
| Committed to Play Families Policy | No — not a children's app | |

## Section 2 — Data types

Answer **No** to every data type not listed here. That includes financial info, health
and fitness, messages (comments are public posts, declared as "Other user-generated
content"), photos and videos, audio, files and docs, calendar, contacts, web browsing,
installed apps, SMS, call logs, race/ethnicity, political or religious beliefs, sexual
orientation, address, phone number and in-app search history. Search queries are sent
to the API (`/search/artists?q=`) only to answer the request and are not stored.

| Data type | Collected | Shared | Processed ephemerally? | Required or optional | Purposes | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **Location → Approximate location** | Yes | No | No (see note) | Optional | App functionality | Permission `ACCESS_COARSE_LOCATION` (`apps/mobile/app.json`). |
| **Location → Precise location** | Yes | No | No (see note) | Optional | App functionality | `ACCESS_FINE_LOCATION` in `app.json`; `requestLocation()` in `apps/mobile/src/lib/location.ts` (foreground only, `Accuracy.Balanced`); lat/lng sent with feed requests (`apps/mobile/app/(tabs)/index.tsx` → `/feed`). The server does not store it against the user (`homeLat`/`homeLng` exist in `schema.prisma`, but the app never sets them). Withdrawing consent clears it (`consent.service.ts`). Refusing keeps the app usable (city picker). |
| **Personal info → Name** | Yes | No | No | Required for an account (the app works without one) | App functionality, Account management | `User.displayName`, `User.handle` (`apps/api/prisma/schema.prisma`); taken from the Firebase token on first sign-in (`apps/api/src/common/auth/user-resolver.service.ts`); shown next to comments. |
| **Personal info → Email address** | Yes | No | No | Required for an account | Account management, App functionality | `User.email`; Firebase Auth (`apps/mobile/src/lib/auth.ts`). |
| **Personal info → User IDs** | Yes | No | No | Required for an account | Account management, App functionality | Firebase UID (`User.authUid`), handle. |
| **Personal info → Other info** | Yes | No | No | Optional (only with Google/Apple sign-in) | App functionality | `User.avatar` = the profile picture URL from the Google/Apple token (`user-resolver.service.ts`); shown next to comments. Onstage stores the link, not the image. |
| **App activity → App interactions** | Yes | No | No | Optional | App functionality, Personalisation | Follows, attendance (interested/going), comment likes, ticket click-throughs (`Follow`, `Attendance`, `CommentLike`, `TicketClick`, `UserFollow`, `Referral`, `UserBadge` in `schema.prisma`). |
| **App activity → Other user-generated content** | Yes | No | No | Optional | App functionality | Comments (`Comment`), ratings and review text (`Rating.reviewText`, `apps/mobile/src/components/rating-sheet.tsx`), comment reports (`CommentReport`), artist claim evidence (`ArtistClaim`, `apps/mobile/app/artist/claim/[slug].tsx`), artist profile edits by verified managers (`apps/mobile/app/artist/edit/[slug].tsx`). |
| **App activity → Other actions** | Yes | No | No | Optional | App functionality, Account management | Consent log (`UserConsent`), notification preferences and language (`User.notificationPrefs`, `User.locale`). |
| **App info and performance → Crash logs** | Yes | No | No | Required (not user-controllable when the DSN is set) | Analytics (diagnostics) | `apps/mobile/src/lib/sentry.ts` (`sendDefaultPii: false`); server side `apps/api/src/instrument.ts`. |
| **App info and performance → Diagnostics** | Yes | No | No | Required | Analytics (diagnostics) | Sentry device and OS info, screen breadcrumbs, `tracesSampleRate: 0.1` performance traces (`sentry.ts`). |
| **Device or other IDs** | Yes | No | No | Optional (only if notifications are allowed) | App functionality | Expo push token (`PushToken` table; `apps/mobile/src/lib/push.ts` → `POST /me/push-tokens`). Removed when the user signs out (`signOutUser`), withdraws push consent, requests deletion, or uninstalls (`DeviceNotRegistered` cleanup in `apps/worker/src/jobs/outbox.ts`). No advertising ID is used. |

### Notes and judgement calls

1. **Location, ephemeral or not.** Play lets you mark data as "processed
   ephemerally" when it is kept in memory only for the request. The API doesn't store
   coordinates, but (a) the Redis feed cache key contains coordinates rounded to two
   decimals (about 1 km) for 120 s (`apps/api/src/common/redis/cache-keys.ts`), and
   (b) the mobile Sentry SDK records HTTP breadcrumbs, whose URLs include the `lat`/`lng`
   query, and attaches them to crash reports. `apps/mobile/src/lib/sentry.ts` has no
   `beforeBreadcrumb` scrubbing (the API's Sentry config does deny `lat`/`lng`). So
   answer **not ephemeral**. If the mobile Sentry config is changed to strip
   `lat`/`lng` from breadcrumbs, "ephemeral" becomes defensible.
2. **Precise vs approximate.** The app asks for `Accuracy.Balanced` (about 100 m), but
   the manifest declares `ACCESS_FINE_LOCATION`, and Play checks the declaration
   against the manifest. Declare both. Dropping `ACCESS_FINE_LOCATION` from `app.json`
   would allow declaring approximate only.
3. **Sharing.** Nothing is shared under Play's definition:
   - Ticket links carry UTM tags and a random `onstage_click` id
     (`packages/shared/src/affiliate.ts`), which is not a user identifier.
   - Ride and map links carry only the venue's coordinates and address
     (`apps/api/src/modules/events/events.service.ts#travelOptions`).
   - Opening those links is a user-initiated transfer to another app, which Play
     exempts.
   - OpenFreeMap tile requests come directly from the device (IP plus map area);
     this is a user-initiated map view of a venue and contains no user data.
4. **Email notifications and marketing.** There is an "Also send me email" preference
   and a `marketing_email` consent, but **no email is sent anywhere in the code** (no
   email provider in the API or worker). Nothing to declare. If email sending is added,
   email use stays covered but add the provider to the privacy policy.
5. **"Analytics" consent toggle.** The `analytics` consent exists
   (`packages/shared/src/growth.ts`) but no analytics SDK is installed. Only Sentry
   diagnostics are collected, and Sentry is **not** gated on that consent. Either gate
   Sentry on it, or keep declaring crash logs and diagnostics as **required**, as above.
6. **Encryption at rest** isn't asked by Play, but the database host should provide it.

## Section 3 — Security practices summary (what the listing will show)

- Data is encrypted in transit: **Yes**
- You can request that data be deleted: **Yes**
- Data shared with third parties: **No data shared**
- Data collected: Location, Personal info, App activity, App info and performance,
  Device or other IDs
