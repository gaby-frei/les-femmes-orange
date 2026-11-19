# Story 4: Refresh every affected card after a vouch that verifies someone

**Status:** Draft (shelved by PO, 2026-11-18 — plan before or after #3, PO's call)
**Created:** 2026-11-18
**Type:** Bug
**Epic:** `trust-weighted-membership`
**Origin:** Review of story #2, finding N1 (`engineering-team/reviews/trust-weighted-membership/2-vouch-counts-on-cards.md`)

## Background
A vouch that verifies a pending applicant can also verify others. For example, X and Y are
both pending and X has vouched for Y. When a member vouches for X, the closure verifies X *and* Y. Today
only X's card is re-rendered, so Y's card stays in Pending showing a stale count (e.g.
`0 of 1 vouch`) until the Members page is reloaded. Before story #2 Y was also left in the
wrong grid; the count makes it visible.

## User-facing description
As a verified member, I want every card on the Members page to reflect my vouch's full
effect immediately, so that nobody appears pending after they've become a member.

## Acceptance criteria
- [ ] Given X and Y are pending and X has vouched for Y, when I vouch for X and that verifies both, then both cards move to the verified grid with correct counts, without a reload, and the section counts update.
- [ ] Given a vouch that changes only the target's card, then no other card is re-rendered or moved, and the page doesn't flicker (no loading state).
- [ ] The target's card keeps its post-vouch acknowledgement.

## Proposed approach (from the review discussion — for the Architect to confirm)
Instead of re-rendering only the target, reconcile both grids against the fresh closure. Move
or replace only the cards whose grid or count changed, and avoid the full `loadMembersPage()`
reload, because of its spinner, lost acknowledgements, and re-running `resolvePerspectives`.

## Out of scope
- The search-panel vouch path (it already reloads the grids). Optionally move it onto the same reconcile later.

## Open questions
None yet.

## Linked artifacts
- ADR: (amendment note on ADR 0049 expected, or none)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
