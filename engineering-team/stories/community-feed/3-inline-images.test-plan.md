# Test Plan: Story 3 — Rich note rendering (inline images)

**Story:** `engineering-team/stories/community-feed/3-inline-images.md`
**ADR:** `engineering-team/decisions/0030-feed-inline-images.md`
**Date:** 2026-06-15

## Approach

Render-layer tests added to the existing `tests/community-feed.spec.js` (Playwright). Reuse the
established seam: `openFeedWith(page, payload)` stubs `window.getFeed` and opens the feed; the `NOTE`
fixture's `content` is overridden to carry image / non-image URLs. Assertions are on the rendered
card DOM.

**Image loading:** image `<img>` nodes use `img.onerror = () => img.remove()` (avatar idiom), so an
image URL that fails to load is removed — which would make assertions flaky. To keep the `<img>`
stable, tests register `page.route(/img\.test/ …)` to **fulfill** requests to a test image host
(`https://img.test/…`) with a 1×1 PNG. Real network is never hit. (`data:`/`javascript:` URLs are
**not** valid http(s) images and must NOT render — used in the security test.)

**Helper contract (from ADR 0030):** new globals `parseNoteContent(content) → { text, images }` and
`shortenUrl(url)`. `makeFeedNote` renders `text` into `.feed-note-excerpt` (omitted when empty) and,
when `images.length`, a `.feed-note-media` grid of up to 2 `.feed-note-media-tile` (each an `<img>`),
with a `.feed-note-media-overlay` (text `+N`) on the **second** tile when `images.length > 2`. Images
built via DOM, `src` sanitized to http(s) (`safePicUrl`). No `getFeed` contract change.

## Coverage map

| Criterion | Test name | Level |
|---|---|---|
| Helper: image extract + strip | `parseNoteContent extracts image URLs and strips them from the text` | unit |
| Helper: shorten | `shortenUrl strips the scheme and truncates long URLs` | unit |
| AC1 + AC4 (image renders, URL stripped, single → no overlay) | `a single image URL renders as an image, no overlay, and is removed from the text` | e2e |
| AC2 (two side-by-side) | `two image URLs render as two side-by-side tiles` | e2e |
| AC3 (+N overlay on 2nd tile) | `more than two images show a "+N" overlay on the second tile` | e2e |
| AC5 (non-image URL shortened, display-only) | `a non-image URL is shown shortened and is not a clickable link` | e2e |
| AC6 (preserved plain text / no media) | `a note with no URLs renders plain text with no media grid` | e2e |
| AC7 (security — inert text) | `hostile content renders as inert text — no injected image, no script` | e2e |

AC6's "click opens the note in Primal" remains covered by the existing Story-1 test
`clicking a note opens it in Primal…`; this story adds the "no media grid for plain notes" half.

## Edge cases
- [x] Exactly 1 image → 1 tile, **no** overlay (AC1/AC4 test).
- [x] Exactly 2 images → 2 tiles, **no** overlay (AC2 test).
- [x] 5 images → 2 tiles, overlay reads **"+3"** on the 2nd tile (AC3 test).
- [x] Long extension-less URL → shortened with "…", host preserved, **no `<a>`** (AC5 test).
- [x] `javascript:`/`data:`/`<img onerror>` → escaped inert text, **no** `<img>` injected, **no** dialog (AC7 test).
- [x] URL stripped from displayed text (AC1 asserts `.feed-note-excerpt` lacks the raw URL).

## Test infrastructure
- Playwright (`@playwright/test`), config `playwright.config.js` (boots `server.js`).
- `page.route(/img\.test/)` fulfills a 1×1 PNG so image `<img>`s persist; no live network.
- `page.on('dialog', …)` guards the security test (asserts no alert fires).
- Fixtures: `openFeedWith` + `NOTE` (existing), plus `ONE_PX_PNG` buffer + `routeImages(page)` (new).

## How to run
```
npx playwright test tests/community-feed.spec.js
```

## Verification
Confirmed 2026-06-15 at commit `7386f31`. Of the 8 new tests, **6 fail** for the right reasons and
**2 are preservation guards** that correctly pass against current code (they must keep passing):

```
$ npx playwright test tests/community-feed.spec.js
  6 failed, 20 passed

Failing (need new behavior):
- "parseNoteContent must be a global"  / "shortenUrl must be a global"
- locator('.feed-note-media') / '.feed-note-media-tile' — not found (no image rendering yet)
- AC5: full URL still shown (no shortening yet)

Passing guards (must stay green after impl):
- AC6 "no media grid for a plain note" — true now (no media feature) and must remain true.
- AC7 "hostile content stays inert" — current code escapes all content; guards that the new
  image rendering does NOT introduce an injection/innerHTML vector.
```

No regression: the 18 existing feed tests and the 13 local-signer tests are unaffected.
