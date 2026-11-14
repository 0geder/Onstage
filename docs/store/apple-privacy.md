# Apple App Store — App Privacy ("nutrition label") and App Review notes

Grounded in the code at commit `89c3068`. Keep in step with
`apps/web/app/privacy/page.tsx` and `docs/store/play-data-safety.md`.

## Part 1 — App Privacy questionnaire

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** Onstage does **not** track. There is no advertising SDK, no IDFA, no
data broker, and no linking of Onstage data with other companies' data for
advertising. The `NSUserTrackingUsageDescription` / ATT prompt is not needed and
must not be added. Answer **No** to "used for tracking" for every type below.

### Data types to declare

| Apple category → type | Linked to user? | Purposes | Evidence |
| --- | --- | --- | --- |
| **Contact Info → Name** | Yes | App Functionality | `User.displayName` (from Firebase token or Apple's `FULL_NAME` scope, `apps/mobile/src/lib/auth.ts`). Shown on comments. |
| **Contact Info → Email Address** | Yes | App Functionality | `User.email`; Firebase Auth. |
| **Location → Precise Location** | No | App Functionality | `apps/mobile/src/lib/location.ts` (foreground only). Sent with feed requests, not stored against the account; can reach Sentry crash breadcrumbs (no user id there). See note 1. |
| **Location → Coarse Location** | No | App Functionality | Same flow. Declare both, since the Balanced fix is about 100 m. |
| **User Content → Other User Content** | Yes | App Functionality | Comments, ratings and review text, comment reports, artist claim evidence, artist profile edits (`schema.prisma`: `Comment`, `Rating`, `CommentReport`, `ArtistClaim`). Also the profile-picture URL from Google/Apple sign-in (`User.avatar`). |
| **Identifiers → User ID** | Yes | App Functionality | Firebase UID and handle. |
| **Identifiers → Device ID** | Yes | App Functionality | Expo push token stored per user (`PushToken`, `apps/mobile/src/lib/push.ts`). Conservative: Apple's examples are the IDFA/IDFV, but a per-install push token tied to the account is safest declared. |
| **Usage Data → Product Interaction** | Yes | App Functionality, Product Personalisation | Follows, interested/going, likes, ticket click-throughs, invites, badges (`Follow`, `Attendance`, `CommentLike`, `TicketClick`, `Referral`, `UserBadge`). The feed is personalised by follows and genres. |
| **Diagnostics → Crash Data** | No | App Functionality | Sentry, `apps/mobile/src/lib/sentry.ts`, `sendDefaultPii: false`, no user set. |
| **Diagnostics → Performance Data** | No | App Functionality | Sentry `tracesSampleRate: 0.1`. |
| **Diagnostics → Other Diagnostic Data** | No | App Functionality | Device model and OS, breadcrumbs. |

**Not collected:** Health & Fitness, Financial Info (no payments in the app), Contacts,
Sensitive Info, Browsing History, Search History (artist search is answered in real
time and not stored), Purchases, Phone Number, Physical Address, Photos or Videos (no
upload; only a URL from the sign-in provider), Audio, Gameplay, Customer Support,
Advertising Data, Other Data.

**Notes**
1. **Location "collected".** Apple only counts data as collected if it is kept
   longer than needed to serve the request in real time. The API doesn't keep it,
   but mobile Sentry breadcrumbs can include the `/feed?lat=…&lng=…` URL, so declare
   it. "Not linked" is accurate because nothing stores it with the account and
   Sentry events carry no user id. If `beforeBreadcrumb` scrubbing is added to
   `apps/mobile/src/lib/sentry.ts`, location can be removed from the label.
2. **Sentry IP addresses.** The owner should turn on "Prevent storing of IP
   addresses" in the Sentry project settings. Otherwise Sentry's server may record
   the client IP, which would make "not linked" harder to defend.
3. **Email marketing and the "analytics" consent toggle** exist in the UI, but no
   email or analytics code exists. Nothing to declare (same as the Play doc, notes 4 and 5).

## Part 2 — App Review information

### Sign-in and demo account

- The app is usable **without an account**: Discover, Search, event and artist pages,
  stories, directions and ride links. Following, saving, commenting, rating, Plans,
  invites, claims and Privacy settings need sign-in (`apps/mobile/app/(tabs)/profile.tsx`).
- **Provide a demo account** (email and password) so the reviewer can reach the
  account-gated features, including account deletion:
  - Email: `[DEMO ACCOUNT EMAIL]` / Password: `[DEMO ACCOUNT PASSWORD]`
  - Create it in the **production** Firebase project and complete onboarding on it.
  - The reviewer will probably tap Delete my account. That only schedules deletion
    (grace period `DELETION_GRACE_DAYS`, default 7 —
    `apps/worker/src/config.ts`), and Cancel deletion request reverses it. Check the
    demo account before each submission.
- **Sign in with Apple is present** on iOS (`appleSignInAvailable()` returns true on iOS;
  `signInWithApple` in `apps/mobile/src/lib/auth.ts`, plugin `expo-apple-authentication`
  in `app.json`), alongside Google. This satisfies Guideline 4.8.
  - **Gap (Guideline 5.1.1(v)):** when an account created with Sign in with Apple is
    deleted, Apple requires the app to revoke the user's Apple refresh token via
    the REST API. `apps/worker/src/jobs/account-deletion.ts` says this is **not
    implemented** (the authorisation code isn't captured at sign-in). Reviewers
    rarely test it, but it is a stated requirement. Fix before or soon after launch.
  - The Sign in with Apple capability must be enabled on the App ID, and the Apple
    provider configured in Firebase (Services ID, key). Owner-only.

### Account deletion (Guideline 5.1.1(v))

The in-app path is **Profile tab → Settings → Privacy → "Delete my account" → "Yes, delete
my account"**:
- Screen: `apps/mobile/app/settings/privacy.tsx`
- API: `POST /me/deletion-request` (`apps/api/src/modules/consent/consent.controller.ts`)
- Worker: `apps/worker/src/jobs/account-deletion.ts`

Deletion runs after a grace period (default 7 days) and always within 30 days. It
removes the Firebase Auth user and all user rows. Comments that others replied to
are anonymised rather than deleted.

Suggested review note text:

```
Onstage can be browsed without an account. To test account features, sign in with the demo account below (email sign-in), or use Sign in with Apple.

Demo account: [DEMO ACCOUNT EMAIL] / [DEMO ACCOUNT PASSWORD]

Account deletion: Profile tab > Settings > Privacy > "Delete my account". Notifications stop immediately; the account and its data are deleted after a 7-day grace period (cancellable from the same screen) and always within 30 days.

Location: requested once during onboarding ("Shows near you") and only while the app is in use, to centre the gig feed on the user. Declining is fully supported — the user picks a city instead.

Push notifications: requested only when the user turns them on in onboarding or Privacy settings, for the alerts they choose (new shows from followed artists, on-sale reminders, etc.).

Tickets and rides: Onstage does not sell tickets or provide transport. Ticket buttons open the ticket seller's website; ride buttons open Bolt, Uber or inDrive with the venue address. No payments happen in the app, so there is no in-app purchase.

User-generated content: comments under each event can be reported (Report > reason). Suspected scam posts are hidden automatically by a scoring filter, posts reported 3 times are flagged for review, and moderators can hide comments and ban accounts.

Contact: [REVIEW CONTACT NAME], [REVIEW CONTACT PHONE], [REVIEW CONTACT EMAIL]
```

### Location justification

- `NSLocationWhenInUseUsageDescription`: "Onstage uses your location to show gigs
  happening near you. You can decline and search by city instead." (`apps/mobile/app.json`).
  **Note:** the `expo-location` plugin in `app.json` sets a *different* string ("…gigs
  happening near you." without the decline sentence), and the plugin value may win at
  prebuild. Check `Info.plist` in the production build and make the two match. Both
  are acceptable to Apple.
- No "Always" or background location: no `NSLocationAlwaysAndWhenInUseUsageDescription`,
  no background mode, and `requestForegroundPermissionsAsync` only (`apps/mobile/src/lib/location.ts`).

### Other review checks

- **Privacy policy inside the app (Guideline 5.1.1(i)):** linked, with the terms, from
  sign-in, sign-up and Settings → Privacy (`apps/mobile/src/components/legal-links.tsx`,
  `app/settings/privacy.tsx`).
- **UGC (Guideline 1.2):** filtering (auto-hide by scam score), reporting (in-app) and
  moderator ban all exist. Users can **block** anyone from a comment's action row
  (their comments and replies disappear for the blocker; unblock under Settings →
  Privacy → Blocked people), and can **delete** their own comments.
- **Encryption export compliance:** `usesNonExemptEncryption: false` is set in `app.json`
  (HTTPS only). Answer "No" in App Store Connect.
- **Tablet:** `supportsTablet: false`, so iPhone only.
- **Universal links:** `associatedDomains: applinks:onstage.co.za` requires
  `https://onstage.co.za/.well-known/apple-app-site-association`, which **does not
  exist** in `apps/web/public`. See checklist.md.
