# Story 10: Perspective control accessibility

**Status:** Done (2026-08-26)
**Created:** 2026-08-26
**Type:** Bug (two pre-existing shipped defects)
**Epic:** `npub-search`
**Book:** `engineering-team/audits/pov-availability/book.md` — Open, PRD-backed
**Branch:** `feat/npub-search`

## Background

Two accessibility defects on the perspective toggle, both present in shipped code before this
book opened and both surfaced by the Phase 5 design review. Neither was introduced by stories
#7–#9; they are carried in their own story so the record shows that.

The contrast one grew teeth during this book. Stories #7 and #8 put four new sentences into the
status line, including the one telling a member *why* her view is unavailable — so the least
legible text on the page became the text carrying the explanation.

## Acceptance criteria

- [x] Status-line text and the search-panel notice meet 4.5:1 against their background.
- [x] Both sides of the perspective control measure at least 44px in their smaller dimension.
- [x] No copy, layout order, or behavior changes as a result.
- [x] The dimmed treatment from story #7 (opacity 0.55, cursor not-allowed) survives.

## What changed

| Defect | Before | After |
|---|---|---|
| Small-print contrast | `--grey-text` `#777777` → **4.48:1**, under the 4.5:1 AA floor for text below 18pt | new `--grey-text-strong` `#5f5f5f` → **6.39:1**, applied to `.pov-status-note` and `.member-search-notice` |
| Touch target | ~34px tall (`0.45rem` padding on `0.85rem` text) | **44.0px**, via `min-height: 44px` plus `0.7rem` padding |

`min-height` is stated explicitly rather than derived from padding, so a later type or spacing
change cannot quietly drop the control back under the minimum.

## Process note

**Test Design and Review were skipped at the PO's direction** (2026-08-26): "run through the
implementor… no need for tests or review." Recorded here so the book audit reflects what actually
happened. Verification was by direct measurement in a browser rather than by committed tests —
the numbers above are measured, not asserted, and nothing in the suite will catch a regression of
either defect.

## Verification

Measured in Chromium against the shipped stylesheet: both segments 44.0px; both small-print
classes 6.39:1; the story #7 dimmed treatment intact at opacity 0.55 / not-allowed.
Suite unaffected: 60/60 e2e, 106/107 unit (pre-existing `builder-parity` drift).

## Linked artifacts
- ADR: none — no design decision beyond the two numbers, which come from the design guide's
  accessibility baseline.
- Test plan: none (skipped, see Process note).
- Review: none (skipped, see Process note).
