# Story 7: Rich note rendering — inline videos & extension-less Blossom media

**Status:** Approved
**Created:** 2026-06-29
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
Story 3 (Done) renders **image** URLs inline but detects them **purely by file extension**, and it
deliberately left **video / other embeds** out of scope. Both gaps converge on the same real-world
case: the media members actually post in this feed is served from **Blossom**
(`blossom.primal.net/<content-hash>`) with **no file extension**. A Blossom URL is content-addressed —
the path is just a hash and carries **zero type information** — so today:

- A Blossom **video** shows only a truncated text link — e.g. `blossom.primal.net/1afa0e58be2…` —
  with no way to watch it in-app (the screenshot case).
- A Blossom **photo** *also* falls back to a shortened link, because Story 3's extension matcher
  can't recognize an extension-less image either.

Both are poor for a feed whose purpose is to give newcomers a feel for the community before they
adopt a full Nostr client. This story closes **both** gaps: it adds inline **video** (extension-based
*and* extension-less Blossom) and extends inline **images** to cover the extension-less Blossom case,
reusing Story 3's existing image grid. It is the sibling of Story 3 (images) and Story 4 (mentions).

## User-facing description
As a **member browsing the feed**, I want **videos and photos in notes shown inline** — playable
videos and rendered images — **even when the media is served from Blossom without a file extension**,
so that I can see and watch what the community is sharing without leaving the app.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given a note whose text contains a **video URL with a common extension** (`.mp4` / `.webm` /
  `.mov` / `.m4v`, optionally with a query string), then a **playable inline video** renders below the
  note text, and that URL is **removed from the displayed text**.
- [ ] Given a note whose only media is an **extension-less Blossom video** (the screenshot case,
  `blossom.primal.net/<hash>` recognizable as a video via the note's media metadata and/or a
  content-type check), then a **playable inline video** renders and the URL is **removed from the
  displayed text** — i.e. the real Blossom case embeds, it does not fall back to a text link.
- [ ] Given a note whose only media is an **extension-less Blossom photo**
  (`blossom.primal.net/<hash>` recognizable as an image via the note's media metadata and/or a
  content-type check), then it **renders inline using Story 3's image grid** (same side-by-side and
  "+N" overlay rules), and the URL is **removed from the displayed text** — i.e. extension-less
  Blossom photos embed too, rather than falling back to a shortened link.
- [ ] Given an embedded video, when the member **clicks the video player**, then the video
  **plays/pauses inline** (native controls) and the click **does not open Primal**. The video is
  **muted by default** and does **not** autoplay.
- [ ] Given an embedded video, when the member **clicks anywhere on the card outside the player**,
  then the note still **opens in Primal** (unchanged Story 1 behavior).
- [ ] Given a note that contains **both** image(s) and video — then both render (images per Story 3,
  video inline), and **neither** media URL remains in the displayed text.
- [ ] Given a note containing a **URL that is neither a renderable image nor a recognizable video**
  (any other link), then the displayed text shows a **shortened, display-only** form of that URL
  (unchanged Story 3 behavior).
- [ ] Given a candidate video URL that **cannot be played or confirmed** (load error, non-video
  content, or an unverifiable extension-less link), then the card **degrades gracefully** — no broken
  player box — falling back to a **shortened, display-only link** rather than a dead embed.
- [ ] Given content carrying a **non-http(s) or unsafe "video" URL** (e.g. `javascript:`, `data:`,
  markup like `<video onerror=…>`), then it is rendered as **inert** — **no player element is
  injected from it and no script runs** (http(s) only, mirroring Story 3's `safePicUrl` posture).
- [ ] Given a note with **no** video, then rendering is **unchanged** from Stories 3/4.

## Concepts touched
Concept Graph API was **not reachable** during planning (`http://localhost:8877`). This story is
**primarily client-side rendering** of note content and touches **no protocol concepts**. Note for
the Architect: recognizing the **extension-less Blossom** case may require information the server
already has (the feed fetch moved server-side in Story 5) — e.g. the note's media metadata tag or a
content-type probe — so part of this story **may** live in the existing `GET /api/feed` backend
rather than purely in `public/index.html`. The Architect decides where detection runs.

## Out of scope
- **Multiple inline players in one card.** v1 embeds **the first** recognized video; any additional
  videos degrade to shortened display-only links. A video gallery/carousel is deferred.
- **Fullscreen / lightbox** beyond the native video-control fullscreen button.
- **Audio-only**, GIF-as-video transcoding, HLS/streaming manifests, YouTube/Vimeo/other oEmbed
  providers, `nevent`/`note` quote expansion, and link previews.
- **Generating poster thumbnails** server-side — a poster frame, if any, comes from the browser/native
  element, not a generated image.
- Changing how **extension-based** images already render (Story 3 stays as-is). This story only
  **adds** the extension-less Blossom image path into Story 3's existing grid; it does not redesign
  the grid, its "+N" rule, or mention resolution (Story 4).

## Note for the Architect / Implementer — the two authoritative sources
Because an extension-less Blossom URL carries no type information, recognizing it as image vs. video
needs an **authoritative** signal. There are two, and they should be **considered in this order**:

1. **The note's own media metadata (preferred — no network cost).** Nostr notes commonly carry a
   **NIP-92 `imeta`** tag per attachment, declaring its MIME type (`m image/jpeg`, `m video/mp4`),
   and often a hash/dimensions. When present, the type is known with **zero network calls, no CORS,
   no latency** — match the `imeta` URL to the URL in the content and route to image vs. video.
2. **A content-type probe (fallback — has real costs).** A `HEAD` request's `Content-Type` header
   (`image/*` / `video/*`) resolves the type when `imeta` is absent. Costs to weigh: a network
   round-trip per unknown link, **browser CORS often blocks reading cross-origin headers** (a reason
   detection may belong in the Story-5 `GET /api/feed` backend rather than the browser), and it
   shouldn't be fired at arbitrary non-media links.

The **same resolution** serves both new criteria: resolve an extension-less Blossom URL to
`image` → Story 3 grid, `video` → the new inline player, anything else / unresolved → shortened
display-only link (the graceful-degradation criterion). The exact mechanism and ordering is the
Architect's to decide; this note records the options and their tradeoffs.

## Open questions
- **Extension-less detection mechanism** (Architect): which of the two sources above (or a
  combination, plus a possible known-host + hash-shape heuristic) recognizes Blossom media? Must
  satisfy both Blossom acceptance criteria and the "degrade gracefully when unconfirmable" criterion.
- **Where detection runs** (Architect): client-only vs. enriching each note in the existing
  `GET /api/feed` response with a resolved media list. (See "Concepts touched" and the CORS note.)
- **Reconciling player interactivity with card-opens-Primal** (Architect): the exact event-handling
  so the player's clicks/controls don't bubble to the card's open-in-Primal handler.

## Decided constraints (for the Architect)
- **Sanitize** media URLs to **http(s) only** (reuse the `safePicUrl` pattern); never inject from
  other schemes.
- Render the inline video **below** the note text (alongside Story 3's image grid); **strip** rendered
  media URLs from the displayed text.
- Extension-less Blossom **images** route into **Story 3's existing image grid** (reuse, don't fork);
  extension-less Blossom **videos** route into the new inline player. Resolution of which is which
  follows the "two authoritative sources" note above.
- **Muted by default, no autoplay**, native controls; **click-to-play inline**.
- Player clicks/controls **must not** trigger the card's open-in-Primal handler; clicks elsewhere on
  the card still open Primal.
- **At most one** inline player per card (v1); extra videos → shortened display-only links.
- **Graceful degradation**: any unplayable/unconfirmable candidate falls back to a shortened
  display-only link — never a broken player.
- Builds on Story 3's `parseNoteContent()` / `makeFeedNote()` in `public/index.html` (static, no
  build); may extend the Story 5 `GET /api/feed` backend if extension-less detection needs it.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
