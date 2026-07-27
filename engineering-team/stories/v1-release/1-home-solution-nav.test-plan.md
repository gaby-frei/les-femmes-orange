# Test Plan — v1-release #1: "Home" rename + public "Solution" page

**Story:** `engineering-team/stories/v1-release/1-home-solution-nav.md`
**ADR:** none (Architecture skipped — book's decided constraints)
**Date:** 2026-07-27
**Scope note (harness-light):** per the book, tests cover only silently-regressable behavior —
nav wiring, gating semantics, and copy fidelity spot checks. No unit layer is touched (the change
is pure client shell); one Playwright spec carries the whole plan: `tests/v1-shell.spec.js`.

## What can regress silently

1. **The rename** could leak: "About" surviving somewhere in the nav, or the rename breaking the
   internal `showView('about')` wiring (the view id stays `about`; only the label changes).
2. **Gating** could smear: Solution accidentally hidden signed-out (it must be public), or
   Members/Feed accidentally revealed signed-out (they must stay gated).
3. **Tab order** is a PO determination (Home | Members | Feed | Solution) invisible to any
   existing test.
4. **Active-state exclusivity** across a now-four-tab nav.
5. **The public promise**: opening Solution must trigger no gated fetch, no `/api/*` call, no
   sign-in prompt.
6. **Copy fidelity**: headers, list shapes (7 ✗ / 8 ✔), and the PDF's bold/italic/underline
   markup surviving as real HTML emphasis, not flattened text.

## Cases (all in `tests/v1-shell.spec.js`)

| # | Case | Story AC |
|---|---|---|
| T1 | Signed-out nav: first tab reads "Home", no tab reads "About", Solution tab visible, Members/Feed hidden | Rename-1, Sol-1 |
| T2 | DOM tab order is exactly Home, Members, Feed, Solution | O2 determination |
| T3 | Default view is still the (renamed) Home/about view; hero CTA present | Rename-2 |
| T4 | Clicking Solution shows `#page-solution`, hides the Home view; clicking Home returns | Sol-2, Sol-5 |
| T5 | Exactly one nav tab `.active` at a time across Home↔Solution round-trips | Sol-5 |
| T6 | Opening Solution fires no `/api/*` request and no relay WebSocket | Sol-3 |
| T7 | All four section headers render, plus the two Enabling-Technologies subheadings, in order | Copy |
| T8 | List shapes: seven ✗ items, eight ✔ items, every item opening with a bold label | Copy |
| T9 | Emphasis fidelity spot checks: `<u><em>vouch</em></u>`-style underline-italics render as underlined italics (computed style), the sovereign-infrastructure tagline is italic, *millions* is italic, *Web of Trust* is underlined | Copy fidelity AC |
| T10 | Verbatim spot checks: exact sentences from the PDF appear character-for-character | Copy fidelity AC |

Signed-in parity (Sol-4) is covered structurally: the Solution view is static DOM present before
any auth state exists, and T6 proves it reads nothing auth-dependent — there is no code path by
which sign-in could alter it. No sign-in simulation needed.

## Expected initial state
All Solution/rename cases FAIL against the current build (tab still reads "About", no Solution
tab, no `#page-solution`). The full existing suite must stay green throughout — especially
`community-feed.spec.js` and `note-tagging.spec.js`, which drive `showView(...)` directly.
