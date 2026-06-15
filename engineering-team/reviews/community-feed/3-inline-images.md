# Review: Story 3 — Rich note rendering (inline images)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-15
**Diff:** `git show fa626aa -- public/index.html` (impl); ADR `7386f31`, tests `28925b8`. Branch `feat/community-feed`.
**Story:** `engineering-team/stories/community-feed/3-inline-images.md`
**ADR:** `engineering-team/decisions/0030-feed-inline-images.md` (Accepted)
**Test plan:** `engineering-team/stories/community-feed/3-inline-images.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npx playwright test` — **39/39 passed** (26 `community-feed.spec.js` + 13 `local-signer.spec.js`). Ran by reviewer.
- [x] _Lint / typecheck / build — not configured (JS-without-build per CLAUDE.md); skipped._
- [x] No regression: Story 1 feed tests (18) and the local-signer suite (13) still green.

## Spec adherence
- [x] **Every acceptance criterion has a passing test** (8 Story-3 tests).

| Criterion | Test | Status |
|---|---|---|
| AC1 image renders + URL stripped | `a single image URL renders as an image, no overlay, and is removed from the text` | ✅ |
| AC2 two side-by-side | `two image URLs render as two side-by-side tiles` | ✅ |
| AC3 "+N" overlay on 2nd tile | `more than two images show a "+N" overlay on the second tile` (5 → +3) | ✅ |
| AC4 single → no overlay | (covered by the AC1 test: asserts overlay count 0) | ✅ |
| AC5 non-image URL shortened, no anchor | `a non-image URL is shown shortened and is not a clickable link` | ✅ |
| AC6 plain note unchanged / no media | `a note with no URLs renders plain text with no media grid` (guard) | ✅ |
| AC7 hostile content inert | `hostile content renders as inert text — no injected image, no script` (guard) | ✅ |
| Helper contracts | `parseNoteContent extracts…`, `shortenUrl strips…` | ✅ |

- [x] No criterion dropped; no behavior beyond the story (the shortened-link addition was folded into the story ACs + ADR before implementation).

## ADR adherence
- [x] **`parseNoteContent(content) → { text, images }`** (`public/index.html:1664`) — single pass over http(s) URLs; image = extension match **and** `safePicUrl` non-empty → deduped into `images` and stripped from text; other URLs → `shortenUrl`. Matches ADR step 1 exactly.
- [x] **`shortenUrl(url)`** (`:1661`) — strips scheme + trailing slash, truncates >30 with "…". Matches ADR step 2.
- [x] **`makeFeedNote`** (`:2104+`) — parses content; renders `.feed-note-excerpt` **only when text non-empty** (`:2124`); builds `.feed-note-media` with up to 2 `.feed-note-media-tile`, DOM `<img>` (`src` from sanitized list, `onerror` removal), `.feed-note-media-overlay` `+N` on the **second** tile when `images.length > 2` (`:2133-2151`). No per-image click handler — clicks bubble to the existing open-in-Primal handler. Matches ADR step 3.
- [x] CSS classes added per ADR step 4.
- [x] **`getFeed()` and its contract unchanged** — verified the function appears only as unchanged context in the diff. Render-layer-only as designed.
- [x] No new dependencies, no concept changes → **no firmware reinstall**.

## Concept-graph integrity
- [x] N/A — pure client-side rendering; no concept definitions touched. Concept Graph API was unreachable; correctly not depended upon.

## Things tests can't catch
- [x] **Security (the headline) — sound.** Text is `escHtml`-ed in the `innerHTML` template (`:2124`); images are **DOM-built** (`document.createElement('img')`, `:2138`) with `src` from the `safePicUrl`-sanitized (`http(s)`-only) `images` list — **no `innerHTML` of any URL**; overlay uses `textContent`. `javascript:`/`data:`/`<img onerror>` never match the http(s) URL regex, so they remain in the text and are escaped → inert (AC7 guard passes). Shortened-URL text is also escaped. XSS-safe by construction.
- [x] No secrets, no debug logging, no commented-out code.
- [x] Broken image URLs drop their `<img>` via `onerror` (avatar idiom); the tile keeps its placeholder background — acceptable.

## House rules check
- [x] Concept Graph authority respected (nothing to define).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking (optional; do not gate this story)
1. **Single image renders at half-width** — the 2-column grid (`.feed-note-media`, `:660`) places a lone image in one column, leaving the other empty. Functionally correct (AC4), but a single image may look better full-width. Worth an eyeball; optional: make a 1-image grid single-column.
2. **Fixed `aspect-ratio: 16/10` + `object-fit: cover`** crops tall/portrait images. Reasonable for a uniform grid; flag if portrait-heavy posts look badly cropped.
3. **Trailing-punctuation on URLs** (`parseNoteContent`, `:1666`) — a URL immediately followed by `.`/`)` (e.g. `pic.jpg.`) fails the end-anchored image test and falls to the shortened-link path. This is the open question already logged on the story; minor, acceptable for v1.
4. **Live-image caveat (accepted):** tests serve images via `page.route` (no live network), proving structure/sanitization but not real image loading from nostr.build etc. Recommend a **live-browser / Vercel-preview check** before deploy, since this is a visual feature.

## Verdict
**PASS**

Story #3 meets every acceptance criterion with passing tests, conforms to ADR 0030 (render-layer only; `getFeed` untouched), and — critically for this story — is **XSS-safe by construction** (escaped text, DOM-built images from sanitized http(s) URLs). Full suite 39/39, no regression. Non-blocking items are visual polish and the documented extension/trailing-punctuation limitations. Ready for the deploy chain (with a live-preview look recommended).
