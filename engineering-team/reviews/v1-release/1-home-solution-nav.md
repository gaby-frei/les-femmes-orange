# Review — v1-release #1: "Home" rename + public "Solution" page

**Verdict:** PASS
**Date:** 2026-07-27
**Reviewer:** engineering-team Reviewer role (harness-light scope per book)
**Commits under review:** `e7cb961..8dab6d5` on `feat/v1-ui` (plan → tests → rename → page → tooling)

## Story & AC audit

| AC | Evidence | Verdict |
|---|---|---|
| First tab reads "Home", no "About" anywhere in nav | `public/index.html` nav; spec T1; repo-wide grep for `>About<` clean | ✓ |
| Rename is label-only — default view, `showView('about')`, hero CTA untouched | view id `page-about` and all `showView('about')` call sites unchanged; T3, T4 | ✓ |
| "Solution" tab visible signed-out; Members/Feed stay gated | static `<li>` (no `display:none`); T1 | ✓ |
| Tab order Home \| Members \| Feed \| Solution (PO override of the draft default) | DOM order; T2 asserts all four labels in order | ✓ |
| Solution view public — no sign-in prompt, no gated fetch, no relay socket | static DOM only; T6 spies requests + websockets, asserts none | ✓ |
| Identical signed-in vs signed-out | structural: static DOM, no auth-dependent code path touches it (T6 corroborates) | ✓ |
| Copy verbatim + emphasis fidelity (underline/italic/bold preserved) | four `h2` headers + two `h3` subheads (T7); 7 ✗ / 8 ✔ items with bold labels (T8); computed-style checks on *vouch*, tagline, *millions*, Web of Trust, **LFO Hub** (T9); five exact-sentence checks incl. typographic ’ and – (T10) | ✓ |
| Active-state exclusivity across four tabs | T5 round-trips | ✓ |

## Quality gates (run by reviewer)
- Unit: `node --test test/*.test.js` — **109/109 pass**.
- E2E: `PORT=3100 npx playwright test` — **120/120 pass** (110 pre-existing + 10 new). The
  pre-existing suite is untouched; `community-feed.spec.js` / `note-tagging.spec.js` (which drive
  `showView` directly) stay green, proving the rename broke no wiring.

## Deviations & notes
1. **One verbatim deviation, flagged per the story's out-of-scope rule (typos are flagged, not
   silently fixed):** the PDF runs two sentences together — "…easily reconstructable.The community
   can move…" (Data ownership item). The page renders it with a space. **PO to ratify or revert.**
2. **Out-of-story tooling fix (own commit `8dab6d5`):** during test execution a *foreign* dev
   server (another project's Next.js, port 3000) was silently reused by Playwright's
   `reuseExistingServer`, running the whole spec against the wrong app. `server.js` and
   `playwright.config.js` now honor `PORT`; suites were run on 3100. Minimal, test-only surface;
   no production behavior touched (Vercel ignores `server.js`).
3. The Solution page adds no JS beyond four lines in `showView` (guarded like `feed`'s), no new
   dependencies, no API surface. CSS is additive under `.solution-*` names — no collisions
   (verified by full-suite green).

## Verdict rationale
All ACs verified by failing-first tests that now pass; zero regressions across both suites; the
single copy deviation is disclosed above and awaits PO ratification. PASS.
