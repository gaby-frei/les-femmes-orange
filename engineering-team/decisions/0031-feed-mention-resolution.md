# ADR 0031: Feed @ mention resolution + shared member-metadata cache (Story #4)

**Status:** Accepted
**Date:** 2026-06-15
**Story:** `engineering-team/stories/community-feed/4-mention-resolution.md`

## Context

Story #4 resolves Nostr mentions in feed note text: **members → `@DisplayName`**, everyone else →
a **shortened `@npub1abc…wxyz`** handle. The enabling decision (from planning) is a **shared
member-metadata cache** so member names are available on a cold feed load and we stop double-fetching.

**Current code (`public/index.html`):**
- `fetchMetadata(pubkeys)` (`:1859`) — queries relays for kind-0; **no cache**, fresh hit every call.
- `getFeed()` (`:2021`) — fetches metadata for **note authors only** (`:2034`) and returns
  `{ memberCount, notes:[{…, content (raw), author}] }`. Content is returned **raw**; image/link
  parsing happens at render.
- `loadMembersPage()` (`:1987`) — separately fetches metadata for **all** members+pending+taggers,
  only when the user visits Members (lazy `_membersLoaded`). Its map is local and discarded.
- `parseNoteContent(content)` (`:1664`, Story 3) — pure render-seam returning `{ text, images }`.
  `makeFeedNote(note)` (`:2104`) calls it, then escapes `text` into `.feed-note-excerpt`.
- `window._nostrDecode = nip19.decode` (`:1425`) decodes `npub`/`nprofile` → pubkey;
  `hexToNpubShort(hex)` (`:1513`) is the short-handle idiom.

**Constraints:** render-layer + a small data-layer cache; **no new deps**; keep Story 1/3 behavior and
the 26 feed + 13 local-signer tests green; **no concept/firmware changes**; members-only (no
non-member relay fetch).

The two consequences: today member metadata isn't reliably present at feed-render time (only authors),
and the members page + feed redundantly fetch overlapping pubkeys.

## Options considered

### Option A — Shared metadata cache + `memberNames` in the feed payload + resolve at render
(1) Make `fetchMetadata` **cache-aware** via a module-level `_metaCache` (fetch only missing pubkeys,
merge in, return the requested subset) — de-dupes *all* metadata fetching automatically. (2) `getFeed`
fetches metadata for the **full member set** (members ⊇ authors) and returns a derived
**`memberNames`** map (members that have a name) as a new payload field. (3) A pure `resolveMentions(text, names)`
runs at render inside `makeFeedNote`, replacing mention tokens with `@name`/`@shortNpub`; the result is
escaped as today.

- **Pros:** members-only gating is encoded by `memberNames` (only members-with-names are in it);
  works on a **cold feed load** (getFeed always fetches member metadata); the cache de-dupes the
  members-page/feed redundancy for free; resolution data flows through the **contract**
  (`memberNames`) → testable by stubbing `getFeed`, and the planned `GET /api/feed` backend returns it
  naturally; raw `content` is preserved (mentions resolved at render, like images). Render stays the
  single place that turns content into DOM.
- **Cons:** the getFeed contract grows one field; `makeFeedNote` gains a `memberNames` argument.

### Option B — Resolve mentions inside `getFeed` (pre-substitute the note content)
`getFeed` rewrites each note's `content`, replacing mention tokens before returning.

- **Pros:** render code untouched.
- **Cons:** getFeed does presentation string-rewriting (mixes data/presentation); **image** parsing
  still happens at render, so content-parsing is split across two layers; the raw content is lost; and
  it's harder to unit-test rendering in isolation. Rejected.

### Option C — Module-global member-name cache read directly by `resolveMentions` (no payload field)
`resolveMentions` reads hidden globals instead of receiving `names`.

- **Pros:** no contract change, no new `makeFeedNote` arg.
- **Cons:** render reads hidden global state (impure; tests must poke globals rather than stub the
  payload); the future `/api/feed` backend would still need to carry names some other way. Less clean
  for testing and for the backend evolution. Rejected.

## Decision

We chose **Option A**. It satisfies all ACs (incl. cold-load resolution and members-only gating),
introduces the shared cache the story called for (de-duping the members-page/feed fetches), keeps
**raw content** with all content→DOM work at render, and keeps resolution **data on the contract** so
it's stubbable in tests and forward-compatible with the planned backend. The shared cache is the
fetch-layer mechanism; `memberNames` is the resolution view derived from it.

**Where resolution executes:** at **render** (`makeFeedNote` → `resolveMentions`), after
`parseNoteContent` (mentions aren't URLs, so they pass through image/link handling untouched).

## Consequences

- **Enables:** readable member mentions regardless of navigation order; one shared metadata cache
  reused by the members page, feed cards, and mention names; a clean `resolveMentions` seam.
- **Contract change (additive):** `getFeed()` returns `{ memberCount, notes, memberNames }`.
  `memberNames` is `{ <pubkeyHex>: <displayName> }` for members that have a name. Consumers must treat
  it as optional (default `{}`) so Story 1/3 tests (which stub `getFeed` without it) keep passing.
- **Members-only by construction:** only member pubkeys with a name appear in `memberNames`; any other
  mentioned pubkey (non-member, or member without a kind-0 name) → shortened handle. No non-member fetch.
- **Cache lifetime:** session (module-level Map). Acceptable — profiles change rarely and the feed
  loads once per session. Cache records fetched pubkeys (incl. misses) to avoid refetch loops.
- **Tests that stub `window.fetchMetadata`** bypass the cache entirely (they replace the function) — so
  the cache is invisible to them; production-only behavior.
- **Firmware reinstall required?** **No** (no concept definitions touched).

## Implementation notes

All in `public/index.html`; additive; Story 1/3 behavior preserved.

1. **Shared cache — make `fetchMetadata` cache-aware** (`:1859`). Add module-level
   `const _metaCache = new Map();` and `const _metaFetched = new Set();`. In `fetchMetadata(pubkeys)`:
   compute `missing = pubkeys.filter(pk => !_metaFetched.has(pk))`; if `missing.length`, run the
   existing relay query for `missing`, write each found profile into `_metaCache`, and add **all**
   `missing` to `_metaFetched` (so misses aren't re-queried). Return a `Map` of the requested `pubkeys`
   that have a `_metaCache` entry. Same signature/return shape → `loadMembersPage` (`:1987`) and
   `getFeed` both benefit with no change at the call site.

2. **`getFeed` — widen to the member set + emit `memberNames`** (`:2034`+). Replace
   `const metaMap = await fetchMetadata(authors)` with `const metaMap = await fetchMetadata(memberPubkeys)`
   (members ⊇ authors, so author display still resolves; `memberCount` stays the distinct-**author**
   count — unchanged). Build
   `const memberNames = {}; for (const pk of memberPubkeys) { const n = metaMap.get(pk); const nm = n && (n.display_name || n.name); if (nm) memberNames[pk] = nm; }`
   and return `{ memberCount: authors.length, notes, memberNames }`.

3. **`resolveMentions(text, names)`** — new **global, pure** helper near `parseNoteContent` (`:1664`).
   `names` is `{ pubkeyHex: displayName }` (default `{}`). Scan for mention tokens with a bech32 regex,
   e.g. `/(?:nostr:)?(n(?:pub|profile)1[02-9ac-hj-np-z]+)/gi`. For each, `try` `window._nostrDecode`:
   `npub` → `data` (hex); `nprofile` → `data.pubkey`. On success replace the token with
   `'@' + (names[pk] || hexToNpubShort(pk))`. On decode failure (malformed) `catch` and **leave the
   token unchanged**. Returns the rewritten string (still plain text — escaped later). Never throws.

4. **`makeFeedNote(note, memberNames = {})`** (`:2104`) — after
   `const { text, images } = parseNoteContent(note.content || '')`, compute
   `const displayText = resolveMentions(text, memberNames)` and render `escHtml(displayText)` into
   `.feed-note-excerpt` (same conditional-empty rule). Image/link handling unchanged.

5. **`loadFeedPage`** — pass the names through:
   `for (const note of feed.notes) notesEl.appendChild(makeFeedNote(note, feed.memberNames || {}));`.

6. **No CSS** (mentions are plain text). No change to `loadMembersPage` logic — it transparently gains
   the cache via `fetchMetadata`.

## Out of scope
- The deprecated `#[index]` tag-reference mention form; `nevent`/`note` quote expansion.
- Resolving **non-member** names (would need their relays / the outbox model) — non-members shorten.
- Avatars/rich profile in mentions; clickable mentions.
