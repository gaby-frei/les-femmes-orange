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

## Amendment (2026-08-02 — vouch placement)

| # | Case | AC |
|---|---|---|
| T33 | Pending-grid vouch: Pat (.85) slots between Vera (.91) and Vike (.73) in the verified grid, chipped `🏅 85` — not prepended | Vouched members slot in sorted (grid path — was red: surgery prepended) |
| T34 | Search-panel vouch: Bea (.80) slots into the same position — pin (green before and after; panel path re-renders) | Vouched members slot in sorted (panel path) |

Amendment red run: T33 failed behaviorally (order `[Pat, Vera, …]` — prepended), T34 +
all 33 prior green. Post-implementation: 155/155.

**Amendment (2026-08-05, story #6):** T34 re-pointed from the meili search stub to the ORE
search stub (Bea's profile now served by the relay join); assertions unchanged. Red until
story #6's implementation lands.
