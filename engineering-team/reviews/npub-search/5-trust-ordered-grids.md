# Review: npub-search #5 (mini) — Trust-ordered member grids

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-08-02
**Story:** `engineering-team/stories/npub-search/5-trust-ordered-grids.md`
**ADR:** `engineering-team/decisions/0044-trust-ordered-grids.md` (Accepted; supersedes 0043's display-only consequence)
**Test plan:** `engineering-team/stories/npub-search/5-trust-ordered-grids.test-plan.md`
**Diff:** ~20 lines in `patchGridTrustScores` (`public/index.html`) + T31/T32 and the
`extraTagItems` harness option (`tests/npub-search.spec.js`).
**Process note:** accelerated mode per the PO's 2026-08-02 directive (as #4).

## Quality gates (run by reviewer)

- [x] `npx playwright test` — **153/153 pass** (48.0s): T31 red→green, T32 guard green
      throughout, all 151 prior cases green.
- [x] `node --test test/*.test.js` — **106/107**; sole failure is the pre-existing
      `builder-parity` tapestry-checkout drift (dispositioned in review #2).

## Spec adherence

- [x] All five ACs covered: rank-desc upper-left per grid + score-less last stable (T31),
      enhancement-only / insertion order without scores (T32), POV-agnosticism structural
      (ordering consumes the patch's score `Map`, downstream of `povPubkey` — verified in
      the diff; per the test plan, the POV-swap test lands with story #3), chips/vouch/
      counts intact (T31 count + chip assertions; T14/T28/T29 regressions green).
- [x] Vouch-triggered re-renders re-apply ordering: `loadMembersPage` → patch → sort runs
      on every load; verified by inspection (same code path as first render).

## ADR adherence

- [x] Option B exactly: sort inside `patchGridTrustScores` after the chip pass; stable
      `Array.sort` with missing-score comparator −1 (below the 0–1 rank range); per-grid
      `:scope > .member-card` collection; `appendChild` re-order preserves listeners;
      `< 2` cards skipped; the pre-existing `if (!scores.size) return` guarantees the
      no-scores path never re-orders (T32).
- [x] No new dependencies, no layout/CSS changes (DOM order drives the CSS grid).

## Concept-graph integrity

- [x] No concepts touched; no firmware reinstall.

## Findings

### Blocking

None.

### Non-blocking

1. **`public/index.html` (comparator)** — a `NaN` rank would make the comparator return
   `NaN` (unspecified order for that pair). Same not-producible-from-contract class as the
   prior NaN notes (reviews #2/#4); listed for completeness.
2. **Late-arrival reflow** — on a cold cache the grids visibly re-order when scores land
   (~1 network round trip after first paint). Accepted by the story; if it ever grates, a
   CSS `view-transition`/FLIP polish is the fix — not filed as work.
3. **Story #3 reminder (carried forward):** the score cache is pubkey-keyed; a POV switch
   must clear or re-key it or the grids would order by the previous POV's scores
   (review-#4 finding 3, now with ordering — not just chips — at stake).

## Verdict

**PASS** — matches story, ADR 0044, and test plan; reviewer-run gates green (one
pre-existing environmental unit failure, out of scope).

## Addendum — vouch-placement amendment (2026-08-02, same day)

PO amendment: vouched members must land in sorted position from both vouch paths. Audit of
the delta (`patchGridTrustScores` optional-param default + `applyLFOTag` surgery calling it
fire-and-forget; T33 red→green, T34 pin):

- The panel path was already sorted (full re-render) — T34 confirmed green pre-change.
- The grid path's `prepend` now gets a follow-up chip+sort pass; enhancement-only holds
  (scores unreachable → the card stays where surgery put it, flow never blocks).
- DOM-gathered default pubkey list is `filter(Boolean)`-guarded; no behavior change for
  all existing `patchGridTrustScores(list)` call sites.
- Gates re-run: **155/155 Playwright**, unit 106/107 (same pre-existing failure).

**Verdict unchanged: PASS.**
