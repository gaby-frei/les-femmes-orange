# Test Plan — npub-search #6: search → ORE migration

**Story:** `engineering-team/stories/npub-search/6-search-ore-migration.md`
**ADR:** `engineering-team/decisions/0045-search-ore-migration.md`
**Date:** 2026-08-05
**Spec:** `tests/npub-search.spec.js` — the story-#2 describe block (T15–T27) is re-pinned
in place to the ORE backend; no new describe block. Story-#1 T12 and story-#5 T34 (which
shared the meili stub) are re-pointed in the same pass; amendment notes added to their
plans.

## Approach

The free-text path's network surface becomes three calls, each stubbed independently:

1. **ORE search** — `page.route('**/search/pubkeys')` via new `stubOreSearch` (records
   POSTed JSON bodies + full URL; fixtures `{results: [{pubkey, rank}], ttl: 300}` with
   **fused floats in the thousands** — never displayed, so fixtures deliberately make
   fused order disagree with chip values to prove no client re-sort).
2. **Kind-0 metadata join** — the existing `openMembers` `queryRelay` stub (per-pubkey
   entries, per-relay versions, delays) now serves the wide-set join; result profiles are
   provided via the `profiles` option.
3. **Rank batch (chips)** — the existing `stubRankApi` (extended to record request URLs),
   0–1 floats, chips = `round(rank × 100)`.

**Leak guards in the harness:** `openMembers` now always routes the old meili glob to an
abort **and counts calls** (`page.__meiliCalls`) — pinning the "no meili-proxy calls
remain" AC and keeping the suite offline if the implementation regresses; it also installs
a default empty `**/search/pubkeys` stub when a test didn't register its own (same pattern
as the story-#4 rank default).

## Case re-pins (T15–T27 in place)

| # | Change | Now pins |
|---|---|---|
| T15 | stub swap only | 1 char → zero ORE calls; 2 chars fires live |
| T16 | **re-pinned** | one POST; body `{query, algorithm: 'relevance-pov', pov: HOUSE_POV.pubkey, limit: 6}`; search **and** rank URLs on `brainstormserver.nosfabrica.com`; `page.__meiliCalls` stays 0; identity input → zero ORE-search calls |
| T17 | **re-pinned** | 6 rows in **served order** even though chip values are non-monotonic (fused order ≠ graperank order — proves the re-sort is gone); chips from rank fixtures |
| T18 | stub swap | per-row badges/vouch (✓ Member / Pending / Not a member) |
| T19 | **re-pinned** | pubkey missing from the rank response → chipless row **in served position** (no sort-last — ordering is ORE's) |
| T20 | stub swap | encouragement footer under results and empty state |
| T21 | stub swap | vouch parity: story-#1 wire shape, sibling rows untouched, grid gains member |
| T22 | stub swap | loading state; Escape/clear/click-outside; grid byte-identical |
| T23 | stub swap | empty `results` → empty state |
| T24 | **re-pinned** | 503 → unavailable state whose copy **prompts npub / hex / nprofile** (O2); retype-when-healthy recovers |
| T25 | stub swap | stale slow response never overwrites a fast retype |
| T26 | **replaced** | (povResolution warn is obsolete — no observer echo in ORE) → rank-batch failure during search → rows render **chipless**, not unavailable |
| T27 | **re-pinned** | metadata semantics: join seeds `_metaCache`; newest-wins (an older relay event never clobbers a newer cached one); misses not negative-cached |
| T27b | **new** | profile-less ORE result renders per story-#1 rules (short-npub name, ⚠️ warning copy, vouchable); the join fans out to all 4 wide-set relays; re-search re-queries |

**Cross-block re-points:** story-#1 T12 (below-minimum guard) and story-#5 T34
(panel-vouch grid placement) used the meili stub; both move to `stubOreSearch` with
assertions unchanged (T34 additionally gets Bea's kind-0 served by the relay stub instead
of a meili document). T34 is red until implementation; T12 stays green.

## Expected red run

Red at the pre-implementation tree: T15–T21, T24 (recovery leg), T25–T27b, and T34 fail
behaviorally — the current implementation calls the (now aborted+counted) meili route, so
the panel lands in the unavailable state and no ORE-search calls are recorded. Green and
must stay green: T1–T14 (incl. re-pointed T12), T22/T23 partially fail via unavailable-state
mismatch, grid suite T28–T33.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

## Verification

Red run confirmed 2026-08-05 at `6020463` (`npx playwright test tests/npub-search.spec.js`):

```
15 failed
  › free-text search … › one char never queries the backend; two chars fire live without Enter
  › free-text search … › fall-through fork: free text sends the pinned ORE contract; identities and meili never involved
  › free-text search … › six rows in ORE served order; chips from the rank batch, never from search ranks
  › free-text search … › per-row membership: ✓ Member (no vouch) / Pending (vouch) / Not a member (vouch)
  › free-text search … › a hit missing from the rank batch renders chipless in its served position
  › free-text search … › identity-search encouragement copy renders beneath results and in the empty state
  › free-text search … › vouching one row publishes the story-#1 wire shape for that pubkey; sibling rows untouched
  › free-text search … › loading state while in flight; Escape, clear, and click-outside dismiss; grid byte-identical
  › free-text search … › no matches → a real empty state, not a blank panel and not the identity dead-end hint
  › free-text search … › backend failure → unavailable state prompting npub/hex/nprofile; retyping when healthy retries
  › free-text search … › stale responses never paint: a slow query is superseded by a fast retype
  › free-text search … › rank-batch failure during search → rows render chipless, search unaffected
  › free-text search … › metadata join seeds _metaCache newest-wins; newer cached profiles survive the join
  › free-text search … › profile-less result → npub row, warning, vouchable; wide fan-out; re-search re-queries
  › member-card trust scores … › search-panel vouch → new verified card slots into rank order   (T34 re-point)
21 passed (3.7m)
```

All 15 failures are behavioral: the current implementation calls the meili proxy, which the
harness now aborts and counts, so the panel lands in the unavailable state and zero ORE-search
calls are recorded. Green as expected: T1–T14 (including re-pointed T12) and grid suite
T28–T33.
