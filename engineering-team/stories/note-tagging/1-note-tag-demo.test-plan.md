# Test Plan: note-tagging Story 1 — Note-tagging demo UI

**Story:** `engineering-team/stories/note-tagging/1-note-tag-demo.md`
**ADR:** `engineering-team/decisions/0039-note-tagging-demo-ui.md`
**Date:** 2026-06-25

## Approach

Entirely **Playwright e2e** — this story is UI-only (no data layer, no backend). Tests stub `window.getFeed`
and drive `showView('feed')` (the established `community-feed.spec.js` pattern), then interact with the new
plus button + modal. New file: `tests/note-tagging.spec.js`.

The defining behaviors are interaction-level, so they need a real DOM/browser:
- the plus button exists on every card and opens a shared modal;
- **the plus is a distinct control** — its click must not bubble to the card's open-in-Primal handler
  (ADR 0039's load-bearing `stopPropagation`); verified with a `window.open` spy plus a positive control
  (clicking the card body *does* open Primal, proving the spy works);
- the two toggle views switch with `aria-selected`, both rendering the same "not yet" message;
- the modal dismisses via the close control and the backdrop;
- **nothing is published/signed/persisted/sent** on any interaction (no `window.open`, no `/api/`/relay/
  primal request, no `localStorage` change);
- the affordance is gated (a signed-out visitor sees no tag button).

### DOM / globals contract (what the Implementer must satisfy)

- `.feed-note .feed-note-tag-btn` — a circular `+` button on every card; `aria-label="Add a tag"`; click
  `stopPropagation()`s and opens the modal.
- `#tag-modal` — a single shared overlay, **hidden by default** (`display:none`), shown on open.
  Contains the title text **"Add a tag"**, a `.tag-modal-close` control, two tab buttons
  `.tag-tab[data-tab="search"]` ("Search existing") and `.tag-tab[data-tab="apply"]` ("Apply new") with
  `aria-selected` reflecting the active one (default: search), and `#tag-modal-message` holding
  **"No support for event tags yet. Check back later."**
- Global functions `openTagModal()` / `closeTagModal()` / `selectTagTab(name)` (matching the app's existing
  modal-fn convention); backdrop click and close control both close.

## Coverage map

| Criterion (story AC) | Test name | Test file | Level |
|---|---|---|---|
| AC-1 plus button on every card | `every feed note shows a circular "Add a tag" plus button` | `tests/note-tagging.spec.js` | e2e |
| AC-2 click opens "Add a tag" popup | `clicking the plus opens the "Add a tag" popup` | `tests/note-tagging.spec.js` | e2e |
| AC-3 plus ≠ open-in-Primal | `clicking the plus does not open the note in Primal` | `tests/note-tagging.spec.js` | e2e |
| AC-4 two toggle views, one active | `the popup has two toggle views with exactly one active at a time` | `tests/note-tagging.spec.js` | e2e |
| AC-5 both views show the message | `both views show the "no support yet" message` | `tests/note-tagging.spec.js` | e2e |
| AC-6 dismissable (close + backdrop) | `the popup can be dismissed via the close control and by clicking the backdrop` | `tests/note-tagging.spec.js` | e2e |
| AC-7 no publish/sign/persist/network | `opening, toggling, and closing the modal performs no network, navigation, or storage writes` | `tests/note-tagging.spec.js` | e2e |
| AC-8 gated (signed-out sees nothing) | `a signed-out visitor sees no tag button` | `tests/note-tagging.spec.js` | e2e |

## Edge cases

- [ ] **Propagation:** the AC-3 test includes a *positive control* (card body still opens Primal) so a
  passing AC-3 can't be a false pass from a broken spy.
- [ ] **Default tab:** exactly one tab is active on open (search), not zero or both.
- [ ] **Backdrop vs panel:** clicking the panel interior must NOT close (only the backdrop/overlay does) —
  implied by the backdrop test clicking the top-left corner; the toggle/close interactions happen inside the
  panel and do not dismiss it.
- [ ] **Inertness:** covered explicitly (AC-7) rather than assumed.

## Test infrastructure

- Framework: Playwright (boots `server.js` on `127.0.0.1:3000` per `playwright.config.js`).
- Concept Graph API: **not required** (no concepts touched).
- Firmware state: none.
- Fixtures: inline synthetic feed payloads (no relays/AI/KV).

## How to run

```
npx playwright test tests/note-tagging.spec.js     # this story
npm test                                            # full suite (unit + all e2e)
```

## Verification

Confirmed on 2026-06-25 at commit `b9f… ` (HEAD of `feat/note-tagging` at test-design):

```
npx playwright test tests/note-tagging.spec.js
7 failed   (AC-1..AC-7 — selector timeouts: .feed-note-tag-btn / #tag-modal absent)
1 passed   (AC-8 gating)
```

**Note on AC-8:** it passes *now* because there are zero `.feed-note-tag-btn` elements anywhere, so
"a signed-out visitor sees none" is vacuously true. It is a **guard that must stay green** after
implementation — i.e. once the button exists on feed cards, it must still not appear outside the gated
feed. The other 7 are genuine RED (feature-absent, each naming the missing DOM contract).
