# Story 3: Rich note rendering — inline images

**Status:** Approved
**Created:** 2026-06-15
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
Story 1 (Done) renders note text as plain text, so image URLs appear as raw links — poor for a feed
meant to give newcomers a feel for the community. This story renders images inline. It was explicitly
deferred from Story 1 ("rich note rendering — out of scope"). Mention resolution is the sibling
**Story 4**; this story is images only.

## User-facing description
As a **member browsing the feed**, I want **images in notes shown inline** (not as raw links), so that
the feed reads like a real social feed.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given a note whose text contains an **image URL** (common extension: jpg / jpeg / png / gif / webp / avif), then the image renders **as an image**, and that URL is **removed from the displayed text**.
- [ ] Given a note with **two or more** image URLs, then the **first two** images render **side-by-side** (a 2-column grid) below the note text.
- [ ] Given a note with **more than two** image URLs, then the **second image tile shows a dimmed "+N" overlay**, where N = number of images beyond the two shown.
- [ ] Given a note with **exactly one** image URL, then a single image renders with **no overlay**.
- [ ] Given a note with **no** image URLs, then rendering is unchanged from Story 1 (full plain text), and clicking the card still **opens the note in Primal**.
- [ ] Given content that **looks like HTML or carries a non-http(s) "image" URL** (e.g. `javascript:`, `data:`, `<img onerror=…>`), then it is rendered as **inert text** — no element is injected from it and **no script runs**.

## Concepts touched
Concept Graph API was **not reachable** during planning. This story touches **no concepts** — it is
purely client-side rendering of note content.

## Out of scope
- **Mention resolution** ("@") — **Story 4**.
- Clickable rendering of **non-image links** (regular URLs stay plain text).
- **Video / other embeds**, `nevent`/`note` quote expansion, link previews.
- **Per-image lightbox / gallery** — clicking the card opens the note in Primal (existing behavior); there is no in-app full-size image viewer.

## Open questions
- Whether to detect images **only by file extension** (v1 default) or also by known image hosts without an extension — Architect to confirm against real note content.
- Trailing-punctuation trimming on URLs (e.g. a URL followed by `.` or `)`) — Architect.

## Decided constraints (for the Architect)
- Detect image URLs by **common extension** (jpg/jpeg/png/gif/webp/avif), optionally with a query string.
- **Sanitize** image URLs to **http(s) only** (reuse the `safePicUrl` pattern); never inject from other schemes.
- Render the image grid **below** the note text; **strip** rendered media URLs from the displayed text.
- Show **at most two** images; **>2 → dimmed "+N" overlay on the second tile**.
- Card click still opens the note in **Primal** (unchanged); no per-image interaction.
- Builds on Story 1's `makeFeedNote()` in `public/index.html` (static, no build).

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
