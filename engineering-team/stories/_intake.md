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
