# Test Plan: Story 7 — inline videos & extension-less Blossom media

**Story:** `engineering-team/stories/community-feed/7-inline-videos.md`
**ADR:** `engineering-team/decisions/0035-feed-inline-videos.md`
**Date:** 2026-06-29

## Approach

The feature spans two seams (ADR 0035), tested at the two layers this repo already uses:

- **`api/_lib/media.js` `extractImetaMedia(tags)`** — pure server helper resolving NIP-92 `imeta` →
  `[{ url, kind }]`. Tested with **`node --test`** (`test/extract-imeta-media.test.js`), no network.
- **`buildFeedPayload`** — attaches `note.media`. One **`node --test`** case added to
  `test/feed-handler.test.js` (fakes for all deps, per its existing style).
- **`parseNoteContent(content, media)` / `makeFeedNote`** — client render seam in `public/index.html`.
  Tested with **Playwright** (`tests/community-feed.spec.js`), exercising the exposed globals and the
  rendered DOM, mirroring the Story 3/4 idioms (`openFeedWith`, `NOTE`, route stubs).

**Testability decision (clarifies the ADR's `preload` hint):** the player is pinned to
**`preload="none"`**. Playwright's bundled Chromium can't decode H.264 and we can't ship a valid
WebV fixture, so any forced metadata fetch would `onerror`-remove the element and make assertions
flaky (the same failure mode Story 3 dodged by serving a valid PNG). `preload="none"` means the
element renders deterministically with **no media fetch**, which also happens to be the right default
for off-screen feed videos (no bandwidth until play). The story requires no poster frame, so this is
within scope. AC3's test asserts `preload === 'none'` to lock the contract; the runtime-degradation
test (AC7b) forces `.play()` against an aborted host to exercise the `onerror` → shortened-link path.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC1 extension video embeds, URL stripped | `an extension video URL (.mp4/.webm/.mov/.m4v) goes into videos and is stripped from text` + `an extension video URL renders an inline <video>, with the URL removed from the text` | `tests/community-feed.spec.js` | unit (helper) + render |
| AC2 extension-less Blossom **video** embeds (imeta) | `an extension-less Blossom URL is classified by the imeta media arg (video → videos)` + `an extension-less Blossom video embeds when imeta declares it a video` | `tests/community-feed.spec.js` | unit + render |
| AC2 extension-less Blossom **photo** embeds (imeta) | `an extension-less Blossom URL classified as image goes into images (reuses the grid)` + `an extension-less Blossom photo embeds into the image grid when imeta declares it an image` | `tests/community-feed.spec.js` | unit + render |
| AC3 muted, controls, no autoplay, click ≠ Primal | `the player is muted, has controls, does not autoplay, lazy-loads, and swallows its own clicks` | `tests/community-feed.spec.js` | render |
| AC4 card body still opens Primal | `clicking the card outside the player still opens the note in Primal` | `tests/community-feed.spec.js` | render |
| AC5 image + video coexist, both URLs stripped | `a note with both an image and a video renders both, and neither URL remains in the text` | `tests/community-feed.spec.js` | render |
| AC6 non-media URL shortened (unchanged) | covered by Story 3 `a non-image URL is shown shortened…` + helper `only the first video…` (second stays shortened) | `tests/community-feed.spec.js` | render + unit |
| AC7 graceful degradation | (a) `an extension-less link with no imeta degrades to a shortened display-only link (no player)`; (b) `a video that fails to load is replaced by a shortened display-only link` | `tests/community-feed.spec.js` | render |
| AC8 unsafe scheme inert | `an unsafe "video" URL (javascript:/data:) is never classified as media — inert text` + `an unsafe "video" URL injects no player and runs no script` | `tests/community-feed.spec.js` | unit + render |
| AC9 no video → unchanged | `a note with no video renders no player` | `tests/community-feed.spec.js` | render |
| `imeta` → `{url,kind}` (server) | all of `test/extract-imeta-media.test.js` (video, image, field-order, no-`m`, unsupported `m`, non-http(s), dedupe, order, non-imeta/empty) | `test/extract-imeta-media.test.js` | unit |
| `note.media` on payload | `attaches an imeta-derived media list to each note (Story 7)` | `test/feed-handler.test.js` | integration |

## Edge cases

- [x] One-player cap: two video URLs → first embeds, second stays a shortened link (helper + render).
- [x] Duplicate video URL → embedded once (helper dedupe).
- [x] `imeta` with no `m` / unsupported `m` (audio, pdf) → skipped (server unit).
- [x] `imeta` field order varies / extra fields (dim, x, blurhash) → still parses url + m.
- [x] Non-http(s) `imeta` url (`data:`) → dropped server-side (and client `safePicUrl` gate).
- [x] Back-compat: `parseNoteContent(content)` called with **one** arg still returns a `videos` array.
- [x] Runtime load failure → `onerror` swaps the player for a shortened link (no broken box).
- [x] Empty / missing `tags` array → `extractImetaMedia` returns `[]`.

## Test infrastructure
- Frameworks: Node built-in runner (`node --test test/*.test.js`) + Playwright (`tests/*.spec.js`).
- Concept Graph API: **not required** (no concepts touched; was unreachable during planning).
- Firmware state: **no reinstall** (no concept definitions).
- Fixtures: synthetic `imeta` tags + Blossom-shaped URLs in the specs; image hosts (`img.test`,
  `blossom.test`) routed to a 1×1 PNG; video host (`vid.test`) aborted so `preload="none"` is enforced
  and the AC7b error path is deterministic. No live relays / no network.

## How to run

```
npm test                                   # unit + playwright
node --test test/extract-imeta-media.test.js test/feed-handler.test.js   # fast unit slice
npx playwright test tests/community-feed.spec.js -g "Story 7"            # browser slice
```

## Verification

The new tests fail with the current code, for the right reasons. Confirmed 2026-06-29 on branch
`feat/community-feed` (pre-implementation):

```
# node --test test/extract-imeta-media.test.js test/feed-handler.test.js
✖ test/extract-imeta-media.test.js   → Cannot find module '../api/_lib/media.js'  (helper not built yet)
✖ feed-handler: attaches an imeta-derived media list to each note (Story 7)
     AssertionError: note carries a media array  (payload has no `media` field yet)
   (the 6 pre-existing feed-handler tests still pass)

# npx playwright test tests/community-feed.spec.js -g "Story 7"
14 failed, 4 passed (1.0m)
  failed  → all assertions requiring the feature: parser `videos` output, the <video> player,
            muted/controls/preload, imeta video+photo embed, image+video coexist, runtime degrade,
            one-player cap.
  passed  → the 4 negative/regression guards that already hold and must keep holding:
            no-video→no-player, hostile→no-player+no-script, extension-less-no-imeta→shortened link,
            card-body→opens Primal.
```
