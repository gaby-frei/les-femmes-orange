# Test Plan — npub-search #4 (mini): member-card trust scores

**Story:** `engineering-team/stories/npub-search/4-member-card-trust-scores.md`
**ADR:** `engineering-team/decisions/0043-member-card-trust-scores-ore-batch.md`
**Date:** 2026-08-02
**Spec:** `tests/npub-search.spec.js`, describe block 3 (reuses `openMembers` harness).

## Approach

The only new network seam is `POST api.brainstorm.world/rank/pubkeys` — stubbed via
`page.route('**/rank/pubkeys')`, recording each request's parsed JSON body. Fixture
responses follow the ORE contract `{results: [{pubkey, rank}], ttl}` with 0–1 float ranks;
chips must show `round(rank × 100)`. Member sets: story-#1 harness (ME verified, PENDING
pending → exactly two grid cards).

## Cases

| # | Case | Story AC / ADR point |
|---|---|---|
| T28 | One batch POST with the exact body contract (`algorithm: graperank-pov`, `pov` = HOUSE_POV pubkey, `pubkeys` = the two grid pubkeys as a set); ME card (verified grid) chips `🏅 96` from 0.9647…, PENDING card (pending grid) chips `🏅 45` from 0.4512; grid card count unchanged | Chip on every scored card; one batch call; ×100 conversion; display-only |
| T29 | Backend unreachable (route abort): both grids render their cards normally, zero chips anywhere, pending vouch button still present | Enhancement-only failure |
| T30 | Response contains ME only: ME chips, PENDING card renders chipless and otherwise intact | Score-less members chipless |

T29 is a **failure-mode guard**: it passes against the current build (no chips exist at
all) and must keep passing after implementation — its value is pinning that an ORE outage
never degrades the page. T28 and T30 are the red feature tests.

## Test infrastructure

Playwright only; no live hosts contacted; no concept-graph dependency.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

## Verification

Red run confirmed 2026-08-02 (post-ADR-0043 commit): T28 and T30 fail behaviorally (zero
`.candidate-trust-score` chips in the grids, no `/rank/pubkeys` request recorded); T29
passes (guard); all prior cases (T1–T27) stay green.

```
2 failed
  › member-card trust scores — house POV via ORE batch (npub-search #4) › one batch POST with the pinned contract; both grid cards chip round(rank*100)
  › member-card trust scores — house POV via ORE batch (npub-search #4) › a pubkey missing from the results renders chipless; scored siblings still chip
29 passed (1.1m)
```
