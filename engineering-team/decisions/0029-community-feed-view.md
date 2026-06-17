# ADR 0029: Community feed view (Story 1)

**Status:** Accepted (content-relay decision amended 2026-06-17 — see Amendment below)
**Date:** 2026-06-12
**Story:** `engineering-team/stories/community-feed/1-feed-view.md`

## Amendment (2026-06-17) — add primal as a marginal augment

The "nos.lol only" content-relay decision below is **superseded**: the feed now queries
**`wss://nos.lol` (primary) + `wss://relay.primal.net` (augment)** in parallel and merges by
event id, with per-relay timeouts (nos.lol 12s, primal 10s) under `Promise.allSettled` so a
slow/failed primal degrades gracefully to nos.lol-only.

Rationale, backed by fresh probes (in `scripts/Relay Probe Scripts/`):
- **Coverage gain is marginal** — under the real bulk feed query, primal returned only ~2
  qualifying notes vs nos.lol's 100 (which is capped), adding ~1 net note. damus was also
  tested and added **0** (strict subset of nos.lol).
- **Performance is a non-issue** — primal under the real bulk query ran ~700ms (faster than
  nos.lol's ~1050ms), 0 timeouts over 3 trials; the old "flaky on bulk" reputation did not
  reproduce. It comfortably shares nos.lol's timeout budget.
- **The deciding reason is testability/write-resilience** — nos.lol runs a Web-of-Trust write
  filter that blocks some pubkeys (including the maintainer's own npub) from *publishing*
  there. Those authors' notes never reach nos.lol, so a nos.lol-only feed can't show them
  (or be tested against them). primal, an aggregating relay with no write gate, surfaces them.

This is an *augment*, not a *failover*: primal alone returns too little to serve as a real
fallback if nos.lol fails. Implementation: `FEED_RELAYS` array + parallel/dedup in `getFeed()`
(`public/index.html`); tests updated in `tests/community-feed.spec.js`.

The "Feed Source Relays" panel now shows a per-relay **status dot** — grey while checking, green
if the relay returned a proper EOSE on load, red on timeout/error. Backed by `queryRelayStatus()`
(resolves `{ events, ok }`); `queryRelay()` is now a thin wrapper over it. getFeed() returns
`relayStatus: [{ url, ok }]`, which `updateRelayDots()` paints. This makes the write-block
situation visible at a glance (if primal goes red, the augment isn't contributing).

## Context

Story 1 of the `community-feed` epic adds a gated **Feed** view: recent kind-1 notes authored by
verified LFO members carrying a Bitcoin/Nostr hashtag, newest-first, capped at 100, shown as
non-interactive cards that open the note in Primal. A header reads "X members contributing to the
discussion."

**Constraints (from the story + project rules):**

- **No build step.** The entire app is one static file, `public/index.html` (2327 lines), with
  inline JS and an ES-module import of `nostr-tools@2` from esm.sh. `server.js` is a bare static
  file server (deployed on Vercel per `vercel.json`). Per CLAUDE.md, no lint/build tooling is to
  be added.
- **Content relay: `wss://nos.lol` only** (decided; 45/48 member coverage — see ADR-less research
  in `scripts/` and memory `project-community-feed-relay`). **Amended 2026-06-17** — primal added
  as a marginal augment; see the Amendment at the top. Note this differs from the membership
  computation, which queries a separate relay set (originally 4 relays; trimmed to brainstorm +
  nos.lol by ADR 0032).
- **Hashtag-only detection.** Qualifying `t` tags (v1): `nostr`, `asknostr`, `grownostr`,
  `bitcoin`, `btc`, `lightning`, `sats`, `lfo`. A note qualifies if it carries **any** of these.
- **Reuse existing membership computation** unchanged: `getTagItems()` (index.html:1505-ish region)
  → `buildMemberSets()` → `verifiedMap`.
- **No new concepts.** This is a read-only consumer of kind-1 notes; the Concept Graph API was
  unreachable during design and is not needed — nothing here defines or mutates a concept, so
  **no firmware reinstall**.

**Existing infrastructure this builds on** (all in `public/index.html`):

- `queryRelay(relayUrl, filter, timeoutMs)` (1442) — single-relay raw-WebSocket query, returns
  an event array on EOSE/timeout. This is exactly the single-relay primitive the feed needs.
- `queryRelays(filter, timeoutMs)` (1464) — multi-relay + dedupe (used by `fetchMetadata`).
- `getTagItems()` / `buildMemberSets()` — produce `verifiedMap` (pubkey → tagger).
- `fetchMetadata(pubkeys)` (1708) — kind-0 metadata Map across relays, newest-wins.
- `makeMemberCard()` (1724) — the card-building pattern to mirror.
- `loadMembersPage()` (1816) — the lazy-loaded page pattern (`_membersLoaded` guard, loading →
  fetch → render → reveal).
- `showView(name)` (1401), nav `<li>` pattern (821-822), sign-out reset (2288-2311).
- Helpers: `hexToNpubShort` (1505), `getInitials` (1515), `escHtml` (1524), `safePicUrl` (1532),
  `window._nostrNpubEncode` (1314). **No** note/`nevent` encoder is exposed yet.

## Options considered

### Option A — Mirror the members-page pattern, client-side, single relay
Add a `page-feed` section, a `nav-feed-li`, a `showView('feed')` branch, and a `loadFeedPage()`
that reuses `queryRelay('wss://nos.lol', …)`, `buildMemberSets()`, and `fetchMetadata()`, plus a
`makeFeedNote()` card builder. All net-new code is additive and isolated.

- **Pros:** Consistent with every existing view; reuses the relay client, membership computation,
  metadata fetch, and display helpers; zero new dependencies; no server or build changes; honors
  JS-without-build. Cleanly leaves the working membership code untouched.
- **Cons:** Grows the single file further. Some structural duplication with `loadMembersPage`
  (loading/empty/render scaffolding), accepted as the house idiom.

### Option B — Generalize members + feed into a shared render component
Refactor `loadMembersPage`/`makeMemberCard` into a parameterized list/card component reused by both.

- **Pros:** DRY.
- **Cons:** Touches working, already-shipped membership code for no functional gain; higher
  regression risk; over-engineering for one new read-only view. Against the project's
  minimum-change ethos.

### Option C — Server-side feed endpoint
Add an endpoint in `server.js` that queries nos.lol server-side and serves JSON; client renders it.

- **Pros:** Could cache server-side; fewer client-side relay sockets.
- **Cons:** `server.js` is a trivial static server; this introduces a Node-side relay client,
  WebSocket deps, and serverless/runtime concerns on Vercel. Breaks the app-wide "browser queries
  relays directly" pattern. Caching/runtime is unjustified for a 100-note read-only v1.

## Decision

We chose **Option A** for v1 implementation, **with a backend-ready data boundary** (the
deliberate middle path between Option A and Option C). It matches the established architecture,
reuses the relay client, membership computation, metadata fetch, and display helpers, adds no
dependencies and no server or build changes, and keeps the working membership path untouched.
Curation (Story 2) slots into a single, clearly marked **select** seam without reshaping this design.

**Why not a backend now (Option C):** at v1 scale (≈48 members, 100 notes) a server-side aggregator
is more machinery than the job needs, and it would force two decisions that don't belong in a
feed-display story — LFO's deployment model (the static-on-Vercel app has no long-lived process;
CLAUDE.md flags LFO's deployment details as an open TODO) and endpoint gating (a `GET /api/feed`
would, by default, serve member content as public JSON). A backend *is* the right shape at the
"hundreds of posts by thousands of users" scale the product roadmap anticipates (relay filter-size
limits, pagination past the 500-cap, one-time shared curation, robustness to relay flakiness). To
keep that future cheap, **all feed-data logic in v1 lives behind a single `getFeed()` function whose
return shape is identical to the planned `GET /api/feed` JSON contract** (see *Planned evolution*).
Moving to the backend later replaces only `getFeed()`'s body; rendering, header, nav, and cards are
untouched. We validate the curation algorithm client-side first (fast iteration, no infra), then
port that exact logic into the backend when post/user volume justifies it.

**Open question resolved — hashtag case-sensitivity:** Nostr relay tag filters (`#t`) match
**exactly** (case-sensitive). Rather than lowercase-only, v1 **lists case variants explicitly**
where they matter (e.g. both `lfo` and `LFO`) and relies on the relay-side `#t` filter — no
client-side re-filtering. The Topics side panel surfaces this to users with a dulled
"(case sensitive)" label. Add further variants to `FEED_HASHTAGS` if a topic is being missed.

## Consequences

- **Enables:** a working, gated, read-only feed using only existing primitives; trivial to extend
  the hashtag list (one array) or, later, the relay set.
- **Constrains:** v1 fetches the newest 100 qualifying notes directly (`limit: 100`). Story 2's
  curation (representation floor + soft per-member cap + recency fill) needs a **larger candidate
  pool** to select from, so Story 2 will (a) widen the fetch (drop to the relay's natural cap,
  ~500) and (b) replace the trivial "newest 100" select step. To make that a one-spot change,
  `loadFeedPage()` is structured as **fetch → select → render**, with `select` isolated.
- **Debt/follow-ups:** structural duplication with `loadMembersPage` (accepted). The lowercase-only
  match is a known limitation. No relative-time formatter exists yet — added small and local.
- **Firmware reinstall required?** **No** (no concept definitions touched).

## Implementation notes

All changes are in `public/index.html`. Net-new, additive; no existing function is modified except
the four small wiring points (nav, `showView`, verified-reveal, sign-out reset).

1. **Module export — note encoder.** In the `nostr-tools` module script (near 1314), add:
   `window._nostrNoteEncode = (hex) => nip19.noteEncode(hex);` (for Primal `note1…` links).

2. **Config.** Near the `RELAYS` / config block (~1362), add:
   - `const FEED_RELAY = 'wss://nos.lol';`
   - `const FEED_HASHTAGS = ['nostr','asknostr','grownostr','bitcoin','btc','lightning','sats','lfo','LFO','lesfemmesorange'];`
   - `const FEED_LIMIT = 100;`
   - state flag `let _feedLoaded = false;` (alongside `_membersLoaded`).

3. **Nav.** After the Members `<li>` (822), add
   `<li id="nav-feed-li" style="display:none"><button class="nav-link-btn" id="nav-feed-btn" onclick="showView('feed')">Feed</button></li>`.

4. **`showView(name)` (1401).** Generalize to handle three views: toggle `.active` on
   `nav-feed-btn`; show/hide `page-feed`; on first selection of `'feed'`, guard with `_feedLoaded`
   and call `loadFeedPage()` (mirrors the `_membersLoaded` block at 1410-1413).

5. **Reveal / hide the Feed nav.** In `proceedWithPubkey` (verified branch, ~1890) reveal
   `nav-feed-li` alongside `nav-members-li`. In the sign-out reset (~2293) hide it again.

6. **`page-feed` section.** After `page-members` (closes ~1218+), add a `<div id="page-feed" class="page hidden">` containing:
   - a header element `#feed-header` (title "What LFO members are saying…" + member-count subtitle; copy updated by Story-1 amendment 2026-06-15),
   - a loading block `#feed-loading` (reuse `.spinner` markup from members-loading),
   - an empty-state block `#feed-empty` (hidden by default),
   - a notes container `#feed-notes`.

7. **`getFeed()`** (new — the **data-layer boundary**). Returns a Promise of the feed payload whose
   shape is **identical to the planned `GET /api/feed` response** (see *Planned evolution*):
   ```js
   { memberCount: <int>, notes: [ { id, pubkey, created_at, content,
       author: { displayName, npubShort, picture } }, ... ] }   // notes newest-first
   ```
   v1 body (all relay/curation logic lives here, and only here):
   - `const tagItems = await getTagItems();` → `const { verifiedMap } = buildMemberSets(tagItems);`
   - `const memberPubkeys = [...verifiedMap.keys()].filter(pk => pk !== SEED_PUBKEY);`
   - **fetch:** `const raw = await queryRelay(FEED_RELAY, { kinds:[1], authors: memberPubkeys, '#t': FEED_HASHTAGS, limit: FEED_LIMIT }, 12000);`
   - **select (Story-1 trivial; Story-2 seam):** `const selected = raw.slice().sort((a,b)=>b.created_at-a.created_at).slice(0, FEED_LIMIT);`
     — leave a `// STORY 2: curated selection (floor + per-member cap + recency) replaces this slice` comment.
   - `const authors = [...new Set(selected.map(e => e.pubkey))];`
   - `const metaMap = await fetchMetadata(authors);`
   - map each selected event into the contract shape, resolving `author.displayName =
     meta.display_name || meta.name || hexToNpubShort(pk)`, `author.npubShort = hexToNpubShort(pk)`,
     and `author.picture = safePicUrl(meta.picture)` (sanitized; `''` when none).
   - return `{ memberCount: authors.length, notes: <mapped, newest-first> }`.
   - **Migration note (in-code):** `// PLANNED: replace this body with `return (await fetch('/api/feed')).json()` — see ADR 0029`.

8. **`loadFeedPage()`** (new, model on `loadMembersPage` 1816) — the **render layer**, deliberately
   ignorant of where the data came from:
   - show loading; hide header/empty/notes.
   - `const feed = await getFeed();`
   - empty (`!feed.notes.length`) → show `#feed-empty`, hide loading, return.
   - clear `#feed-notes`; for each `feed.notes[i]` append `makeFeedNote(note)`.
   - header: `#feed-header` = title "What LFO members are saying…" + subtitle `${feed.memberCount} member(s) contributing across the latest ${FEED_LIMIT} posts`.
   - hide loading; show header + notes.

9. **`makeFeedNote(note)`** (new, model on `makeMemberCard` 1724). Takes a contract-shaped note
   (`{ id, pubkey, created_at, content, author:{displayName, npubShort, picture} }`) and builds a
   `.feed-note` card (a `<div>` with click affordance) showing:
   - display name: `note.author.displayName`; truncated npub: `note.author.npubShort`;
   - **avatar (top-right):** `.feed-note-avatar` with an initials fallback (`getInitials(displayName)`);
     if `note.author.picture` is set, inject an `<img>` the same safe way as `makeMemberCard`
     (1786-1794): `img.onerror = () => img.remove()` and hide the fallback on load — never a broken image.
   - post time: `formatTimeAgo(note.created_at)` with absolute `title`;
   - note text: `note.content` as **plain text**, shown **in full (no length limit / no truncation)**.
     Escaped via `escHtml`; whitespace preserved (`white-space: pre-wrap`). **No** media/embeds/
     mention resolution (out of scope).
   - a subtle hint/affordance, e.g. "Open in Primal ↗". All text via `escHtml`. **No**
     zap/like/repost/reply/message controls.
   - click handler: `window.open('https://primal.net/e/' + (window._nostrNoteEncode ? window._nostrNoteEncode(note.id) : note.id), '_blank', 'noopener')`.

10. **`formatTimeAgo(unixSeconds)`** (new small helper near display helpers ~1505): relative string
   (`"just now"`, `"5m"`, `"3h"`, `"2d"`, else a date), used for the card timestamp.

11. **Side panels (informational, read-only).** `#page-feed` is laid out as a two-column
    `.feed-layout`: the main column (`.feed-page`, header/loading/empty/notes) and an `<aside
    class="feed-aside">` holding two panels:
    - `#feed-relays-panel` — title **"Feed Source Relays"**, list `#feed-relays-list` populated from
      `[FEED_RELAY]` (display the host, e.g. `nos.lol`, stripped of `wss://` + `/relay`).
    - `#feed-hashtags-panel` — title "Topics" with a dulled `.feed-panel-note` "(case sensitive)"
      suffix; list `#feed-hashtags-list` populated from `FEED_HASHTAGS` (rendered as `#nostr`,
      `#bitcoin`, …, including case variants like `#lfo` and `#LFO`).
    A small `renderFeedPanels()` populates both from the JS constants; call it from `loadFeedPage()`
    (data-independent, idempotent). On narrow screens the aside stacks below the feed.

12. **CSS.** Add `.feed-note`, `.feed-note:hover`, `.feed-note-head`, `.feed-note-name`,
    `.feed-note-npub`, `.feed-note-time`, `.feed-note-excerpt`, `.feed-note-open`,
    `.feed-note-avatar` (+ fallback/img, mirroring `.member-avatar`), `#feed-header`, `#feed-empty`,
    and the layout/panels (`.feed-layout`, `.feed-aside`, `.feed-panel`, `.feed-panel-title`,
    `.feed-panel-list`) near the members-page styles (~561+), reusing existing color variables;
    `.feed-layout` collapses to a single column on narrow viewports.

## Planned evolution: `GET /api/feed` (backend) — *not built in this story*

Recorded so v1 is built compatibly; **no code for this ships in Story 1.** When post/user volume
warrants it (filter-size limits, pagination past the 500-cap, shared one-time curation, relay-flakiness
robustness), the data layer moves server-side **without touching the render layer**:

- **Shape contract.** `GET /api/feed` returns exactly the object `getFeed()` returns today:
  `{ memberCount, notes: [{ id, pubkey, created_at, content, author:{ displayName, npubShort, picture } }] }`.
- **Likely shape (Vercel-native, no always-on process):** a scheduled function (Vercel Cron) computes
  the member set, paginates relays past the cap, runs the Story-2 curation, and writes the payload to
  a store (Vercel KV/Blob); a stateless `GET /api/feed` serves it; the browser's `getFeed()` becomes
  `return (await fetch('/api/feed')).json()`. The client-side Story-2 curation is the reference
  implementation to port into the cron job.
- **Migration surface:** the body of `getFeed()` only. `loadFeedPage`, `makeFeedNote`, the header,
  nav, and CSS are unchanged because they consume the contract, not relays.

## Future considerations (deferred — flagged, not decided here)
- **LFO deployment model.** A backend feed requires resolving how/where LFO runs (CLAUDE.md marks
  LFO's deployment details — instance URL, containers, ports — as an open TODO). Out of scope for a
  feed-display story; must be settled before the backend is built.
- **Endpoint gating.** A `GET /api/feed` would, by default, serve member content as public JSON.
  Whether to access-control it (e.g., via the NIP-07 challenge-sign flow described in CLAUDE.md) is a
  decision to make when the endpoint is built. (Note: feed content is already public on Nostr relays,
  so this is a product/posture choice, not a secrecy requirement.)
- **Membership query may not need all 4 relays** *(future review — out of scope for this story)*.
  The membership computation (`getTagItems()`) still queries the full 4-relay set, but the LFO tag
  events (kind 9999/39999) appear to be complete on `tags.brainstorm.world` and `nos.lol` (per
  CLAUDE.md, both were complete/up-to-date as of 2026-06-01; damus/primal hold few or none). Trimming
  the membership relay set would cut sign-in/feed-load latency. **Measure coverage before trimming** —
  silently dropping a relay that holds a unique tagger could drop a member from the verified set. This
  touches existing membership code (not the feed) and should be its own story.

## Out of scope
- **Curated selection** (representation floor, soft per-member cap ~10, recency fill) — **Story 2**;
  plugs into the `select` seam in `getFeed()` (step 7).
- **The backend itself** (`/api/feed`, cron, KV) — designed above as *Planned evolution*, **not built** here.
- **Topic filter tabs** (Bitcoin vs Nostr) — v2.
- Rich note rendering (images, embeds, mention/nevent resolution), avatars in feed cards, pagination
  / "load more", manual refresh, and any caching beyond the once-per-session `_feedLoaded` guard.
- Multi-relay feed content (nos.lol only for v1).
