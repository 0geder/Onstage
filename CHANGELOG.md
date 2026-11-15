# Changelog

What changed in Onstage, release by release. The newest release is at the top.

**How this file is kept:**
- Every change people would notice gets a line under **Unreleased** in the same commit that makes it. That covers the app, the website, gig data, privacy, and anything a user or the store reviewer could see.
- Lines go under **Added**, **Changed**, **Fixed**, **Removed** or **Security**, written for a reader, not as a commit log.
- Internal-only work (refactors, tests, tooling) is left out unless it changes behaviour.
- `npm run release -- <patch|minor|major>` turns **Unreleased** into a numbered, dated release, bumps the app version, tags the commit and prints the notes for the store's "What's new".

Versions follow [semantic versioning](https://semver.org): patch for fixes, minor for new features, major for big changes. The app's build number is separate: EAS counts store builds automatically. Profile shows both, plus the commit, as `Onstage 1.0.0 (42) · a1b2c3d`.

## [Unreleased]

The first public release. Everything below is new.

### Added

- **Discover**
  - Gigs near you within 10, 25, 50 or 100 km, or near a city you pick.
  - A "This weekend" row.
  - A "For you" feed built from the artists you follow, with stories of their upcoming shows.
- **Gig pages**
  - Poster, line-up, ticket options and prices from the ticket seller, and a venue map with directions.
  - Ride buttons for Bolt, Uber and inDrive. inDrive gets the venue address copied for you.
  - Venue details and livestream links where available.
- **Plans**
  - Mark a gig Interested (or double-tap its poster) or Going.
  - See who you follow is going.
  - Plan with friends.
- **Artists**
  - Follow artists and see their upcoming and past shows.
  - Artists can claim their profile.
- **Comments** on every gig: a planning thread and a post-show recap.
  - Tags: "I have tickets", "Looking for tickets", "Going".
  - Replies, likes and reporting.
  - Delete your own comments.
  - Block people. Blocked people are listed and can be unblocked under Settings, Privacy.
- **Alerts:** on-sale, price-drop, tickets-back and new-show alerts for artists you follow, with a weekend digest. Each type can be switched off.
- **Accounts:** sign in with Google or Apple.
  - Profile with your gigs, follows and badges.
  - A referral code to invite friends.
- **Languages:** English, isiZulu and Afrikaans.
- **Privacy**
  - Choose what you agree to: location, push, email and analytics.
  - Download your data or delete your account in the app.
  - Privacy policy and terms are linked at sign-in and in Settings.
- **Gig data:** listings come from Quicket and are refreshed through the day.
  - Howler, Ticketmaster and Bandsintown are built in and switch on once their keys are set.
- **Website:** public gig and artist pages, a privacy policy, terms, account deletion and support pages.
- **App version** at the bottom of Profile.

### Changed

- **Removed listings:** gigs the ticket seller stops listing for 3 days are taken out of Discover, search and alerts. They're never marked cancelled.
  - If you saved one, it stays in your plans.
  - Its page says the seller removed it, instead of offering tickets.

### Fixed

- **Missing pictures:** a dead poster link shows the gig's name or a plain band instead of a blank box.
- **Slow connections:** a request on a weak connection gives up after 20 seconds and shows saved data or an offline message, instead of loading forever.
- **Navigation bar:** the last comment on a gig page is no longer hidden behind Android's navigation bar.

### Security

- **Crash reports** never carry your location.
- **Server checks:** the server refuses to start in production with missing or placeholder secrets.
- **Account deletion** also revokes Sign in with Apple, as Apple requires.
