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

## PO rulings after intake (2026-09-09)
- **Roots:** the bootstrap seed `e83fff7a…` is the **only** root (exempt from the policy). The
  primary curator (Tanja, `b8a9df82…`) is **policy-governed** like everyone else. Verified at
  ruling time: score 96 → needs 1; has 2 verified vouchers (seed + PO) → verified.
- **Story #3 scope:** the same trust-weighted closure governs **which note authors are allowed
  in the feed** (and asserters), via the shared module — not only the members grid.
- **Server-side feed** applies the policy for consistency; ORE unreachable → feed error state,
  never a silent 1-vouch fallback. *(Engineering recommendation, carried.)*
- **Day-one rollback of the 11 neutral members** (scores 58–72, each single-vouched by the
  curator): handled **operationally, not in code** — second vouches are collected before the
  branch is merged. No exemptions in the algorithm. *(The PO's own key was in the first dry
  run's rollback set; it acquired a second vouch 2026-09-04 and now verifies.)*

## Seed pubkey — identity (resolved 2026-09-09)
**PO, 2026-09-09: the seed `e83fff7a…` is an assistant key on a Brainstorm dev machine.** The
public-data investigation the same day had been inconclusive — no kind-0, no NIP-05, not the
production TA (`a68dbf56…`), owner (`e5272de9…`), or any customer relay key named in a
kind-10040; five events on 2026-05-30 (tag concept, curator vouch, pin, kind-30000 export) plus
a 2026-06-02 kind-3 from the Ditto client — which is consistent with a dev-machine assistant
whose profile was never published. ORE: not a provisioned POV (422), rank 0 everywhere. It
stays the **only hardcoded root**: with score 0 and zero vouches a policy-governed seed would
collapse the graph.

## Intake dry run (read-only, live relays + ORE; final re-run 2026-09-09, seed-only root)
64 tag items / 57 pubkeys. Today: 52 verified, 0 pending. **After story #1: 41 verified
(40 trusted, 1 neutral), 11 rolled back → pending** (all neutral 58–72, single-vouched by the
curator). 38 of the 41 rest on a single verified voucher. Curator: 96, 2 vouchers → verified.
(Earlier runs: 2026-09-04 first 36/16, then 41/11 after the PO's second vouch.)
Script: session scratchpad `policy-dry-run.mjs` (to be promoted into `scripts/` by story #1).

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/trust-weighted-membership/audit.md`
- Product feedback: `engineering-team/audits/trust-weighted-membership/prd-seed.md`
