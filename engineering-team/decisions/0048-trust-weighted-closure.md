# ADR 0048: Trust-weighted vouch closure — policy-parameterized shared module + strict house-POV scores at sign-in

**Status:** Accepted (PO pre-approval, 2026-09-09: "Proceed through ADR and tests")
**Date:** 2026-09-09
**Story:** `engineering-team/stories/trust-weighted-membership/1-trust-weighted-closure.md`
**Amends:** ADR 0033's premise that membership is the plain 1-vouch closure (`buildMemberSets`), and the CLAUDE.md key decision "GrapeRank trust scores … are not an input to membership".
**Builds on:** ADR 0043 (ORE `/rank/pubkeys` batch, `Math.round(rank × 100)` chip integer), ADR 0046 (`HOUSE_POV` seam), ADR 0047 (provider refusal semantics: 422 / 202 / transport failure are three different things).

## Context

**Acceptance criteria (quoted back, abbreviated):** bucketed requirement on the chip integer
(≥75→1, ≥50→2, else 3; unscored = 0); boundary at 0.745 vs 0.744; counting vouches = distinct
verified members other than the target (self, duplicates, unverified vouchers never count);
seed is the only root, curator governed; **single point of change** for thresholds/counts;
memoryless (nothing persisted, verdict follows the live score); three sign-in outcomes with the
PO's copy (verified / tagged-but-short / untagged); **provider unavailable → exact D3 copy, a
Try again, no fallback, no provider text**; post-vouch feedback reflects the policy; grids
follow the closure with no new card content.

**As built today** (`public/index.html`, `public/lib/membership.js`, `api/feed.js`):
- The closure is `buildMemberSets(tagItems, seedPubkey)` in the UMD module
  `public/lib/membership.js:16-39`: seed → verified; any verified tagger admits its `p`.
  Returns `verifiedMap: pubkey → taggerPubkey` and `pendingMap: pubkey → taggerPubkey`. The
  browser calls it through `getMemberSets()` (`index.html:2226-2232`, cached in
  `_memberSetsCache`, invalidated by `publishVouch` / the self-apply flow / `disconnect`).
  The feed function calls the same export (`api/feed.js:174,190`).
- Sign-in: `proceedWithPubkey()` (`index.html:3946`) → `checkMembership()` → verified ⇒ gated
  views; else `pendingMap.has(me)` decides apply-prompt vs already-pending notice inside
  `#state-not-member` (`index.html:1548-1586`). Relay failure ⇒ `#state-error` with
  `#error-msg` text and a **Try again** button that returns to idle (`index.html:1681-1685`).
- Scores: `fetchTrustScores(pubkeys, pov)` (`index.html:3063-3096`) POSTs
  `{pubkeys, algorithm:'graperank-pov', pov}` to `ORE_RANK_API`, caches in `_scoreCache`
  keyed `${pov}:${pubkey}`, and is **lenient by design** (any failure ⇒ chipless; ADR 0043
  D3). When the house perspective has been refused it silently switches to the global
  algorithm under a `global:` key (ADR 0047 D9). The chip integer is `Math.round(rank*100)`.
- Post-vouch feedback reads `res.verified` from `publishVouch` at two call sites
  (`index.html:2475` grid, `:3385` search panel); the not-verified branch says
  "Vouched — awaiting sync".

**Live facts (intake dry run, 2026-09-09):** 64 tag items, 57 distinct pubkeys; one
`/rank/pubkeys` call scored all 57 with no missing rows. Under the table with seed-only root:
41 verified, 11 pending. The seed scores 0 and is a dev-machine assistant key (book).

**Constraints:** no build step; `membership.js` must keep running verbatim in browser and
Node; the feed (`api/feed.js`) must keep working unchanged until story #3 swaps it; nothing
about membership may be persisted; Community/My view must not influence the verdict; the
house perspective is `HOUSE_POV.pubkey` (ADR 0046) — never the member's own.

## Options considered

### Option A — Policy-parameterized closure in the shared module + strict house-POV score fetch in the client *(chosen)*
Extend `public/lib/membership.js` with a `MEMBERSHIP_POLICY` data constant and a new closure
`buildTrustWeightedMemberSets(tagItems, seedPubkey, { scores, policy })` that takes a
`Map<pubkey, rank>` and returns the member sets **plus** the per-pubkey requirement and
voucher sets. The client fetches house-POV ranks for every pubkey appearing in the tag
events with a **strict** variant of the existing ORE batch (throws on anything but a
well-formed 2xx), then runs the closure. The legacy `buildMemberSets` stays exported for
the feed until story #3.
- Pros: one policy constant, one closure, shared verbatim by browser and (in #3) server —
  the "single point of change" criterion falls out of the module boundary. Reuses the ORE
  call, host, POV seam, and cache the chips already use, so a member's standing is computed
  from the *same cached number* their chip shows. No new hosts, endpoints, or persistence.
  The feed is untouched.
- Cons: sign-in gains a second network dependency and its latency (one ORE round trip,
  parallelizable with the relay query only after the tag events arrive — the pubkey list
  comes from them). Two closures coexist in the module until #3 deletes the legacy one.

### Option B — Server-side verdict endpoint (`GET /api/membership?pubkey=`)
A serverless function fetches tag events + ORE ranks and returns the verdict and counts; the
client renders what it is told.
- Pros: one evaluator for client and feed from day one; the client never talks to ORE for
  membership.
- Cons: introduces a server dependency on *sign-in* where none exists (CLAUDE.md: gating is
  client-side, no backend session); the Members page still needs the full closure output
  (voucher sets for #2's hover, pending set) so the payload becomes the whole closure
  anyway; adds cold-start latency and a new failure mode on top of ORE's; nothing forces
  it — story #3 can `require` the shared module server-side exactly as `api/feed.js`
  already does. Rejected: it moves the computation without removing any dependency.

### Option C — Consume Brainstorm's published roster (kind 30000 / 30392) instead of computing
- Cons: those lists encode Brainstorm's own admission rule (1-vouch closure or NIP-85 rank
  cutoff), not LFO's table; we'd have no way to apply our policy, show remaining counts, or
  change buckets. Contradicts the book's "computed in-app" decision. Rejected.

**Sub-decision — lenient vs strict score fetch.** The chips' `fetchTrustScores` swallows
failures and can fall back to the global algorithm. Membership must do neither (AC
"Provider unavailable", PO: no fallback). Rather than a second fetch pipeline, split the
existing one into a low-level strict request (`oreRankBatch`, throws) and keep
`fetchTrustScores` as the lenient wrapper. Both write the same `_scoreCache` entries under
the `${HOUSE_POV.pubkey}:` namespace, so chips and verdict never disagree.

## Decision

We chose **Option A**. The policy lives as data in the shared module; the closure is a pure
function of `(tagItems, seed, scores, policy)`; the client supplies scores from one strict
house-POV batch; failure to obtain scores is a sign-in error state, never a verdict.

### The closure (normative)

```
policy = { buckets: [ {name:'trusted', min:75, vouches:1},
                      {name:'neutral', min:50, vouches:2},
                      {name:'low',     min:0,  vouches:3} ] }
scoreInteger(rank)      = Math.round((Number.isFinite(rank) ? rank : 0) * 100)   // = the chip
requiredVouches(int)    = first bucket (descending min) with int >= min → .vouches
vouchers(target)        = { ev.pubkey : ev has p=target, ev.pubkey ≠ target }      // distinct, self excluded
verified = { seed }
repeat until no change:
  for each target ∉ verified with vouchers(target) ≠ ∅:
    counting = | vouchers(target) ∩ verified |
    if counting ≥ requiredVouches(scoreInteger(scores.get(target))): add target
pending  = { target tagged by anyone (self included) } \ verified
```
Monotone (verified only grows; requirements are fixed per run) ⇒ terminates. `scoreInteger`
is exported and **the chip must call it** so the boundary is one expression in one place.

### Return shape
`{ verifiedMap, pendingMap, vouchersByTarget, requirement }`
- `verifiedMap: pubkey → firstCountingVoucher` and `pendingMap: pubkey → firstVoucher` keep
  today's shapes so every existing consumer (cards' "by …", `getMyAttestedPubkeys`,
  search-panel status) works unchanged.
- `vouchersByTarget: pubkey → Set<voucherPubkey>` (all distinct non-self vouchers).
- `requirement: pubkey → { score, bucket, required, counting, remaining }` for every tagged
  pubkey **and** for any extra pubkey the caller asks about (the signing-in user, untagged).
  Story #2 renders `vouchersByTarget` + `requirement`; this story renders `remaining`.

## Consequences

- **Enables** story #2 (counts/hover from `vouchersByTarget`/`requirement`) and story #3
  (feed calls `buildTrustWeightedMemberSets` with a server-side `oreRankBatch`; deletes the
  legacy export) with no further module changes.
- **Sign-in now depends on ORE.** Expected added latency ≈ one `/rank/pubkeys` round trip
  (sub-second in probes). A refused house perspective (422) or a scheduled one (202) is an
  *unavailable* sign-in, rendered with the PO's D3 copy — the copy says "temporarily
  unreachable" even for a refusal; accepted by the PO's wording.
- **Day-one rollback**: 11 members become pending (operational fix, book).
- **Debt:** two closures in `membership.js` until #3; `HOUSE_POV.pubkey` is still the PO's
  placeholder perspective (ADR 0042/0046) — the policy inherits that swap.
- **CLAUDE.md** must be amended: "Verification Algorithm" and "Key Decisions" now state
  that house-POV GrapeRank sets the *required vouch count* (never admits by itself).
- **Firmware reinstall required?** No — no concept definition changes.

## Implementation notes

**`public/lib/membership.js`** (UMD; keep the wrapper and `window.*` globals pattern)
- Export `MEMBERSHIP_POLICY` (the data above, frozen), `scoreInteger(rank)`,
  `requiredVouches(scoreInt, policy = MEMBERSHIP_POLICY)`,
  `buildTrustWeightedMemberSets(tagItems, seedPubkey, { scores, policy = MEMBERSHIP_POLICY, extraPubkeys = [] })`.
- Keep `buildMemberSets` exported, marked `// LEGACY — feed only until story #3`.
- Browser globals: `window.buildTrustWeightedMemberSets`, `window.MEMBERSHIP_POLICY`,
  `window.scoreInteger` (alongside the existing `window.buildMemberSets`).
- `scores` is a `Map` (or plain object) of pubkey → rank float; absent ⇒ 0. Throw a
  `TypeError` if `scores` is missing altogether — the caller must never "forget" scores and
  silently get a 3-vouch world.

**`public/index.html`**
- Split `fetchTrustScores` (`:3063`): extract `async function oreRankBatch(pubkeys, povPubkey)`
  that POSTs (chunks of ≤100, 10 s timeout each) and **throws** `new Error('ore-unavailable')`
  on abort/network error, non-2xx (incl. 422/202), non-JSON, or a body without `results`;
  returns `Map<pubkey, rank>`. `fetchTrustScores` keeps its lenient contract by wrapping it
  in try/catch and keeps the ADR 0047 global fallback for chips only.
- New `async function getMembershipScores(pubkeys)`: cache-first against
  `_scoreCache` under `${HOUSE_POV.pubkey}:` keys, strict `oreRankBatch` for the missing
  set, **always** `pov: HOUSE_POV.pubkey` and `algorithm: 'graperank-pov'` regardless of
  `_activeView` / `_povState`. Propagates the error.
- `getMemberSets()` (`:2226`): collect `pubkeysIn(tagItems)` (all `p` targets + authors +
  `currentPubkey`), `await getMembershipScores(...)`, then
  `buildTrustWeightedMemberSets(tagItems, SEED_PUBKEY, { scores, extraPubkeys: [currentPubkey] })`.
  Cache in `_memberSetsCache` as today; same invalidation sites (`publishVouch`, self-apply,
  `disconnect`). `disconnect` must not need to clear `_scoreCache` (scores are not
  membership state), but clearing it is harmless.
- `proceedWithPubkey()` (`:3946`): wrap the member-set computation; on `ore-unavailable` set
  `#error-msg` to exactly `We couldn't check your membership because Brainstorm scores are
  temporarily unreachable.` and `showState('error')` (its existing **Try again** button
  satisfies the AC). Relay failures keep today's message. Loading copy while scores load:
  `Checking your trust standing…` via `setLoadingMsg`.
- Non-verified branch: read `requirement.get(hexPubkey)` → `{ required, remaining }`; fill two
  new elements inside `#state-not-member`, shown in both sub-states:
  `<p id="vouch-requirement-line">Your trust level in the community requires {N} vouch(es) from other members.</p>`
  `<p id="vouch-remaining-line">{M} more vouch(es) needed</p>` (singular when 1 — D4).
  `_alreadyPending = pendingMap.has(hexPubkey)` keeps deciding apply-prompt vs notice.
- `publishVouch()` (`:2397`): after pushing the event and invalidating, ensure the target's
  score is present (`getMembershipScores([targetHex])` — the search-panel path can vouch a
  pubkey that was in no tag event) then rebuild; return `{ ok, brainstormOk, verified,
  remaining }`. If the score fetch fails here, return `remaining: null`.
- Both feedback sites (`:2475`, `:3385`): not-verified branch renders
  `Vouched — {M} more vouch(es) needed`, or `Vouched` when `remaining` is null.
- Chips: replace the inline `Math.round(rank * 100)` with `scoreInteger(rank)` wherever the
  chip integer is computed (`patchGridTrustScores`, search rows) — one expression, one place.
- `loadMembersPage()` (`:2785`): `getMemberSets()` can now reject; catch and render the D3
  copy in place of the grids (`#members-loading` → an error line), never a partial grid.

**`scripts/membership-policy-dry-run.mjs`** — promote the intake script; `createRequire`
the shared module so the dry run exercises the real closure and policy. Read-only.

**`CLAUDE.md`** — amend "Verification Algorithm", "Key Decisions", and "Authentication
Flow" step 3–4 to describe the table, the strict ORE dependency, and the seed-only root.

**Test seams the Tester can rely on:** the UMD module is `require`-able in Node
(`test/*.test.js`); Playwright specs already stub `window.queryRelay`, `_tagItemsCache`, and
`**/rank/pubkeys` (`tests/npub-search.spec.js:60-200`) — sign-in tests can set
`_tagItemsCache` then call `proceedWithPubkey(hex)` via `page.evaluate`. New DOM hooks:
`#vouch-requirement-line`, `#vouch-remaining-line`, `#error-msg`. The 422 / 202 / abort
cases are `route.fulfill({status})` / `route.abort()` on the rank route.

## Out of scope
- Server-side (feed) adoption and the deletion of the legacy closure — story #3, which
  will also decide the server's `oreRankBatch` and its error contract.
- Card counts, hover, Vouch-on-verified — story #2.
- Persisting scores across sessions, a service worker, or any retry/backoff policy beyond
  the Try again button.
- Replacing `HOUSE_POV.pubkey` with the official LFO account (ADR 0042's open swap).
