# ADR 0044: Trust-ordered member grids — stable post-patch DOM re-sort

**Status:** Accepted (accelerated mode, 2026-08-02)
**Date:** 2026-08-02
**Story:** `engineering-team/stories/npub-search/5-trust-ordered-grids.md`
**Extends:** ADR 0043 (batch scores + patch-after-render); **supersedes** its
"display-only" consequence.

## Context

Story #4 decorates grid cards with house-POV scores but leaves ordering at member-set
insertion order. The PO now wants cards **always** ordered by descending trust (upper-left
first), for whatever POV supplied the scores. Constraints inherited from ADR 0043: cards
render before scores arrive (enhancement-only — an outage must leave a working page), and
the score source is already POV-parameterized for story #3.

## Options considered

### Option A — Sort before render (await scores in `loadMembersPage`)
Pros: no visible re-order. Cons: couples grid rendering to the score backend — an ORE
outage would hold the page behind an 8 s timeout, violating #4's enhancement-only AC.

### Option B — Stable DOM re-sort after the patch *(chosen)*
When `patchGridTrustScores` has scores, sort each grid's already-rendered cards descending
(stable; score-less last in their existing order) and re-append in order — `appendChild`
moves nodes with their listeners intact. No scores → no re-sort → today's behavior.
Pros: rendering stays non-blocking; failure mode identical to #4; ordering logic consumes
the same `Map` the chips do, so it is POV-agnostic by construction (story #3 swaps the
fetch's `pov` and inherits ordering untouched). Cons: a visible re-order when scores land
after first paint (accepted by the story; cache-warm loads re-sort effectively instantly).

## Decision

**Option B.** Ordering is a downstream consumer of the score `Map` — POV selection stays
entirely in `fetchHouseTrustScores`'s `povPubkey` parameter. Comparator: score descending;
missing scores compare as −1 (below the 0–1 rank range) so a stable `Array.sort` keeps
score-less cards last in insertion order. Each grid sorts independently; DOM order is
visual row-major order in the CSS grid, so index 0 = upper-left.

## Consequences

- The grids re-order when scores arrive; on cached loads this is imperceptible.
- ADR 0043's "display-only" consequence is superseded; its enhancement-only failure mode
  is preserved (no scores → insertion order, never an error).
- Story #3's member-grid scope reduces to: swap the POV pubkey (and re-key/clear the
  pubkey-keyed score cache — review-#4 finding 3 still applies).
- **Firmware reinstall required?** No.

## Implementation notes

- `public/index.html`, `patchGridTrustScores` (ADR 0043): after the chip pass, for each of
  `#verified-members-grid` / `#pending-members-grid`, collect direct `.member-card`
  children, stable-sort by `scores.get(hexOf(card)) ?? -1` descending (hex via
  `.member-copy-btn[data-hex]`), and re-append in sorted order. Skip grids with < 2 cards.
  The early `if (!scores.size) return` already guarantees the no-scores path never
  re-orders.
- Tests: `tests/npub-search.spec.js` describe block 3 — `openMembers` gains an
  `extraTagItems` option so a grid can hold enough members to have an order.

## Out of scope

Personal-POV sourcing/opt-in (story #3); search-panel ordering (ADR 0042); cross-grid
merging.
