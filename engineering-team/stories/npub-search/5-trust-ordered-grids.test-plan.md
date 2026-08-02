# Test Plan — npub-search #5 (mini): trust-ordered grids

**Story:** `engineering-team/stories/npub-search/5-trust-ordered-grids.md`
**ADR:** `engineering-team/decisions/0044-trust-ordered-grids.md`
**Date:** 2026-08-02
**Spec:** `tests/npub-search.spec.js`, describe block 3 (T31–T32). `openMembers` gained an
`extraTagItems` option so grids hold enough members to have an order (4 verified, 2 pending).

## Cases

| # | Case | Story AC |
|---|---|---|
| T31 | Scores {V2:.91, V3:.73, ME:.50, V4:none; P2:.60, PENDING:.20} → verified renders [Vera, Vike, Mae, Vin(chipless, last)], pending renders [Pia, Pat]; card count intact | Descending upper-left; score-less last stable; per-grid |
| T32 | Empty score response → both grids keep member-set insertion order | Enhancement-only (guard — green before and after) |

POV-agnosticism is structural (ordering consumes the patch's score `Map`, downstream of the
`povPubkey` parameter) and is covered by ADR review rather than a separate test; story #3
adds the POV-swap test when a second POV exists.

## Verification

Red run 2026-08-02: T31 fails behaviorally (grids render in insertion order — expected
rank-desc order not observed); T32 passes (guard); all prior 30 cases green.

```
1 failed
  › … › grids render highest trust upper-left: rank-desc order, score-less last, per grid
32 passed (51.1s)
```
