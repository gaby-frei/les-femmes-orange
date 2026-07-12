# Review: note-tagging Story 1 — Note-tagging demo UI

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-25
**Diff:** `git diff dceff72^..50fcbe8 -- public/index.html` (impl `dceff72` + styling `50fcbe8`); branch `feat/note-tagging`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **PASS** (29/29).
- [x] `npx playwright test tests/note-tagging.spec.js` — **PASS** (8/8).
- [x] `npm test` (full) — **PASS** (29 unit + 64 e2e) at this commit; the change is feed-card CSS + a
  shared modal, and the existing community-feed/local-signer specs are unaffected (no regressions).
- [x] _Lint / Typecheck / Build — not configured (JS-without-build, per CLAUDE.md). Skipped._

## Spec adherence
- [x] **AC-1** plus button on every card — `makeFeedNote` appends `.feed-note-tag-btn` (`index.html:2356-2363`).
- [x] **AC-2** click opens "Add a tag" popup — `openTagModal()` shows `#tag-modal`; title present (`:1499`).
- [x] **AC-3** plus ≠ open-in-Primal — `tagBtn` click `stopPropagation()` (`:2361`); test uses a `window.open` spy + positive control.
- [x] **AC-4** two toggle views, one active — `.tag-tab[data-tab]` + `selectTagTab()` with `aria-selected` (`:1503-1506`, `:2380`).
- [x] **AC-5** both views show the message — `#tag-modal-message` constant text (`:1508`).
- [x] **AC-6** dismiss via close + backdrop — `closeTagModal()` on the × and on overlay-target click (`:2386-2388`).
- [x] **AC-7** inert — handlers are DOM-only; test asserts no `window.open`, no `/api/`/relay/primal request, no `localStorage` change.
- [x] **AC-8** gated — affordance only exists on feed cards; the signed-out guard stays green.
- [x] No behavior added beyond the story (modal is note-agnostic; no real tagging).

## ADR adherence
- [x] **Option A** as designed: one shared `#tag-modal` overlay (modeled on `#backup-warning-modal`) + per-card trigger.
- [x] Global fns `openTagModal` / `closeTagModal` / `selectTagTab` per the app's modal convention; inline `onclick` + backdrop listener resolve as globals (classic script block 1565–2856).
- [x] The load-bearing `stopPropagation` is present and tested.
- [x] `.feed-note { position: relative }` added to anchor the button; backdrop-closes / panel-clicks-don't, per ADR.
- [x] No new deps; no concept change; **no firmware reinstall** (correct — no concepts touched).

## Concept-graph integrity
- [x] No concepts defined/changed. The future `event-tag` concept is explicitly deferred (story + epic). N/A.

## Things tests can't catch
- [x] **Security:** modal markup is static; `tagBtn` uses `textContent='+'`; message is static text. No `innerHTML` of untrusted data, no injection vector introduced.
- [x] **Keyboard:** `.feed-note-tag-btn` is a native `<button>`, so Enter/Space synthesize a click → `openTagModal`; the `keydown` handler `stopPropagation`s so the card's Enter→Primal handler doesn't also fire. Keyboard activation is correct (not explicitly tested, but sound).
- [x] **Single listener:** the backdrop `addEventListener` is top-level (one listener), not per-card. Correct.
- [x] No debug logging, no commented-out code, no leftover scaffolding.

## House rules check
- [x] No new lint/typecheck/build tooling. Concept-graph authority N/A (no concepts).

## Findings

### Blocking
_None._

### Non-blocking
1. **`index.html:2359` vs `:2369`** — the button's accessible name (`aria-label="Add a tag"`) differs from the visible hover tooltip text (`::after { content: 'click to tag' }`). Both are reasonable; the `aria-label` is the accessible name and the tooltip is decorative, so this is acceptable. Optional: align them for consistency.
2. **Tooltip centering near the card edge** — the `::after` is centered under a button that sits ~0.8rem from the card's right edge, so "click to tag" can extend slightly past the card's right border on hover. Cosmetic, user-approved placement; mentioned only as an observation.
3. **Modal a11y polish** (out of scope for a demo): no focus trap / Escape-to-close / focus-return. Fine for a non-functional placeholder; worth picking up when the modal becomes functional in a later epic story.

## Verdict
**PASS** — all 8 ACs met and tested, faithful to ADR 0039 (Option A, shared modal, load-bearing
`stopPropagation`, inert demo), no regressions, no security concerns. The user-requested styling
refinements (dashed transparent button + "click to tag" tooltip) are within the story's provisional-UI
scope. Ready for the deploy chain once the branch lands.
