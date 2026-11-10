# Store submission checklist — Onstage v0.1.0

Status at commit `89c3068`. ✅ done or prepared in the repo · ⬜ to do · 👤 owner-only (needs
the owner's accounts, money, legal identity or DNS).

## 1. Graphic assets

### What exists — `apps/mobile/assets/` (checked, not regenerated)

| File | Size / format | Verdict |
| --- | --- | --- |
| `icon.png` | 1024×1024, RGBA, every pixel fully opaque (alpha 255 throughout), 18.6 KB, dark `#0B0B0F` background, logo within 229–789 px | ✅ Meets the Apple 1024×1024 requirement. It *has* an alpha channel even though nothing is transparent; Expo's iOS icon generation flattens transparency, but **check the App Store icon in the first build** (Transporter or App Store Connect rejects icons with alpha). If it's rejected, re-export as RGB with no alpha. |
| `adaptive-icon.png` | 1024×1024 RGBA foreground, content bbox 302–717 × 321–708 | ✅ Inside the Android adaptive-icon safe zone (the 66% circle). Background colour `#0B0B0F` is set in `app.json`. |
| `notification-icon.png` | 96×96 RGBA, 2 colours | ✅ Size is fine. Android shows only the alpha mask; check it reads as a white silhouette on a device. |
| `splash-icon.png` | 1024×1024 RGBA | ✅ |

### Still needed

| Asset | Store | Spec | Who |
| --- | --- | --- | --- |
| **Hi-res app icon** | Play | **512×512**, 32-bit PNG (alpha allowed), ≤1 MB. Downscale `icon.png`. Play adds rounded corners and a shadow, so don't bake them in. | ⬜ design / lead |
| **Feature graphic** | Play (required) | **1024×500**, JPEG or 24-bit PNG (**no alpha**), ≤15 MB. Keep key content central; the edges may be cropped. | ⬜ design |
| **Phone screenshots** | Play | **2–8** required; **at least 4** recommended for featuring. JPEG or 24-bit PNG (no alpha), each side 320–3840 px, aspect ratio no more than 2:1 (for example 1080×1920 or 1080×2400). | ⬜ **lead will capture** |
| **iPhone screenshots** | Apple | **1–10** at **6.9"**: 1320×2868 or 1290×2796 portrait (6.5" 1284×2778 or 1242×2688 is accepted as the fallback set). PNG or JPEG, no alpha. iPad screenshots aren't needed (`supportsTablet: false`). | ⬜ **lead will capture** |
| App preview video | Apple, optional | 15–30 s per size class | optional |
| Promo video | Play, optional | YouTube URL | optional |

**Suggested screenshot set (5–6):**
1. Discover feed near you, with stories rail
2. Event page: line-up, tickets and "Getting there" with ride buttons
3. Artist profile with follow button and upcoming shows
4. Plans tab
5. Notification settings
6. Event thread (comments)

Use realistic data. No test accounts, seeded fixtures or broken posters. Don't show
third-party logos more prominently than the app's own content.

## 2. Things in the repo that should change before submission (not owner-only)

These are outside this task's write scope (`apps/mobile`, `apps/api`, `apps/web/public`).
They're listed so the team can schedule them.

| # | Item | Why | Where |
| --- | --- | --- | --- |
| 1 | ⬜ **Block user** in comment threads | Apple Guideline 1.2 requires it for UGC. **Likely rejection without it.** | `apps/mobile/src/components/event-thread.tsx` + API |
| 2 | ⬜ **Link to the privacy policy inside the app** (Privacy settings and sign-up screens) | Apple 5.1.1(i); the `privacy.policy` string exists but isn't used | `apps/mobile/app/settings/privacy.tsx`, `app/auth/sign-up.tsx` |
| 3 | ⬜ **Sign in with Apple token revocation on account deletion** | Apple 5.1.1(v) for SIWA accounts; documented as not implemented | `apps/worker/src/jobs/account-deletion.ts`, `apps/mobile/src/lib/auth.ts` |
| 4 | ⬜ Expose "delete my comment" in the app | UGC hygiene; the API already supports it | `event-thread.tsx` |
| 5 | ⬜ Scrub `lat`/`lng` from mobile Sentry breadcrumbs (`beforeBreadcrumb`) | Precise location currently reaches Sentry in breadcrumb URLs; the API already denies these params | `apps/mobile/src/lib/sentry.ts` |
| 6 | ⬜ Align the two iOS location strings | `infoPlist.NSLocationWhenInUseUsageDescription` and the `expo-location` plugin string differ | `apps/mobile/app.json` |
| 7 | ⬜ Block unneeded Android permissions | The local prebuild manifest shows `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` (debug and dev-client leftovers). Add `android.blockedPermissions` and check the production AAB manifest. Consider dropping `ACCESS_FINE_LOCATION`: the app only requests Balanced accuracy. | `apps/mobile/app.json` |
| 8 | ⬜ Gate Sentry on the `analytics` consent, *or* relabel that toggle | The toggle says "usage analytics", but nothing reads it | `apps/mobile/src/lib/sentry.ts` |
| 9 | ⬜ Add a `/support` page | Apple needs a support URL. (The `.well-known` files already exist as routes in `apps/web/app/.well-known/`; see §4.) | `apps/web` |
| 10 | ⬜ Bump `PRIVACY_POLICY_VERSION` once the new policy is published | So existing consents show "Policy has changed" | API env (`apps/api/src/config/configuration.ts`, default `2026-01-01`) |
| 11 | ⬜ Footer link to `/delete-account` (optional) | Discoverability; currently linked from /privacy and /terms | `apps/web/app/layout.tsx` |

## 3. Prepared in this pass ✅

- `docs/store/listing.md`: names, descriptions, keywords, categories, what's new
- `docs/store/play-data-safety.md`
- `docs/store/apple-privacy.md`: privacy label and App Review notes
- `docs/store/content-rating.md`
- `apps/web/app/privacy/page.tsx`: rewritten to match the code (third parties,
  data types, retention, deletion, children, cross-border transfer)
- `apps/web/app/delete-account/page.tsx`: new, the Play-required web deletion page
- `apps/web/app/terms/page.tsx`: added community rules (UGC, zero tolerance) and an
  account/deletion section

## 4. Owner-only steps 👤

### Legal and identity
- 👤 Fill the placeholders on `/privacy`, `/delete-account` and `/terms`:
  `[COMPANY REGISTERED NAME]`, `[REGISTRATION NUMBER]`, `[REGISTERED ADDRESS]`,
  `[INFORMATION OFFICER NAME]`, `[HOSTING PROVIDER]`, `[HOSTING REGION]`,
  `[SENTRY RETENTION]`, `[GRACE PERIOD]` (currently 7 days, from `DELETION_GRACE_DAYS`),
  `[MINIMUM AGE]`, `[DATE OF PUBLICATION]`.
- 👤 Have a South African attorney review the privacy policy and terms (both pages
  say so).
- 👤 Register the Information Officer with the Information Regulator (POPIA s55).
- 👤 Make sure `privacy@onstage.co.za` and the support email are real, monitored inboxes.
- 👤 Deploy the web app, so `https://onstage.co.za/privacy`, `/terms` and
  `/delete-account` are live **before** submitting. Both stores fetch them.

### Google Play
- 👤 Create a Google Play Console developer account. One-off **US$25** fee, with
  identity verification (D-U-N-S number for an organisation account).
- 👤 **New personal accounts** must run a closed test with **at least 12 testers for
  14 days** before production access. Organisation accounts are exempt, which is
  another reason to register as an organisation.
- 👤 Create the app (`za.co.onstage`). Fill in Store listing, Data safety, Content rating
  (IARC), Target audience, Ads (No), App access (demo credentials), Government app
  (No), Financial features (None), News (No), Health (No).
- 👤 **App signing:** enrol in Play App Signing. Let EAS generate the upload keystore
  (`eas credentials`) and keep a backup.
- 👤 Service account JSON for `eas submit` (Play Console → API access), stored as an
  EAS secret, never in the repo.
- 👤 **Digital Asset Links** for the verified `https://onstage.co.za/event|artist` links
  (`autoVerify: true` in `app.json`): already served by the web app from
  `apps/web/app/.well-known/assetlinks.json/route.ts`. Set `ANDROID_CERT_SHA256` in the
  web server's environment to the **Play App Signing** certificate SHA-256 (Play Console →
  App integrity), comma-separated with the upload key's if testing sideloaded builds.
  Until it is set, the file is an empty list and links open in the browser.
- 👤 Firebase: add the Android app's SHA-1 and SHA-256 (upload and Play signing) to
  the Firebase project and Google Cloud OAuth client, or Google sign-in fails in
  production.

### Apple App Store
- 👤 Apple Developer Program: **US$99/year**. An organisation account needs a D-U-N-S
  number and legal-entity verification.
- 👤 Create the App ID `za.co.onstage` with **Sign in with Apple** and **Associated
  Domains** capabilities, plus push notifications (APNs key for Expo push, uploaded
  via `eas credentials`).
- 👤 App Store Connect: create the app, enter the privacy label (from
  `apple-privacy.md`), age rating, pricing (Free), availability (South Africa, and
  more if wanted), and the review contact and demo account.
- 👤 Agree to the Paid Apps agreement only if paid features are added. Not needed now.
- 👤 Firebase: configure the Apple provider (Services ID, Key ID, Team ID, private key).
- 👤 **apple-app-site-association**: already served by the web app from
  `apps/web/app/.well-known/apple-app-site-association/route.ts`. Set `APPLE_TEAM_ID`
  (and `IOS_BUNDLE_ID` if it ever changes from `za.co.onstage`) in the web server's
  environment.
- 👤 EAS: `eas init` (sets `EAS_PROJECT_ID`, needed for push), set `EXPO_OWNER`, and set
  the production secrets (`EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`,
  `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`) in the EAS secret store.
- 👤 `eas.json` `submit.production.ios` is empty. Add `ascAppId` and `appleTeamId`, or
  log in interactively at submit time.

### Third-party dashboards
- 👤 Sentry: turn on **"Prevent storing of IP addresses"** and check data retention
  for the mobile, API, worker and web projects (the policy's `[SENTRY RETENTION]` value).
- 👤 Create the App Review demo account in **production** Firebase, onboard it, and
  re-check before each submission that it hasn't been put up for deletion.
- 👤 Check that the production API (`https://api.onstage.co.za`) is HTTPS-only. The Data
  safety form states that all data is encrypted in transit.

### Versioning
- ✅ `version` 0.1.0, iOS `buildNumber` 1, Android `versionCode` 1. EAS `appVersionSource:
  remote` with `autoIncrement` manages build numbers after the first build.
