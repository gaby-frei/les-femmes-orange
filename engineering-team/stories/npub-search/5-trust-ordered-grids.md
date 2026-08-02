# Story 5 (mini): Trust-ordered member grids

**Status:** Approved
**Created:** 2026-08-02
**Type:** Feature (mini — extends #4's score surface into ordering)
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** #4 (batch house-POV scores + chips, ADR 0043). Supersedes #4's
"display-only" constraint. Narrows story #3's grid scope to a POV swap.
**Approval note:** PO directive 2026-08-02 (same accelerated mode as #4) — approved at
creation, gates run through without per-phase sign-off.

## User-facing description
As a **member** on the Members page, I want the member cards ordered by trust score —
highest first, starting in the upper left — so the most trusted members are always the
first thing I see. This ordering rule is **POV-agnostic**: whichever point of view supplied
the scores (house today, a personal POV in story #3), cards always render highest-trust
first.

## Acceptance criteria
- [ ] **Descending order, upper-left first.** Within each grid (verified and pending
      separately), cards appear in descending trust-score order; DOM order = visual
      row-major order, so the highest score is upper-left.
- [ ] **Score-less cards last, stable.** Members without a score for the active POV render
      after all scored members, keeping their existing relative order.
- [ ] **POV-agnostic rule.** The ordering logic consumes whatever score set the active POV
      produced — no house-specific assumptions (story #3 swaps the POV without touching
      the ordering).
- [ ] **Enhancement-only, still.** No scores (backend down / empty response) → the grids
      keep today's insertion order; rendering never blocks on the score fetch; cards may
      visibly re-order when late scores arrive (accepted).
- [ ] **Everything else intact.** Chips, badges, vouch flows, counts, and the search panel
      are unchanged; a vouch-triggered re-render re-applies the ordering.

## Out of scope
- Personal-POV score sourcing and the opt-in toggle (story #3).
- Ordering the search panel (already rank-ordered — ADR 0042).
- Any cross-grid merge (verified and pending stay separate sections).

## Linked artifacts
- ADR: `engineering-team/decisions/0044-trust-ordered-grids.md`
- Test plan: `engineering-team/stories/npub-search/5-trust-ordered-grids.test-plan.md`
- Review: (after Review phase)
