# ADR 0030: Feed inline images (Story #3)

**Status:** Accepted
**Date:** 2026-06-15
**Story:** `engineering-team/stories/community-feed/3-inline-images.md`

## Context

Story #3 renders **inline images** in feed note cards. Today `makeFeedNote()`
(`public/index.html:2062`) renders `note.content` as escaped plain text into `.feed-note-excerpt`
(`:2085`); any image URL in the content shows as raw text. We want: image URLs rendered as images,
up to **two side-by-side**, a dimmed **"+N" overlay** on the second tile when there are more, and the
media URL(s) **removed from the displayed text**. Additionally, **non-image URLs** that remain in the
text (including extension-less image hosts we can't detect) should be **shortened (display-only)** so a
long raw URL doesn't clutter the card.

**Constraints (story + project):**

- **Render-layer only.** No `getFeed()` contract change, no relay/data-layer change. (Mention
  resolution — Story #4 — is the one with a data-layer wrinkle; not this story.) Story 1 behavior
  must stay intact.
- **No build step / no new deps** (CLAUDE.md). Static `public/index.html`.
- **Security is the headline concern.** We are parsing arbitrary user content and rendering
  arbitrary URLs. The bar: **no `innerHTML` of unescaped/user-derived markup**, and images injected
  only from **sanitized http(s) URLs**.
- **No concepts touched** → **no firmware reinstall**. Concept Graph API was unreachable; not needed.

**Existing pieces to reuse** (`public/index.html`):
- `safePicUrl(url)` (`:1644`) — returns the URL only if it starts with `http(s)://`, else `''`. Already
  used for avatars.
- The avatar injection pattern in `makeFeedNote` (`:2089-2100`) — build an `<img>` via DOM, set
  `.src`, `img.onerror = () => img.remove()`. This is the safe template for media too.
- `escHtml` (`:1524`) — used for all text interpolated into `innerHTML`.

## Options considered

### Option A — Parse content into `{ text, images }`; render text escaped, images via DOM nodes
A pure helper `parseNoteContent(content)` extracts image URLs (by extension), sanitizes them
(`safePicUrl`), and returns the text with those URLs stripped. `makeFeedNote` renders the (escaped)
text as today, then appends a media grid whose `<img>` elements are built with `document.createElement`
(never `innerHTML`), `.src` = sanitized URL, `onerror` removal — exactly the avatar pattern.

- **Pros:** XSS-safe **by construction** (text is escaped; images are DOM nodes from http(s)-only
  URLs; non-image / hostile tokens never become elements — they stay escaped text). Parsing is
  isolated and unit-testable. Reuses `safePicUrl` + the avatar idiom. No deps.
- **Cons:** A little more code in the render path; the parse helper needs care around URL boundaries.

### Option B — Build one HTML string that interleaves escaped text and `<img>` tags, set via `innerHTML`
Replace image URLs inline inside the content string with `<img src=…>`, escaping the rest.

- **Pros:** single `innerHTML` assignment; inline image position preserved.
- **Cons:** **Rejected on security grounds.** Mixing escaped text with raw `<img>` tags in one string
  is the classic XSS footgun — one mistake in the escape/replace ordering injects markup. Also fights
  the story's "grid below the text" layout. Not worth the risk for this feature.

### Option C — Pull in a Nostr content/markdown rendering library
Use an existing parser to render embeds.

- **Pros:** handles many embed types.
- **Cons:** adds a dependency + bundle, against JS-without-build; far more surface than "render image
  URLs"; we only want images (and, later, mentions). Rejected.

## Decision

We chose **Option A**. It is the only option that is XSS-safe by construction while staying within
JS-without-build, and it reuses the exact avatar-image idiom already proven in `makeFeedNote`. Parsing
lives in a small, testable helper; rendering stays in `makeFeedNote`. **`getFeed()` and its contract
are untouched** — this is purely how a note's `content` is turned into DOM.

**Answer to the design question:** yes — `makeFeedNote` parses `content` into `{ text, images }` via a
dedicated helper that lives next to the other display/sanitize helpers (`escHtml`/`safePicUrl`,
~`:1524`–`:1644`), so it's reusable and unit-testable. Images render **below** the text.

## Consequences

- **Enables:** readable image posts; a clean seam (`parseNoteContent`) that Story #4 (mentions) and
  any future embed work can extend without touching `getFeed`.
- **Security posture:** text → `escHtml` (unchanged); images → DOM `<img>` from `safePicUrl`-sanitized
  http(s) URLs only. A `javascript:`/`data:`/`<img onerror=…>` token never matches the image-URL
  pattern, so it remains in the text and is escaped → **inert text, no element, no script** (Story AC-6).
- **Constrains / debt:** image detection is **extension-based** (jpg/jpeg/png/gif/webp/avif) — image
  URLs without an extension (some CDNs) won't render **inline** in v1. They no longer clutter the
  card, though: any non-image URL is **shortened to display-only text** (scheme stripped, truncated
  with an ellipsis), and the live link remains reachable in Primal. Only the **first two** images
  render; extras are summarized by the overlay. A broken image URL drops its `<img>` via `onerror`
  (mirrors avatar) — the tile may show its empty background; acceptable for v1.
- **Firmware reinstall required?** **No** (no concept definitions touched).

## Implementation notes

All changes in `public/index.html`; additive; `getFeed()` and Story 1 behavior unchanged.

1. **`parseNoteContent(content)`** — new global helper near `safePicUrl` (~`:1644`). Pure function,
   single pass over **all** http(s) URLs (`/(https?:\/\/[^\s<>"']+)/gi`):
   - **Classify each URL.** Image = matches the extension pattern
     `\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s<>"']*)?$` **and** `safePicUrl(url)` is non-empty →
     collect into `images` (deduped, order preserved) and **remove** it from the text.
   - **Non-image URL** → replace it in the text with a **shortened display string** via a small
     `shortenUrl(url)` helper: strip the `https?://` scheme and trailing slash, and if the remainder
     exceeds ~30 chars, truncate to ~30 + "…" (host stays visible for short hosts). Display-only — it
     stays inside the `escHtml`-ed text (inert, not an anchor).
   - `text` = the content after those substitutions, trimmed, with runs of blank lines collapsed.
   - Return `{ text, images }`. No DOM, no side effects (unit-testable; expose `parseNoteContent` and
     `shortenUrl` as globals so the app and tests can call them).

2. **`makeFeedNote(note)`** (`:2062`) — minimal edits:
   - Replace `const text = note.content || ''` (`:2068`) with
     `const { text, images } = parseNoteContent(note.content || '')`.
   - Keep the existing `innerHTML` template, but render `.feed-note-excerpt` **only when `text` is
     non-empty** (an image-only note shows no empty paragraph). Text is still `escHtml`-ed — unchanged.
   - After the excerpt, if `images.length`, build a `.feed-note-media` container and append up to **2**
     `.feed-note-media-tile` nodes, each with an `<img>` created via `document.createElement('img')`,
     `img.alt = ''`, `img.src = images[i]`, `img.onerror = () => img.remove()` (avatar idiom, `:2094`).
   - If `images.length > 2`, add a `.feed-note-media-overlay` element to the **second** tile with text
     `+${images.length - 2}`.
   - **Do not** add per-image click handlers — clicks bubble to the card's existing
     open-in-Primal handler (`:2102`), satisfying "clicking the card opens it in Primal" with no
     lightbox. Build all media with DOM nodes, never `innerHTML` of a URL.

3. **CSS** — add near the feed styles (~`:600`s): `.feed-note-media` (2-col grid, gap, margin-top),
   `.feed-note-media-tile` (relative, rounded, overflow hidden, fixed/`aspect-ratio` box),
   `.feed-note-media-tile img` (`width/height 100%`, `object-fit: cover`), `.feed-note-media-overlay`
   (absolute, full-tile, dim `rgba` background, centered bold "+N"). A single image still sits in the
   grid (one column / constrained width).

## Out of scope
- **Mention resolution** — Story #4 (extends the same `makeFeedNote`/parse seam).
- **Clickable** links — non-image URLs are shortened to **display-only** text; the live link is in Primal.
- Video/other embeds, `nevent`/`note` quotes, per-image lightbox/gallery, detecting images by host
  without an extension.
