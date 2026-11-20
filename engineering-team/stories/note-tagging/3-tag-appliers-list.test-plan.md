# Test plan: Story 3 — See who applied a topic tag to a post

**Story:** `engineering-team/stories/note-tagging/3-tag-appliers-list.md`
**ADR:** `engineering-team/decisions/0050-tag-appliers-list.md`
**Spec:** `tests/tag-appliers-list.spec.js` (Playwright, offline, stubbed feed/signer/publish)

## Fixture
- Signed-in member `ME`. `memberNames` has Alice, Bea, ME, and a name containing markup (Eve).
- **Note `NOTE_ID`:** `appliers = [Alice, Bea, Bea, NONAME, ME]`. That's 4 distinct appliers,
  one of them without a name.
- **`FRESH_ID`:** an untagged note, used for the just-applied case.
- **`SECOND_ID`:** a note tagged only by Alice, used to test a second list.
- The signer runs in extension mode, so an apply needs no consent step.

## Coverage map

| Acceptance criterion | Tests |
|---|---|
| Opens the list (click/tap/Enter/Space; press again closes) | T1, T2, T3 |
| Names (profile name / short npub / `You`) | T4 |
| Count and list agree; each applier once | T4, T5 |
| Order (`You` first) | T4 |
| Just applied | T6 |
| Dismissal (Escape + refocus; press outside) | T7, T8 |
| Stays in the panel (no Primal, panel stays open) | T3, T7, T9 |
| Unchanged otherwise (inert pill; no appliers) | T11; inert pill is covered by `feed-tag-pill.spec.js` "slug-fallback entry" |
| Safe text | T10 |

## Cases
- **T1:** the count is a `button.feed-note-tag-count`.
  - Its text is still exactly `Applied by 4 members`.
  - `aria-expanded` is false, and `aria-controls` equals the list's id.
  - The list is hidden.
- **T2:** a click opens the list (`aria-expanded` true), and a second click closes it.
- **T3:** Enter opens and Space closes, and the tag panel stays visible.
- **T4:** the entries are exactly `['You', 'Alice', 'Bea', hexToNpubShort(NONAME)]`.
- **T5:** `[Alice, Alice, Bea]` shows `Applied by 2 members` and 2 entries.
- **T6:** applying Ask LFO to `FRESH_ID` gives `Applied by 1 member` and the entries `['You']`.
- **T7:** Escape closes the list, focus returns to the count, and the panel stays open.
- **T8:**
  - Opening a second note's list closes the first.
  - A press on the page outside closes the second.
- **T9:** count → entry → count produces no `window.open` call, and the pill is still expanded.
- **T10:** a name with markup shows as literal text, with no `img` child and no script effect.
- **T11:** with empty appliers there's no count line and no list.

## Regression gates (the Implementer and Reviewer must run them)
- **`tests/feed-tag-pill.spec.js` and `tests/apply-attestation.spec.js`:** they assert
  `toHaveText` on `.feed-note-tag-count`, so the button's text must stay exactly the count.
- **`tests/vouch-counts-cards.spec.js` (C1–C12 plus placement):** the voucher list now runs on
  the shared `wireDisclosure` helper (ADR 0050 §1). Hover, the pin rule, Escape, and the
  outside-press close must behave the same as before.
- **Full suites:** `npm run test:unit` (the known `builder-parity` failure is pre-existing) and
  `PORT=<free> npx playwright test`.

## Red-state check (2026-11-19)
- **T1–T10 fail:** `button.feed-note-tag-count` isn't found, because the count is still a `div`.
- **T11 passes:** it's a guard on unchanged behavior.
- **T6 got as far as the count assertion,** so the stubbed apply path itself works.

## Not automated (live-preview)
- Real names from real kind-0 profiles on a live tagged post.
- Phone tap behavior on iOS and Android.
