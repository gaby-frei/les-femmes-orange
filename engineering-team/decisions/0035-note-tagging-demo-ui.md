# ADR 0035: Note-tagging demo UI — shared modal + per-card trigger

**Status:** Accepted
**Date:** 2026-06-25
**Story:** `engineering-team/stories/note-tagging/1-note-tag-demo.md`

## Context

Story 1 of the `note-tagging` epic adds a **non-functional demo**: a circular plus button on every feed
note that opens an "Add a tag" popup with two toggle views ("Search existing" / "Apply new"), both showing
"No support for event tags yet. Check back later." No event-tag is created, signed, published, queried, or
persisted — the real `nostr-event-tag` protocol is pending a teammate.

Relevant facts from the codebase:

- **Feed cards are built in `makeFeedNote()`** (`public/index.html:2213-2290`). Each card is a `<div
  class="feed-note" role="link" tabindex=0>` whose **whole surface** opens the note in Primal:
  `card.addEventListener('click', open)` and an Enter `keydown` handler (`:2281-2287`). **Any control placed
  inside the card will bubble its click to this handler** — so the plus button must stop propagation, or
  clicking it would open Primal (violating the "distinct control" AC).
- **A reusable modal pattern already exists**: `#backup-warning-modal` (`:1435`) — a `position:fixed;
  inset:0` overlay with a centered panel, shown/hidden by toggling `display`, driven by global functions
  `hideBackupWarning()` / `confirmProceedWithoutBackup()` (`:2606-2611`). The pill menu uses the same
  global-function convention (`togglePillMenu()`, `:927`).
- The app is a single classic-script `public/index.html` (JS-without-build, per CLAUDE.md). Top-level
  `function` declarations are global (callable as `window.fn`), which is how the e2e layer drives the app.
- The feed only renders for signed-in verified members (`community-feed` gating), so anything inside a feed
  card is inherently gated.

Constraints from the story: non-functional (no signing/publishing/network/persistence); tab labels
**"Search existing"** / **"Apply new"** (not the screenshot's "Create new"); message-only views (no search
box or tag list); provisional styling.

## Options considered

### Option A — One shared modal element + a per-card trigger button
A single `#tag-modal` overlay lives once in the page (mirroring `#backup-warning-modal`). `makeFeedNote()`
adds a `.feed-note-tag-btn` to each card; its click `stopPropagation()`s and opens the shared modal.
- **Pros:** one modal in the DOM regardless of note count; reuses the proven overlay pattern and
  global-function convention; trivial open/close/toggle; the modal is note-agnostic (fine — the demo does
  nothing with the note).
- **Cons:** the trigger must explicitly stop propagation to avoid the card's Primal handler (one line, but
  must not be forgotten).

### Option B — A modal/popover built inside each card
Each card renders its own popup markup, shown in place.
- **Pros:** no shared element; trigger and popup are co-located.
- **Cons:** up to ~100 hidden modals in the DOM; duplicated markup; still has the same propagation problem.
  No benefit over A.

### Option C — Anchored dropdown (reuse the pill-menu popover) instead of a centered modal
Render the panel as a dropdown anchored to the plus button.
- **Pros:** lighter than a full-screen overlay.
- **Cons:** the reference (tags.brainstorm.world) and the screenshot are a **centered modal**; an anchored
  dropdown diverges from the intended look and is fiddlier to position per-card. The story explicitly models
  the brainstorm modal.

## Decision

We chose **Option A**. One shared `#tag-modal` overlay (built on the existing `#backup-warning-modal`
pattern), opened by a per-card `.feed-note-tag-btn` whose handler stops propagation so the card's Primal
click never fires. Open/close/tab-toggle are global functions, consistent with the app's existing modal
conventions. The modal is note-agnostic for this demo.

## Consequences

- **Enables:** a faithful preview of the eventual tagging entry point with minimal surface; a clear seam
  (`#tag-modal` + `openTagModal()`) to later wire real event-tag logic into, without re-doing the markup.
- **Constrains / makes harder:** introduces the **first interactive control on an otherwise read-only feed
  card** — the propagation-stop is load-bearing and is covered by an explicit test (click the plus → modal
  opens, Primal does **not**).
- **New debt / follow-ups:** the modal is intentionally inert and note-agnostic; when the protocol lands, a
  later story wires the active note id and real search/apply behavior into this shell. Tracked at the epic
  level.
- **Firmware reinstall required?** No — no concept definitions change. No event-tag concept is created here.

## Implementation notes

**Markup (`public/index.html`)** — add a single overlay near `#backup-warning-modal` (`~:1445`):
- `#tag-modal` — `position:fixed; inset:0; display:none` overlay (reuse the backup-modal vocabulary).
- Inside: a panel with a **title "Add a tag"**, a **close button** (`.tag-modal-close`, `aria-label="Close"`),
  a tab row of two buttons —
  `.tag-tab[data-tab="search"]` "Search existing" and `.tag-tab[data-tab="apply"]` "Apply new", with
  `aria-selected` reflecting the active tab — and a body `#tag-modal-message` containing the text
  **"No support for event tags yet. Check back later."** (constant across both tabs).

**CSS** — `.feed-note { position: relative; }` (so the trigger can anchor bottom-right);
`.feed-note-tag-btn` — circular button, absolute `bottom`/`right`, orange vocabulary; `.tag-tab` active vs
inactive states (mirror the `.feed-channel[aria-pressed]` styling idiom from ADR 0034 for consistency).

**JS — in `makeFeedNote()`** (`~:2280`, before `return card`): append
`<button class="feed-note-tag-btn" type="button" aria-label="Add a tag">` (a `+` glyph/SVG). Wire:
```js
tagBtn.addEventListener('click', (e) => { e.stopPropagation(); openTagModal(); });
tagBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
```
The `stopPropagation` is what keeps the card's Primal `open()` from firing.

**JS — global functions** (top-level, matching `hideBackupWarning` style):
- `openTagModal()` — show `#tag-modal` (`display:flex`); reset active tab to "Search existing".
- `closeTagModal()` — hide it.
- `selectTagTab(name)` — set the active tab (`aria-selected`/active class) for `"search"`/`"apply"`; the
  message body is unchanged (both tabs show the same text).
- Wire `closeTagModal()` to the close button **and** to a backdrop click (clicking the overlay outside the
  panel); wire each `.tag-tab` to `selectTagTab(...)`.

**Non-functional guarantee:** these handlers touch only DOM state — no `fetch`, no `LFOSigner`, no
`window.open`, no storage. That is the whole point and is asserted by test.

## Out of scope
- Real `nostr-event-tag` creation/signing/publishing/querying, and any note-specific state in the modal —
  deferred to a later epic story once the protocol exists.
- Search box, tag list, per-tag rows — message-only per the story.
- Final visual/interaction design — provisional.
