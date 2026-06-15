# Intake Log

Append-only record of incoming requests, their classification, and chosen phase path.

---

## 2026-06-09 — Local in-browser signing for non-NIP-07 users

**Raw request (user's words):**
> Currently, tagging events (both self tagging and attesting others) requires a NIP-07 signer. I
> want to create an option for users who do NOT have a NIP-07 extension to publish these events
> with signing handled automatically for them under the hood. […] Lets go with the Jumble
> (in-browser, local storage in lfo app) approach. Lets use the NIP-49 standard. Instead of
> making a NIP-49 password optional, lets make it required to avoid raw nsec storage. I want to
> offer this local signing using nostr-tools as an option for users that don't have a NIP-07
> extension while maintaining the option to sign in with browser extensions like Alby.

**Exploration / decision context:** Keycast (custodial, server-side key custody) and a
memory-only session signer were evaluated and rejected. Chosen: in-browser local signer,
key persisted in `localStorage` as a **required** NIP-49 `ncryptsec` (never raw nsec), with the
existing NIP-07 path retained. See `~/.claude/plans/abundant-twirling-fountain.md`.

**Classification:** Feature
**Strictness:** Standard → all phases (Planning → Architecture → Test Design → Implementation → Review)
**Book:** new, no PRD → acceptance frame at `engineering-team/audits/local-signing/book.md`
**Epic:** `local-signing` (new)
**Phase path confirmed with user:** yes — user said "Proceed with implementation using the engineering-team harness."

---

## 2026-06-12 — Native community-authored feed (v1)

**Raw request (user's words):**
> I want to build a native, community authored feed within the LFO app. This is v1. The native
> feed displays posts from verified community members that discuss one of two topics: Bitcoin or
> Nostr. […] Lets create v1 as a hashtag-only feed. […] for now lets just create one unified feed
> for bitcoin and nostr related t-tagged notes. We can create more narrow feed views in v2. […]
> I want a smaller, more curated feed […] Let's start with [100] notes. […] favor newer tweets
> while also showing a diversity of member accounts. […] every member represented to some degree.

**Exploration / decision context (pre-planning research):** Empirically tested relay coverage and
hashtag prevalence (throwaway scripts in `scripts/`). Decided: content relay = **nos.lol only**
(clean probe: 45/48 verified members covered, current); topic detection = **hashtag-only**.
Rejected for feed content: tags.brainstorm (0 social notes), primal (unreliable bulk queries),
damus (marginal gain unproven), nostr.band (Cloudflare-gated, unreachable). See memory
`project-community-feed-relay`.

**Classification:** Feature
**Strictness:** Standard → all phases (Planning → Architecture → Test Design → Implementation → Review)
**Book:** new, no PRD → acceptance frame at `engineering-team/audits/community-feed/book.md`
**Epic:** `community-feed` (new). Stories: #1 `feed-view` (drafted), #2 `curated-selection` (planned).
**Open questions:** specific hashtag list; header copy/semantics (parked by user).
**Phase path confirmed with user:** yes — entered Planning via `/plan-feature`.

---

## 2026-06-12 — Membership query may not need all 4 relays *(backlog / future review)*

**Origin:** Surfaced during community-feed Architecture (ADR 0029, Future considerations).

**Item:** The membership computation (`getTagItems()` in `public/index.html`) queries the full
4-relay set, but LFO tag events (kind 9999/39999) appear complete on `tags.brainstorm.world` and
`nos.lol` (per CLAUDE.md, both up-to-date as of 2026-06-01; damus/primal hold few/none). Trimming
the membership relay set would cut sign-in / feed-load latency.

**Caveat:** Measure per-relay tagger coverage **before** trimming — dropping a relay that holds a
unique tagger could silently drop a member from the verified set.

**Classification:** Refactor/optimization (touches existing membership code, not the feed).
**Status:** Not planned — candidate story. Not part of the `community-feed` book.
**Phase path:** TBD (own story when picked up).

---

## 2026-06-15 — Rich note rendering (images + mentions)

**Raw request (user's words):**
> add support for images and "@". Right now images appear as links. "@" calls list the whole npub,
> whereas i would like the username to be displayed. If a post contains multiple images, lets show
> the first two in a side by side grid and signal through the ui that there are others that can be
> viewed in primal.

**Decisions:** images — render up to 2 side-by-side, dimmed "+N" overlay on the 2nd tile for extras,
strip media URLs from text, sanitize to http(s). Mentions — members → `@DisplayName`, non-members →
short `@npub1…` handle (no non-member fetch).

**Classification:** Feature (all phases). Was OUT OF SCOPE in Story 1 (rich rendering); promoted to
its own work. **Split** into two stories at the user's direction:
- `community-feed #3` — `3-inline-images` (Approved, executing now).
- `community-feed #4` — `4-mention-resolution` (Draft, after #3).

**Reminder:** circle back to `community-feed #2` (curated-selection) after #3.
**Phase path confirmed with user:** yes — split #3/#4, execute #3 first.
