# Book of Work: Trust-weighted membership (vouch requirements by house-POV trust standing)

**Slug:** trust-weighted-membership
**Status:** Open
**Opened:** 2026-09-04
**Closed:** —

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below (confirmed by the PO at
intake, 2026-09-04).

### Acceptance frame

- [ ] Every pubkey's **required vouch count** is derived from its GrapeRank score **from the house
      point of view** (`HOUSE_POV`, always — never the member's own view), bucketed on the same
      **rounded 0–100 integer the trust chip displays**: trusted 75–100 → 1 vouch, neutral 50–74 →
      2 vouches, low trust 0–49 → 3 vouches. An unscored pubkey counts as 0 → low trust → 3.
      Buckets and counts live in **one editable policy constant** shared by browser and server.
- [ ] A pubkey is **verified** when at least that many **distinct verified members, excluding
      itself**, have vouched for it (self-vouch never counts). The closure is **memoryless**:
      recomputed from scratch on every load from the live tag events and live ORE ranks — no
      stored membership state, so upward drift lowers a pending applicant's requirement and
      downward drift can temporarily lock a verified member out until they regain the required
      count. Rollback of today's 1-vouch members is accepted (11 at intake — see dry run).
- [ ] **Member cards** (verified *and* pending) show the **counting vouch number** and, on hover,
      the **identities of all vouchers**, non-counting vouchers (not verified, or self) **dimmed**.
      Pending cards read "N of M vouches"; verified cards read "N vouches". A **Vouch button
      appears on verified cards too**, so members can build redundancy against score drift.
- [ ] **Sign-in** for a non-member, pending applicant, or locked-out former member states the
      requirement and the remainder, in the PO's wording: *"Your trust level in the community
      requires [N] vouches from other members."* / *"[N] more vouches needed"*.
- [ ] **ORE is a hard dependency at sign-in.** When ORE is unreachable, or refuses the house
      perspective, sign-in shows a clear failure message instead of a membership verdict — **no
      fallback to the global algorithm**, since global scores would change who is a member.

## Epics in this book
- `trust-weighted-membership` — policy constant + trust-weighted closure in the shared
  membership module; ORE-dependent sign-in gate and copy; vouch counts/voucher hover/vouch
  button on cards; server-side feed alignment.

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at open:** high for the policy and card/sign-in surfaces (fully specified by the
  PO); medium for the two items below the PO left to engineering's recommendation.

## Decided constraints (carried into Architecture)
- **Score source:** ORE `POST api.brainstorm.world/rank/pubkeys`, `algorithm: graperank-pov`,
  `pov: HOUSE_POV.pubkey` — the same call and cache the trust chips use (ADR 0043/0046). The
  intake dry run scored all 57 involved pubkeys in one batch with no missing rows.
- **Bucketing on the displayed integer** (`Math.round(rank × 100)`), so a member's standing
  always matches the number on their chip.
- **GrapeRank remains display-plus-policy, never a vouch substitute:** a high score lowers the
  required count to 1, never to 0. Vouches from verified members are still the only way in.
- **No new event formats, no NIP-51 writes.** The kind-39999 attestation stays exactly as
  published today; only how the events are *counted* changes.
- **Solution-page copy is out of scope** (PO: outdated; ignore).

## Assumptions the PO did not rule on (engineering recommendation adopted; PO may overrule)
- **Roots:** the bootstrap seed **and the primary curator** are treated as roots (exempt from the
  policy). Everyone else is policy-governed. Rationale: the curator's single seed vouch is the
  whole graph's trunk; a one-load dip below 75 would otherwise evict all 52 members at once.
- **Server-side feed (`api/feed.js`)** applies the same policy for consistency, so rolled-back
  members' posts and assertions are not served as member content; when ORE is unreachable the
  feed returns an error state rather than silently reverting to the 1-vouch closure.
- **Day-one rollback of the 11 neutral members** (scores 58–72, each single-vouched by the
  curator): handled **operationally, not in code** — second vouches are collected before the
  branch is merged. No exemptions in the algorithm. *(The PO's own key, `6db8a13f…`, score 57,
  was in the first dry run's rollback set with a four-member cascade; it acquired a second vouch
  from `e5272de9…` and re-verified 2026-09-04: PO verified, all five members it vouched for hold.)*

## Intake dry run (2026-09-04, read-only, live relays + ORE; re-run same day after the PO's 2nd vouch)
63 tag items / 57 pubkeys; 52 verified today, 0 pending. Proposed policy → **41 verified, 11
rolled back**: all neutral (58–72), each single-vouched by the curator. No cascade. Curator 96 →
stays. (First run, before the PO's second vouch landed: 36 verified / 16 rolled back.)
Script: session scratchpad `policy-dry-run.mjs` (to be promoted into `scripts/` by story #1).

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/trust-weighted-membership/audit.md`
- Product feedback: `engineering-team/audits/trust-weighted-membership/prd-seed.md`
