# Epic: trust-weighted-membership

**Status:** Active
**Created:** 2026-09-04
**Book:** `engineering-team/audits/trust-weighted-membership/book.md`
**Branch:** `feat/trust-weighted-membership` (off `main`)

## Goal
Make the number of vouches a pubkey needs to become a verified member depend on its **trust
standing from the house point of view**: trusted (chip 75–100) → 1 vouch, neutral (50–74) → 2,
low trust (0–49, incl. unscored) → 3. Vouches count only when they come from **distinct verified
members other than the pubkey itself**. The closure stays memoryless and is recomputed on every
load from live tag events and live ORE ranks; ORE becomes a hard sign-in dependency.

## Why
Today one vouch from any verified member admits anyone, regardless of how the community's own
web of trust regards them. Weighting the requirement by GrapeRank standing keeps the bar low for
people the community already trusts and raises it for unknowns, without making trust scores a
substitute for a member's vouch. The PO accepts the day-one rollback this causes (16 of 52 at
intake) and the ORE dependency it introduces.

## Stories
- #1 — `1-trust-weighted-closure` — **Policy + closure + sign-in gate:** the editable policy
  constant and the trust-weighted, self-excluding closure in the shared `membership.js`; house-POV
  rank fetch as a hard sign-in dependency with unreachable/refused failure states; sign-in copy
  for non-member / pending / locked-out ("Your trust level in the community requires N vouches
  from other members." / "N more vouches needed"). Promotes the intake dry-run script into
  `scripts/`. *(Planned)*
- #2 — `2-vouch-counts-on-cards` — **Cards:** counting vouch number on verified ("N vouches") and
  pending ("N of M vouches") cards; hover reveals every voucher's identity, non-counting ones
  dimmed; Vouch button on verified cards. *(Queued — depends on #1)*
- #3 — `3-feed-policy-alignment` — **Server:** `api/feed.js` applies the same trust-weighted
  closure through the shared module (ORE rank fetch server-side) to decide **which note authors
  and asserters are allowed in the feed** (PO, 2026-09-09); ORE unreachable → feed error state,
  never a silent 1-vouch fallback. *(Queued — depends on #1)*

**Execution order:** #1 → #2 → #3. #1 defines the closure and the data (vouchers per pubkey,
requirement per pubkey) that #2 renders and #3 reuses server-side.
