# Content rating — Google Play (IARC) and Apple age rating

Based on the code at commit `89c3068`. The deciding factor is user-generated content:
public comment threads under every event.

## What the app contains (facts the answers rest on)

| Fact | Evidence |
| --- | --- |
| Users post public text comments and replies under events (planning and recap threads), with an optional tag ("have tickets", "want tickets", …). Anyone can read them; posting needs sign-in. | `apps/mobile/src/components/event-thread.tsx`; `apps/api/src/modules/comments/comments.controller.ts` (`OptionalAuthGuard` to read, `AuthGuard` to post) |
| Users can rate artists and shows (1–5) with optional review text. Review text is stored, and an API endpoint (`GET /artists/:id/reviews`) exposes it, but the mobile app does not show other people's reviews today. | `apps/mobile/src/components/rating-sheet.tsx`; `apps/api/src/modules/ratings/ratings.controller.ts` |
| **Reporting:** every comment has a Report action with reasons (scam, spam, harassment, off topic, off-platform payment, other). | `event-thread.tsx` (`promptReport`), `POST /comments/:id/report` |
| **Automatic filtering:** each new comment is scored for scam signals; a high score hides it at once, a lower one flags it for review. Three reports flag a comment. | `apps/api/src/modules/comments/comments.service.ts` (`assess`, `report`); `packages/shared/src/moderation.ts` |
| **Human moderation:** a moderation queue, hiding comments, banning and unbanning users (banned users are refused on every authenticated request). | `apps/api/src/modules/admin/admin.controller.ts` (`moderation/*`); `apps/api/src/common/auth/user-resolver.service.ts` |
| Rate limiting on posting. | `comments.service.ts` (`enforceRateLimit`) |
| **No** private messaging or chat between users. | No such module in `apps/api/src/modules` |
| **Yes**, user-to-user blocking, and users can delete their own comments. | `event-thread.tsx` (Block, Delete), `apps/api/src/modules/blocks/` |
| No photo, video or audio upload by users. The profile picture is a link from Google or Apple. Event posters and artist images come from ticketing partners and operators. | `schema.prisma` (`User.avatar` is a URL) |
| Location is never shown to other users. Going/interested is shown by name only to mutual follows, and to everyone else as a count. | `apps/api/src/modules/events/events.service.ts` (`groupPlans`) |
| No purchases, ads, gambling, loot boxes or rewards with cash value. Ticket and ride links open the provider's site or app. | `apps/mobile/app/event/[slug].tsx` |
| Ticket links open in an in-app browser tab (SFSafariViewController / Custom Tabs) on the ticket seller's site. There is no general-purpose browser. | `WebBrowser.openBrowserAsync` in `event/[slug].tsx` and `artist/[slug].tsx` |
| Event listings can include 18+ age restrictions and nightlife venues. Posters come from promoters and may show alcohol branding. | `Event.ageRestriction`, `Venue.ageRestriction` |

## Google Play — IARC questionnaire

**Category:** choose "All other app types" (not Game, not Social/Communication).
Onstage's main purpose is event discovery, and comments are secondary.

| Question (IARC wording, paraphrased) | Answer | Why |
| --- | --- | --- |
| Violence (any depiction) | No | The app has no violent content. User comments are covered by the UGC questions. |
| Fear / horror | No | |
| Sexuality / nudity | No | |
| Language: profanity or crude humour | No | No app-authored profanity. UGC is declared separately. |
| Controlled substances (drugs, alcohol, tobacco): depictions or references | **No** (see note) | The app doesn't promote alcohol. Third-party posters may incidentally show it. If you want to be conservative, answer "references to alcohol" — the rating won't move above Teen / 12+. |
| Gambling / simulated gambling | No | |
| Does the app allow users to interact or exchange content with other users? | **Yes** | Public comment threads, likes, follows. |
| Does the app share the user's current physical location with other users? | **No** | Location is used only to query the feed. |
| Does the app allow users to purchase digital goods? | **No** | Ticket purchases happen on third-party sites and are physical-world goods anyway. |
| Does the app contain ads? | **No** | Promoted artists and events (`isPromoted`) are first-party, marked listings, not ad network ads. Play's Ads declaration is separate: answer **No ads**, but revisit if paid promotion is sold, since it may count as ads. |
| Is the app a web browser or search engine? | No | |
| Unrestricted internet access | No | Only links to specific ticket, ride and map pages. |
| Is the app primarily a news app? | No | |
| Miscellaneous: crude humour, discriminatory content, horror | No | |

**Moderation questions that follow "users interact" = Yes:**
- Can users report or flag content? **Yes** (in-app Report).
- Is content moderated? **Yes**: automated scam filter plus human review of reported posts.
- Can users block other users? **Yes.**

**Expected result:** roughly IARC 12 / PEGI 12 / Teen / FPB 13, because of
unrestricted user interaction. The interactive-element labels "Users Interact"
and "Shares Info" will not apply, since nothing about the user is shared with other
users beyond their public comments.

**Target audience (Play "Target audience and content" section):** choose **18 and
over** if the owner wants to avoid the Families policy and child-safety obligations
(many listings are 18+ events), or **13+**. Do **not** include under-13s. The privacy
policy has a `[MINIMUM AGE]` placeholder; keep it consistent with this choice.
Note that POPIA treats under-18s as children and requires a competent person's
consent to process their data. 18+ is the simplest lawful position, so check with
the attorney.

## Apple — Age rating questionnaire

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged graphic or sadistic realistic violence | None |
| Profanity or crude humour | None |
| Mature or suggestive themes | None |
| Horror / fear themes | None |
| Medical or treatment information | None |
| Alcohol, tobacco or drug use or references | None (or Infrequent/Mild if being conservative, for the same reason as Play) |
| Simulated gambling | None |
| Sexual content or nudity | None |
| Graphic sexual content and nudity | None |
| Contests | None |
| Unrestricted web access | **No** |
| Gambling (real money) | No |
| Loot boxes | No |
| User-generated content | **Yes** |
| Messaging and chat | **No** (public comments only, no private messages) |
| Advertising | No |
| Age assurance / parental controls | No |
| Made for Kids | No |

**Expected result:** 13+ under Apple's current rating tiers. UGC with reporting and
moderation does not require 18+. If the owner wants to match "18+ events", pick an
age-rating override of 18+, but that is a business choice, not a requirement.

## Gap that affects both stores

Apple Guideline 1.2 (UGC) requires all of:
1. a filter for objectionable material ✅
2. a way to report it ✅
3. the ability to block abusive users ✅
4. published contact information ✅ (privacy@onstage.co.za on /terms and /privacy)

All four are in place. Blocking hides the blocked person's comments and replies for
the blocker, and is listed and reversible under Settings → Privacy → Blocked people.
