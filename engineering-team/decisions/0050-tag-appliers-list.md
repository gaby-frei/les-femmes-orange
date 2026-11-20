# ADR 0050: Expandable list of tag appliers in the feed's tag panel

**Status:** Accepted (PO, 2026-11-19)
**Date:** 2026-11-19
**Story:** `engineering-team/stories/note-tagging/3-tag-appliers-list.md`

> Numbering: trust-weighted-membership #3 is paused before its ADR, so it will take the next
> free number (0051) when it resumes.

## Context

**Today's tag panel** (`public/index.html`, `makeFeedNote`, `:3886-3935`):
- Each `taggedWith` entry of a note renders as a `.feed-note-tag-pill` button.
- A pill with a description toggles a `.feed-note-tag-desc` panel. A pill without one is inert.
- The panel holds the description and, when `appliers` is non-empty, a plain
  `<div class="feed-note-tag-count">Applied by N members</div>` (note-tagging #2, ADR 0040).
- The whole `.feed-note-tags` row swallows `click` and `keydown`, so nothing inside it reaches
  the card's open-in-Primal handlers (`:3892-3894`, `:3956`).
- Everything is DOM-built with `textContent`.

**Data is already in the browser.** `appliers` is an array of hex pubkeys per tag entry, built
server-side as distinct asserters, and only member asserters count (`api/_lib/tagged.js:173`).
The feed payload also carries `memberNames` (`api/feed.js:142-148`), a hex → display-name map
for every member that has a kind-0 name. It is built from the same profile query that names
post authors (`api/feed.js:113`, `fetchMetadata` `:209-220`). `makeFeedNote` already receives
it as its second argument (`:3800`). The page holds `currentPubkey` for `You`, and
`hexToNpubShort` for the fallback. So no server or payload change is needed.

**Just-applied tags.** `applyOptimisticTag` (`:4159-4174`) pushes `currentPubkey` into the
entry's `appliers`, then `renderFeedNotes()` rebuilds every card. A list built from `appliers`
at render time therefore includes the member immediately.

**The pattern to match** is the voucher list (ADR 0049, `:2731-2795`).
- `buildVouchCount` creates a `.vouch-count-wrap` holding a `button.vouch-count`
  (`aria-expanded`, `aria-controls`) and a hidden `ul.vouch-list`.
- `wireVouchCount` handles click/tap/Enter/Space, hover with the pin rule, and Escape (which
  refocuses the button).
- One document `pointerdown` listener closes any open `.vouch-count-wrap` the press falls
  outside, with a detached-target guard.
- The list is an **absolutely positioned popover**, and it raises its card with `.vouch-open`.

**Constraints:**
- No build step, lint or typecheck.
- Relay-sourced names never go through `innerHTML`.
- Existing e2e tests (`tests/feed-tag-pill.spec.js:123-139`, `tests/apply-attestation.spec.js:176`)
  assert `toHaveText('Applied by N member(s)')` on `.feed-note-tag-count`. That element's text
  must stay exactly the count.

**Concepts:** none changed. `nostr-event-tag` assertions and kind-0 profiles are read only.
The Concept Graph API (`localhost:8877`) was unreachable, as in the last three phases, and
nothing here depends on a concept handle.

## Options considered

### Option A — Extract a shared disclosure helper; inline list in the tag panel
- Factor the open/close behavior out of `wireVouchCount` into one helper used by both the
  voucher list and the applier list. Hover is opt-in, so voucher-list behavior is unchanged.
- The count line becomes a button with a sibling `<ul>` that opens **in flow** inside the panel.
  The panel is already an in-flow block the member opened on purpose, so a popover would only
  cover the next note.
- One document closer serves both lists.
- **Pros:** one interaction pattern in code, not just in look (story D4), so a fix to one list
  fixes both. The in-flow list can't be clipped and needs no stacking fix.
- **Cons:** it touches story #2 code. Story #2's C1–C12 suite guards it.

### Option B — A separate small handler for the applier list
- Write a ~20-line toggle/Escape/outside-press handler just for the feed, and leave
  `wireVouchCount` alone.
- **Pros:** zero risk to the Members page.
- **Cons:** two copies of the same disclosure rules, plus a second document listener. They will
  drift.

### Option C — Reuse `buildVouchCount` as-is
- Adapt appliers into a breakdown shape and call the Members-page builder.
- **Cons:**
  - It brings the hover behavior that D4 excludes.
  - It brings the popover positioning and the `.vouch-open` card class, which are built for grid
    cards.
  - Its count copy (`N vouches`) is wrong here, and it needs a metaMap rather than `memberNames`.

## Decision

We chose **Option A**. The story asks for the same interaction as the voucher list, and sharing
the code is the only way to keep it the same. The refactor is mechanical, and the existing
voucher-list tests pin its behavior.

## Consequences

- Members can see who applied each tag, with no added network cost.
- `wireVouchCount`'s behavior must stay byte-for-byte equivalent: hover, the pin rule,
  `.vouch-open`, and Escape. C1–C12 in `tests/vouch-counts-cards.spec.js` are the guard, and
  the Implementer must run them.
- A re-render (applying a tag, changing channel filters) closes any open applier list. That's
  acceptable, and it matches tag panels, which also reset on re-render.
- The list follows the feed's member set. When trust-weighted-membership #3 changes that set,
  the list follows automatically.
- **Edge:** a member with no kind-0 name is missing from `memberNames` and shows as a short npub,
  as the story specifies.
- **Firmware reinstall required?** No.

## Implementation notes

All changes are in `public/index.html`.

1. **Shared disclosure** (near `:2767`). Replace `wireVouchCount`'s body with a generic
   helper:
   ```
   wireDisclosure(wrap, btn, list, { hover = false, onToggle } = {})
   ```
   - The helper owns the `set(open)` logic: `list.hidden`, `aria-expanded`, resetting the pin,
     and calling `onToggle(open)`.
   - It also owns the click/pin logic, the hover listeners (only when `hover` is set and
     `(hover: hover)` matches), and Escape: `stopPropagation`, close, `btn.focus()`.
   - It stores `wrap._closeDisclosure = () => set(false)` and marks `wrap.dataset.disclosure = ''`.
   - `wireVouchCount(card, wrap, btn, list)` becomes:
     ```
     wireDisclosure(wrap, btn, list, { hover: true, onToggle: open => card.classList.toggle('vouch-open', open) })
     ```
   - When `hover` is false, a click simply toggles. The pin rule only matters after a
     hover-open.
   - The document `pointerdown` closer (`:2788`) iterates `[data-disclosure]` instead of
     `.vouch-count-wrap`, keeps the detached-target guard, and calls `wrap._closeDisclosure()`.
2. **Label helper** (next to the feed renderer):
   ```
   applierLabel(pk, memberNames)
   ```
   It returns `'You'` when `pk === currentPubkey`, else `memberNames[pk]`, else
   `hexToNpubShort(pk)`.
3. **Applier list builder.** A function `buildApplierList(appliers, memberNames)` returns
   `{ wrap, btn }`:
   - `appliers` is de-duplicated with a Set; the existing code already counts distinct appliers.
   - Order:
     - `currentPubkey` first, if present;
     - then the rest in payload order (D3 says only "then everyone else").
   - **`wrap`:** a `div.feed-note-tag-appliers`. Using a div keeps the panel's block layout.
   - **`btn`:** a `button.feed-note-tag-count` with `type=button`.
     - Its `textContent` is exactly the existing copy `Applied by N member(s)`, where N is the
       de-duplicated length. That keeps the existing tests green.
     - Give it `aria-expanded="false"`, plus `aria-controls` pointing at a unique list id
       (`applier-list-<seq>`).
   - **List:** a `ul.feed-note-tag-applier-list` with `hidden`, holding one `li` per applier,
     filled via `textContent` with `applierLabel(...)`.
   - Wire it with `wireDisclosure(wrap, btn, list)`, with no hover.
4. **`makeFeedNote`** (`:3918-3924`). Replace the `countLine` div with
   `buildApplierList(t.appliers, memberNames).wrap` under the same `applierCount > 0`
   condition. The inert-pill and empty-appliers paths are untouched.
   - Clicks and keys inside the panel already stop at `.feed-note-tags`, so the post won't open
     in Primal.
   - The pill's own click handler is on the pill, so pressing inside the panel won't close it.
   - The Escape listener on the wrap stops propagation, so Escape won't reach anything else
     either.
5. **CSS** (near `:807`).
   - Restyle `.feed-note-tag-count` as a reset button: `font: inherit`, no background or border,
     `padding: 0`, `cursor: pointer`. Keep its current size, weight and colour.
   - Add a small caret via `::after` that flips with `[aria-expanded="true"]`.
   - Make the focus ring visible.
   - `.feed-note-tag-applier-list`: in-flow, `margin: 0.3rem 0 0`, `padding-left: 1rem`,
     `font-size: 0.78rem`, `color: var(--dark)`. Add `[hidden] { display: none }`.

**Tests the Tester should expect to write:**
- E2E (Playwright, extending the `feed-tag-pill` fixture):
  - open and close by click, Enter and Space;
  - name, `You` and npub fallback;
  - count equals the number of entries, and duplicates collapse;
  - `You` first;
  - just-applied adds `You`;
  - Escape closes the list and refocuses the count; pressing outside closes it;
  - no Primal open and no panel collapse;
  - markup in a name renders as text;
  - inert and no-applier paths are unchanged.
- **Regression:** the full `vouch-counts-cards.spec.js` run, to prove the extracted helper
  didn't change the voucher list.

## Out of scope

- Avatars, or any payload change (story D2).
- Applier lists in the feed header's active-taggers line.
- Re-ordering by when each member applied the tag. The payload doesn't carry it, and D3 doesn't
  ask for it.
- Keeping lists open across feed re-renders.
