# ADR 0035: Feed inline videos & extension-less Blossom media (Story #7)

**Status:** Accepted
**Date:** 2026-06-29
**Story:** `engineering-team/stories/community-feed/7-inline-videos.md`

## Context

Story #7 extends feed rich-rendering (ADR 0030 images, ADR 0031 mentions) to **videos**, and closes a
gap those left open: media served from **Blossom** at an **extension-less** content-hash path
(`blossom.primal.net/<sha256>`) currently renders as a truncated text link for **both** video and
photo. A Blossom URL carries **zero type information** — no extension, no `image`/`video` in the path —
so ADR 0030's extension matcher cannot classify it.

The story's required outcomes:
- Extension video URLs (`.mp4/.webm/.mov/.m4v`) → inline **click-to-play, muted, no-autoplay** player.
- Extension-less Blossom **video** → same player; extension-less Blossom **photo** → ADR 0030 grid.
- Player clicks **must not** bubble to the card's open-in-Primal handler; the rest of the card still
  opens Primal.
- At most **one** inline player per card; extra videos → shortened display-only links.
- Unconfirmable candidate → **graceful degradation** to a shortened display-only link (no broken box).
- `javascript:`/`data:`/markup stays inert (http(s) only).

The story names **two authoritative sources** for resolving an extension-less URL's type: (1) the
note's **NIP-92 `imeta`** metadata (preferred — no network), (2) a **content-type `HEAD` probe**
(fallback — round-trip cost + browser CORS).

### The decisive architectural fact

`getFeed()` is **only** `fetch('/api/feed')` (`public/index.html:2078-2081`) — there is **no**
client-side relay fallback for the feed. The server payload builds each note as
`{ id, pubkey, created_at, content, channels, author }` (`api/feed.js:64-79`) and **drops the raw
event `tags`**. Therefore **`imeta` is not visible to the browser today.** Source (1) — the preferred,
zero-network source — is only reachable if the **server** reads `imeta` off the raw event (which it
already holds as `ev.tags` in `buildFeedPayload`) and adds it to the note payload. Source (2), a
content-type probe, is unreliable from the browser (cross-origin `HEAD` headers are usually blocked by
CORS) and so would also belong server-side. Both authoritative sources point at the **server** as the
place to resolve type; the client only renders.

**Existing pieces to reuse:**
- `parseNoteContent(content)` (`public/index.html:1723`) — the pure `{ text, images }` seam ADR 0030
  built and explicitly designed to be extended; `shortenUrl` (`:1716`), `safePicUrl` (`:1708`).
- `makeFeedNote(note)` (`:2214`) — image-grid + avatar DOM idiom (`img.onerror = () => img.remove()`).
- `.feed-note-media*` CSS (`:684-695`) — the grid videos can share a container with.
- `buildFeedPayload(deps)` (`api/feed.js:40`) + the `_lib/*.js` pure-helper convention.

**Constraints (project + prior ADRs):** No build step / no new client deps (CLAUDE.md). XSS-safe by
construction — no `innerHTML` of user-derived markup; media injected only from sanitized http(s) URLs
(ADR 0030 posture). Additive to the ADR 0029 payload contract. No concepts touched → **no firmware
reinstall**.

## Options considered

### Option A — Server resolves type from `imeta`; client merges + renders (recommended)
**Server (`api/feed.js`):** a pure helper `extractImetaMedia(tags)` (new `api/_lib/media.js`,
unit-tested) parses NIP-92 `imeta` tags into `[{ url, kind: 'image' | 'video' }]` (from the `m
image/* | video/*` field), sanitized to http(s). `buildFeedPayload` adds `media: extractImetaMedia(ev.tags)`
to each note (additive to the ADR 0029 contract; ~one line in the `selected.map`).

**Client (`public/index.html`):** extend `parseNoteContent(content, media = [])` to a pure
`{ text, images, videos }`. For each http(s) URL in content, classify in priority order: **(1)** the
server `media` map (covers extension-less Blossom — image→`images`, video→`videos`); **(2)** the
extension regex (ADR 0030 image set → `images`; new `\.(mp4|webm|mov|m4v)` → `videos`); **(3)**
otherwise `shortenUrl` in place. The **first** video URL is stripped + embedded; any **further** video
URLs are shortened in place (one-player cap). `makeFeedNote` renders images via the **unchanged ADR
0030 grid** (now fed from both sources, deduped) and embeds `videos[0]` as a DOM `<video>`.

- **Pros:** Uses the **preferred** zero-network source; **no per-request HEAD storm**. XSS-safe by
  construction (DOM `<video>`/`<img>` from http(s)-only URLs; everything else stays escaped text).
  Reuses the ADR 0030 grid and the `parseNoteContent` seam exactly as that ADR anticipated. Additive
  server change; `getFeed` shape stays backward-compatible. Both helpers stay pure/unit-testable.
- **Cons:** Needs a (small) backend change, so detection spans server + client. Extension-less media
  whose author emitted **no** `imeta` won't embed in v1 — it degrades to a shortened link (allowed by
  the story's graceful-degradation criterion). A content-type probe to catch that case is **deferred**
  (clean seam: `media.js` is where a server-side probe would later augment `imeta`).

### Option B — Add a server-side content-type `HEAD` probe (in addition to / instead of `imeta`)
For each extension-less, no-`imeta` URL, the server issues a `HEAD` and reads `Content-Type`.

- **Pros:** Catches extension-less media even when the author emitted no `imeta`.
- **Cons:** Up to ~100 notes × N URLs of **extra network round-trips on the feed request** —
  latency + failure modes + a cache to design — for the minority of media that both lacks an extension
  **and** lacks `imeta`. Disproportionate for v1. **Deferred**, not rejected: Option A leaves the seam
  (`extractImetaMedia` → a future `resolveMediaType` in `media.js`) to add it behind `imeta` later.

### Option C — Pure client-side "optimistic load" probe (no backend change)
Client tries each extension-less Blossom URL as a `<video>`, and on error falls back to `<img>`.

- **Pros:** No backend change.
- **Cons:** Double-fetches media bytes, causes load/flicker, can't reliably distinguish types, and
  fights CORS. Hacky and wasteful. **Rejected.**

## Decision

**Option A.** Resolve extension-less media type **server-side from `imeta`** (the story's preferred
authoritative source — zero network), pass a small additive `media` descriptor list to the client, and
**render** in the existing client seam: images reuse the ADR 0030 grid, the first video embeds as an
inline `<video>`. The content-type **probe (Option B) is deferred** behind a clean seam in
`api/_lib/media.js`; extension-less media lacking `imeta` degrades to a shortened link per the story's
graceful-degradation criterion. Option A is the only choice that uses the preferred source, stays
XSS-safe by construction and dependency-free, and reuses the proven image/avatar idioms.

> **Confirmed with the PO (2026-06-29):** ship v1 as **`imeta`-only** (no `HEAD` probe). This satisfies
> the Blossom criteria for notes that carry `imeta` — the common case for Primal/Blossom uploads like
> the screenshot — and degrades the rest to a shortened link. Embedding extension-less uploads that
> carry **no** `imeta` is **deferred to a follow-up story** (the probe slots into `media.js`).

## Consequences

- **Enables:** inline videos + extension-less Blossom photos; a provider-agnostic `media` descriptor on
  each note that future embed work (and the deferred probe) can extend without touching `getFeed`'s
  call shape.
- **Payload:** `note.media: [{ url, kind }]` is **added** to the ADR 0029 contract (additive,
  backward-compatible). Raw `tags` are **not** exposed wholesale — only resolved, sanitized media
  descriptors — keeping payload small and the client surface narrow.
- **Security:** text → `escHtml` (unchanged); `<img>`/`<video>` built via `document.createElement`,
  `.src` = `safePicUrl`-sanitized http(s) URL only, `onerror` removal. A `javascript:`/`data:`/markup
  token matches no media source and stays escaped text → **inert, no element, no script** (AC honored).
- **Interactivity:** the `<video>` (with native `controls`) calls `stopPropagation()` on `click` and
  `keydown` so play/pause/controls don't reach the card's open-in-Primal handler (`:2286-2287`); clicks
  elsewhere on the card still open Primal. This is the one place Story 7 diverges from ADR 0030's
  "let clicks bubble" choice (images had no interactive controls; video does).
- **Degradation:** a `<video>` that fails to load (`onerror`) is removed and replaced by a shortened
  display-only link node — **never a broken player box** (AC honored). Same path covers an
  extension-classified URL that turns out not to be playable.
- **Constrains / debt:** extension-less media **without** `imeta` won't embed in v1 (→ shortened link)
  until the deferred content-type probe lands. One inline player per card; extra videos → shortened
  links. `imeta`↔content matching is by exact URL string (the visible link in content is what we strip).
- **Firmware reinstall required?** **No** (no concept definitions touched).

## Implementation notes

**Server — `api/_lib/media.js` (new) + `api/feed.js`:**
1. `extractImetaMedia(tags)` — pure. For each `tags` entry with `t[0] === 'imeta'`, parse its
   space-delimited `key value` parts (`url …`, `m image/png | video/mp4`). Emit
   `{ url, kind }` where `kind = m.startsWith('video/') ? 'video' : m.startsWith('image/') ? 'image' :`
   skip; keep only `safePicUrl`-style http(s) URLs; dedupe by URL. Export for unit tests.
2. In `buildFeedPayload`'s `selected.map((ev) => …)` (`api/feed.js:64-79`), add
   `media: extractImetaMedia(ev.tags)`. No other server change; classification/curation untouched.

**Client — `public/index.html`:**
3. `parseNoteContent(content, media = [])` (`:1723`) → returns `{ text, images, videos }`. Build a
   `Map(url → kind)` from `media`. In the single URL pass: imeta-map hit → push to `images`/`videos`
   and strip from text; else extension-image → `images` (strip); else extension-video → `videos`
   (strip **first** only; later videos `shortenUrl` in place); else `shortenUrl`. Dedupe `images` and
   `videos` by URL (preserve order). Keep pure; expose globally for tests (as ADR 0030 did).
4. `makeFeedNote(note)` (`:2214`) → `const { text, images, videos } = parseNoteContent(note.content || '', note.media)`.
   Images render via the **unchanged** ADR 0030 grid. If `videos.length`, build a `.feed-note-video`
   wrapper before `.feed-note-open` containing `<video controls muted playsinline preload="metadata">`,
   `src = safePicUrl(videos[0])`; `video.onerror` → replace wrapper with a shortened-link node;
   `click`/`keydown` → `stopPropagation()`.
5. **CSS** (~`:684`) — `.feed-note-video { margin-top: .7rem }` and
   `.feed-note-video video { width:100%; max-height: 26rem; border-radius:8px; display:block; background:#000 }`.

**Tests (for the Tester):** unit `extractImetaMedia` (image/video/skip/sanitize/dedupe); unit
`parseNoteContent` with a `media` arg (imeta image→images, imeta video→videos, extension video, first-
video-only strip, non-media shorten, `javascript:`/`data:` inert); render-level: player present + click
doesn't open Primal + card-elsewhere does + `onerror` degrades to link + image+video coexist.

## Out of scope
- Content-type `HEAD` probe (Option B) — **deferred** to a follow-up behind `media.js`.
- Multiple inline players / gallery, server-generated posters, oEmbed (YouTube/Vimeo), HLS/streaming,
  `nevent`/`note` quote expansion, link previews, audio-only.
- Any change to ADR 0030 extension-image rendering beyond feeding it the new imeta-image source.
