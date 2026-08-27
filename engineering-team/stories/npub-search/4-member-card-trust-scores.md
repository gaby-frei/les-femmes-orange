# Story 4 (mini): House-POV trust scores on the member cards

**Status:** Done
**Created:** 2026-08-02
**Type:** Feature (mini — extension of #2's trust-score surface)
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** #2 (`HOUSE_POV` config, trust-score chip, ADR 0042). Executes ahead of queued #3.
**Approval note:** PO directive 2026-08-02 — story approved at creation; all phase gates
authorized to run without per-phase sign-off. Backend pre-selected by the PO: **ORE
`/rank/pubkeys` batch** (Route B), rationale recorded in ADR 0043.

## Background
Story #2 put a numeric house-POV trust score on every free-text search result row. The same
signal is absent from the member grids themselves. This mini story displays it there too:
every member card on the Members page (verified **and** pending grids) carries the same
score chip, computed from the same designated house POV.

## User-facing description
As a **signed-in member** on the Members page, I want each member card to show that
member's trust score from the community's (house) point of view, so the grid gives me the
same at-a-glance trust signal the search panel already does.

## Acceptance criteria
- [ ] **Chip on every scored card.** Each card in the verified and pending grids displays
      the member's house-POV trust score as a 0–100 integer in the same chip format as the
      story-#2 search rows, when a score is available for that pubkey.
- [ ] **One batch call.** Scores are fetched in a single batch request per page load
      (session-cached thereafter) — never one request per card.
- [ ] **Enhancement-only failure.** If the score backend is unreachable, slow, or returns
      no data, the Members page renders exactly as today — cards, badges, vouch flows all
      intact, no error state, no blocked rendering. Cards render without waiting on scores.
- [ ] **Score-less members render chipless.** A pubkey absent from the score response
      simply shows no chip; the rest of its card is unaffected.
- [ ] **Display-only.** Grid ordering, search-panel behavior, and vouch flows are
      unchanged. Scores decorate; they do not sort or gate anything.

## Out of scope
- Reordering grids by trust (story #3, personalized POV).
- Any change to the search panel or its meili-proxy backend.
- ORE 202/Retry-After handling (hosts don't emit it today — ADR 0042 P11; revisit with #3).

## Linked artifacts
- ADR: `engineering-team/decisions/0043-member-card-trust-scores-ore-batch.md`
- Test plan: `engineering-team/stories/npub-search/4-member-card-trust-scores.test-plan.md`
- Review: `engineering-team/reviews/npub-search/4-member-card-trust-scores.md` — **PASS**, 2026-08-02 (151/151 Playwright; POV-keyed-cache caveat flagged to story #3)
