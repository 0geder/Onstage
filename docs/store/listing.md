# Store listing — Onstage v0.1.0

Every feature below exists in `apps/mobile` today. Do not add claims for things the
app does not do (no in-app ticket sales, no ride booking, no audio, no artist
location tracking). Character counts were checked with a script; re-check after edits.

## App name

- **Play title (≤30):** `Onstage: Live Music & Gigs` (26)
- **Apple name (≤30):** `Onstage: Live Music & Gigs` (26)
  - If the name "Onstage" alone is free on both stores, that is also fine. Check the
    name is not taken before reserving it.

## Apple subtitle (≤30)

`Gigs near you in South Africa` (29)

## Play short description (≤80)

`Find gigs near you, follow your artists and never miss a South African show.` (76)

## Apple promotional text (≤170)

`Follow the artists you love and see where they're playing next. Gigs near you, ticket links, line-ups and a ride to the venue — all in one place.` (145)

## Full description (Play ≤4000; also used as Apple description)

```
Onstage shows you where live music is happening in South Africa — and helps you get there.

FIND GIGS NEAR YOU
Discover shows happening around you. Allow location and Onstage centres the feed on where you are, or skip that and pick your city: Cape Town, Johannesburg, Durban, Pretoria, Gqeberha or Bloemfontein. Location is only used while the app is open, never in the background.

FOLLOW YOUR ARTISTS
Pick the genres you listen to, follow your favourite acts, and your feed fills with their upcoming shows. Every name on a line-up links to that artist's profile, so the support act you discover tonight is one tap away.

EVERYTHING ABOUT THE SHOW
See the date, doors time, venue, full line-up, age restriction and venue information such as wheelchair access, cloakroom and re-entry where we know it. Check ticket options and prices from the ticket seller, then buy on the seller's own site. Onstage never takes your payment.

GET THERE
Open directions in your maps app, or get a ride with Bolt, Uber or inDrive with the venue already filled in.

NEVER MISS A SHOW
Turn on the notifications you want: new shows from artists you follow, on-sale reminders, price drops, tickets back on sale, a weekly what's-on digest and replies to your comments. You choose which ones, and you can change them any time.

MAKE PLANS
Mark shows as Interested or Going and keep them together in Plans. See how many people are going, and which of the people you follow (and who follow you back) are going too.

JOIN THE CONVERSATION
Every show has a planning thread before the night and a recap after it starts. Ask questions, find people with spare tickets, and rate the artist and the show afterwards. Report anything that looks like a scam — suspicious posts are hidden automatically and checked by a moderator.

STORIES AND STREAKS
Tap through upcoming show posters in the stories rail, earn badges for going to shows month after month, and invite friends with your own code.

FOR ARTISTS
Are you an artist or a manager? Claim your profile and, once we've checked it, keep your bio, links and livestreams up to date.

YOUR DATA, YOUR CALL
Browse without an account. When you sign up (Google, Apple or email), you can see every consent you've given, download your data and delete your account from Privacy settings.

Available in English, isiZulu and Afrikaans.

Onstage lists announced and confirmed performances from ticketing partners and our own curation. Details can change — check with the venue or promoter before you travel.
```

(2,516 characters — well under 4,000.)

## Apple keywords (≤100, comma-separated, no spaces)

`concerts,live music,gigs,events,festival,tickets,bands,DJ,shows,nightlife,jazz,amapiano,Cape Town` (97)

Do not repeat words already in the app name or subtitle (Apple indexes those already).
Do not use other companies' brand names (Quicket, Howler, Uber, Bolt) as keywords.

## Category

- **Google Play:** Music & Audio *(alternative: Events)* — recommend **Events**, since
  the app plays no audio and Play reviewers expect audio in Music & Audio.
- **Apple:** Primary **Music**, secondary **Entertainment**. (Apple has no Events
  category; Music is where gig and concert apps usually go.)

## Contact details

- **Support/contact email:** `[SUPPORT EMAIL — e.g. support@onstage.co.za]` (must be a
  monitored inbox; the privacy policy currently uses `privacy@onstage.co.za`)
- **Website:** https://onstage.co.za
- **Privacy policy URL:** https://onstage.co.za/privacy
- **Account deletion URL (Play):** https://onstage.co.za/delete-account
- **Terms / EULA:** https://onstage.co.za/terms
- **Apple support URL (required):** `[SUPPORT URL]` — there is no support page in
  `apps/web` yet; the terms page or a mailto link is not enough for Apple. Add a simple
  `/support` page or point it at a page that has a contact email.
- **Developer name:** `[COMPANY REGISTERED NAME]`
- **Physical address (Play, required for organisation accounts):** `[REGISTERED ADDRESS]`

## What's new — v0.1.0

```
Welcome to Onstage, the first release. Find gigs near you or in your city, follow your artists, get the alerts you choose, plan your nights, and get a ride to the venue.
```

(169 characters — Play allows 500; Apple has no limit for "What's New".)

## Notes for the lead

- Only Discover, Search, Plans and Profile tabs exist. Screenshots should come from
  those plus an event page (line-up, tickets, Getting there) and the onboarding screen.
- Do not show the venue map with placeholder or test data, or any test or seeded
  account names, in screenshots.
- The app is portrait-only and phone-only (`supportsTablet: false`), so no iPad
  screenshots are needed.
