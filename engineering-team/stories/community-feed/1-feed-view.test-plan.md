# Test Plan: Story 1 — Feed view (community feed of Bitcoin/Nostr notes)

**Story:** `engineering-team/stories/community-feed/1-feed-view.md`
**ADR:** `engineering-team/decisions/0029-community-feed-view.md`
**Date:** 2026-06-12

## Approach

Playwright e2e against the static app (`server.js` → `127.0.0.1:3000`), matching the existing
`tests/local-signer.spec.js` style. **No live relays:** tests override the app's global seams via
`page.evaluate` — `window.getTagItems` (membership input), `window.queryRelay` (the nos.lol fetch),
`window.fetchMetadata` (kind-0 profiles), and `window.getFeed` (the ADR's data-layer boundary).

The ADR's three-layer split gives two clean test surfaces:
- **Data layer** — call `window.getFeed()` directly with `queryRelay`/`getTagItems`/`fetchMetadata`
  stubbed; assert on the returned `{ memberCount, notes }` and on the relay filter it sent.
- **Render layer** — stub `window.getFeed` to a fixed payload, drive `showView('feed')`/
  `loadFeedPage()`, and assert on the DOM (`#feed-*`, `.feed-note*`).
- **Gating/nav** — drive sign-in (extension-mock pattern from the local-signer guard test) and assert
  Feed nav visibility.

## Selector / seam contract (the implementation must satisfy)

DOM:
- `#nav-feed-li` (wrapper, `display:none` until the signed-in user is a verified member) → `#nav-feed-btn` (text "Feed").
- `#page-feed` (`class="page hidden"`, toggled by `showView('feed')`).
- `#feed-header` — text "X members contributing to the discussion".
- `#feed-loading` — loading indicator; `#feed-empty` — empty state; `#feed-notes` — notes container.
- `.feed-note` — one per note (the clickable card); children `.feed-note-name`, `.feed-note-npub`,
  `.feed-note-time`, `.feed-note-excerpt` (note text), `.feed-note-open` ("Open in Primal").

Globals (function declarations, so tests can override `window.<name>` and the app calls the override):
- `getFeed()` → `Promise<{ memberCount:int, notes:[{ id, pubkey, created_at, content, author:{ displayName, npubShort } }] }>` (notes newest-first).
- `loadFeedPage()` renders the current `getFeed()` result into `#page-feed`.
- `makeFeedNote(note)` builds one `.feed-note` from a contract-shaped note.
- `showView('feed')` reveals `#page-feed` and lazy-loads on first view.
- Existing/overridable: `queryRelay`, `getTagItems`, `fetchMetadata`. New export: `window._nostrNoteEncode`.

Constants the data layer must use: relay `wss://nos.lol`; hashtags `['nostr','asknostr','grownostr','bitcoin','btc','lightning','sats']`; cap `100`.

## Coverage map

| Criterion | Test name | File | Level |
|---|---|---|---|
| AC-1 (verified sees Feed nav, can open it) | `a verified member sees a Feed nav option and can open the feed` | `tests/community-feed.spec.js` | e2e |
| AC-2 (signed-out can't access) | `a signed-out visitor does not see the Feed` | same | e2e |
| AC-2 (non-member can't access) | `a non-member does not see the Feed` | same | e2e |
| AC-3 (only member + hashtag kind-1; exclusions) | `getFeed queries nos.lol for kind-1 notes restricted to verified members and the qualifying hashtags` | same | integration |
| AC-4 (≤100, newest-first) | `getFeed returns at most 100 notes, newest-first, when more qualify` | same | integration |
| AC-5 (name → npub fallback) | `getFeed resolves the display name from metadata, falling back to a truncated npub` | same | integration |
| AC-5 (card shows name/npub/time) | `a feed card shows the display name, truncated npub, and post time` | same | e2e |
| AC-6 (text ≤280 + ellipsis) | `note text is shown up to 280 characters and truncated with an ellipsis beyond` | same | e2e |
| AC-7 (open in Primal; no controls) | `clicking a note opens it in Primal in a new tab, with no interaction controls present` | same | e2e |
| AC-8 (header member count) | `the header reads "X members contributing to the discussion"` | same | integration+e2e |
| AC-9 (loading) | `a loading indicator is shown while the feed is fetching` | same | e2e |
| AC-9 (empty) | `an empty feed shows an empty-state message, not a blank screen` | same | e2e |

## Edge cases

- [x] **>100 notes** → exactly 100, the newest (AC-4); boundary of the slice.
- [x] **Note exactly 280 vs 281 chars** → no ellipsis vs ellipsis (AC-6).
- [x] **Author with no kind-0 metadata** → npub fallback (AC-5).
- [x] **Distinct vs duplicate authors** → header counts distinct only (AC-8); singular "1 member".
- [x] **Empty result** → empty state, no blank screen (AC-9).
- [x] **Exclusion enforced by the relay filter** → asserted by capturing the filter (authors = verified set, `#t` = the 7 tags, kind 1, relay = nos.lol), since the ADR filters relay-side, not client-side.

## Test infrastructure
- Framework: Playwright (`@playwright/test`), config `playwright.config.js` (boots `server.js`).
- No Concept Graph API / firmware preconditions (read-only feature, no concepts).
- No live network: all relay/metadata seams stubbed via `page.evaluate` / `page.addInitScript`.
- Fixtures: synthetic LFO tag items (SEED → member) and synthetic kind-1 notes, built inline.

## How to run

```
npm test
```
or specifically:
```
npx playwright test tests/community-feed.spec.js
```

## Verification
All 13 tests fail against current `public/index.html` (no feed exists), each for the right reason —
not test bugs. Confirmed 2026-06-12 at commit `0c365cd`:

```
$ npx playwright test tests/community-feed.spec.js
  13 failed

Representative failure reasons:
- data-layer tests: "getFeed() must exist as a global" — expect(typeof window.getFeed).toBe('function')
- render tests: locator('#feed-notes .feed-note' / '#feed-header' / '#feed-empty' / '#feed-loading')
  — element(s) not found
- nav/gating tests: locator('#nav-feed-li') — element(s) not found / toHaveCount(1) fails (count 0)
```

The two AC-2 negative tests were strengthened to assert `#nav-feed-li` **exists and is hidden**
(`toHaveCount(1)` + `toBeHidden`), so they fail now (count 0) rather than false-passing on a missing
element, and become real gating guards once the static nav item lands.
