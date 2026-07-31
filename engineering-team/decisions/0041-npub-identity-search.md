# ADR 0041: Npub identity search — client-side decode, widened kind-0 lookup, vouch-core extraction

**Status:** Accepted (PO, 2026-07-30 — with flat-parallel/progressive-resolve and loading-state qualifications)
**Date:** 2026-07-30
**Story:** `engineering-team/stories/npub-search/1-identity-search-attest.md`

## Context

Story #1 adds a search bar above the verified-members grid (Members page, verified-members-only
by inheritance) that resolves an exact identity string — npub, 64-hex pubkey, or nprofile — to a
single candidate rendered like a member card, with a vouch action for non-verified candidates.

**Concept graph:** API at `localhost:8877` unreachable at design time (local stack down). No
concept definitions change in this story — the attestation published is the existing LFO tag
event (kind 39999, concept `39999:e83fff7a…:lfo`, `z` = `nostr-user-tag` parent, documented in
CLAUDE.md and live-proven by `applyLFOTag`). No firmware impact.

**Existing machinery this story leans on** (all in `public/index.html`):

- `nostr-tools` v2 via esm.sh with `window._nostrDecode` = `nip19.decode` (line ~1763-1770); the feed's `resolveMentions` already decodes npub/nprofile strings (line ~2085).
- `fetchMetadata(pubkeys)` (line ~2251): kind-0 fetch over `queryRelays()` → the membership pair `RELAYS = [tags.brainstorm.world/relay, nos.lol]`, with session caches `_metaCache` (profiles) and `_metaFetched` (negative cache — misses are never re-queried this session).
- `getMemberSets()` / `getTagItems()` (line ~1981-2000): cached web-of-trust closure → `verifiedMap` / `pendingMap`.
- `makeMemberCard(hex, metaMap, type, taggerHex, options)` (line ~2272): renders display name, NIP-05, avatar (safe-injected), bio, short npub + copy button, status badge, attested-by, and the Vouch button (pending grid).
- `applyLFOTag(targetHex, targetName, footerEl)` (line ~2136): the live-proven vouch write path — build kind-39999, sign via `LFOSigner`, publish to both relays, optimistic cache push + member-set rebuild — but its success/error UI is **hard-wired to pending-grid DOM** (`footerEl.closest('.member-card')`, pending→verified card surgery).
- Copy vocabulary: the 2026-07-30 sweep on main renamed user-facing "attest" → **"vouch"**; all new copy must use "vouch".

**Constraints:** JS-without-build (no lint/typecheck additions); client-side reads (the Members
page never goes through our server); read-only on the NIP-51 list; the panel must be reusable
for story #2's multi-candidate ranked results.

**The decision that matters:** a searched identity can be a complete outsider. Members' kind-0
profiles reliably live on the membership pair; an arbitrary npub's profile may not. Under the
story's O3 rule (no visible profile → view-only, no vouch), every coverage miss is a member who
*can't* vouch someone they meant to vouch — false negatives are the failure mode to spend
against.

## Options considered

### Option A — Reuse `fetchMetadata` as-is (membership relays only)
Sketch: search calls `fetchMetadata([hex])`; done.
Pros: zero new fetch machinery; shared cache. Cons: outsider coverage is whatever
tags.brainstorm + nos.lol happen to hold; `_metaFetched` negative cache makes a miss permanent
for the session (retry after the person fixes their profile requires a reload); nprofile relay
hints ignored. Poor fit for the story's core promise.

### Option B — Search-scoped flat parallel lookup with progressive resolve *(chosen)*
Sketch: a dedicated `fetchSearchProfile(hex, relayHints)` that (1) serves from `_metaCache` when
present; (2) otherwise queries **all search relays at once** — `RELAYS` (membership pair) +
`PROFILE_RELAYS` + sanitized nprofile hints, one single-author kind-0 filter per relay — and
**resolves on the first hit** (the panel renders immediately), quietly upgrading the card if a
strictly newer `created_at` arrives from a slower relay before the fan-out settles; (3) writes
hits back into `_metaCache` (misses are NOT negative-cached — a re-search re-queries).
`PROFILE_RELAYS = ['wss://purplepag.es', 'wss://relay.damus.io']` — purplepag.es is the
dedicated profile-aggregator relay; damus is the broad general relay already trusted as a feed
augment. Hints: `wss://` only, deduped, max 3. A two-stage variant (membership pair first, widen
on miss) was considered and rejected by the PO (2026-07-30): it makes the rare outsider case pay
two sequential timeout windows, and flat fan-out has no meaningful cost — 4-6 short-lived
sockets carrying one filter each is lighter than what the feed already does per load.
Pros: hit latency ≈ the fastest responding relay, regardless of which relay holds the profile;
one bounded timeout window worst-case for a true miss; honors nprofile hints; misses stay
retryable; the rest of the app inherits found profiles through the shared cache; no server
involvement. Cons: every novel search touches all ~4-6 relays (trivial per-query load; discloses
the looked-up pubkey to the profile relays — same class of disclosure as any relay query).

### Option C — Server-side lookup endpoint (`/api/profile?...`)
Sketch: an api function queries relays server-side like `/api/feed` does.
Pros: relay list evolvable without client changes. Cons: adds API surface and a serverless hop
for what is a light client read; breaks the Members page's all-client pattern; slower feedback
loop; nothing here needs CORS shelter or secrets. Overkill for one kind-0 filter.

## Decision

**Option B**, plus three seam decisions:

1. **Identity decode is pure client-side** (story's confirmed flow): trim/lowercase → 64-hex
   regex → else `npub1`/`nprofile1` prefix → `window._nostrDecode` (bech32 checksum validates;
   throw = invalid). nprofile relay hints are captured for the profile fetch. NIP-05
   (`name@domain`) input is **out of scope** (brainstorm supports it; our story doesn't — future).
2. **Candidate card = `makeMemberCard` extended, not a parallel builder.** Add a
   `type: 'candidate'` mode driven by `options` (`status: 'verified'|'pending'|'none'`,
   `hasProfile`, `canVouch`): same top/bio/npub-row markup (one source of truth for profile
   presentation), status badge per story (✓ Member / Pending / Not yet a member), view-only
   no-profile state with the O3 outreach copy, no attested-by lookup cost for candidates beyond
   what `verifiedMap` already carries. A `.candidate` CSS modifier adapts it to the horizontal
   panel.
3. **Vouch core extracted from grid UI.** Refactor `applyLFOTag` into
   `publishVouch(targetHex, targetName)` — build/sign/publish + optimistic
   `_tagItemsCache` push + `_memberSetsCache` invalidation, returning
   `{ ok: boolean, verified: boolean, reason?: 'declined'|'error' }` — with `applyLFOTag`
   keeping its exact pending-grid UI around it (zero behavior change for the grid). The panel
   calls `publishVouch` with its own button→spinner→result states, then updates the candidate
   badge in place and re-runs `loadMembersPage()` (cache-warm, so cheap) rather than duplicating
   the grid-surgery logic.

Panel mechanics (loading state is a PO requirement, 2026-07-30: any lag between search and
candidate rendering must show a loading/buffering indicator — the panel is never blank while
relays are in flight): input debounced ~400ms → local decode → valid: loading state, then
`getMemberSets()` lookup + `fetchSearchProfile`; invalid non-empty: inline "not a recognized
identity" hint (story #2 converts this to free-text fall-through). The panel is an
**absolutely-positioned dropdown overlay** anchored under the search bar (opening/closing never
reflows the grids — the story's page-integrity AC), dismissed by clearing the input, `Escape`,
or click-outside. Structured as a horizontal card row from day one so #2 can drop N ranked
cards into the same container.

## Consequences

- Arbitrary outsiders are findable and vouchable as long as *any* of ~4-6 relays (or their own
  nprofile hints) carries their profile; the residual miss case degrades exactly to the story's
  O3 view-only state, and is retryable without a reload. Hit latency tracks the fastest
  responding relay (progressive resolve); only a true miss waits out a full timeout window.
- `makeMemberCard` gains a third mode — slightly more branching in one function, in exchange for
  panel/grid visual parity being structural rather than copied.
- `publishVouch` becomes the single write path for membership attestations; any future vouch
  surface (story #2/#3 panels, profile pages) reuses it. The refactor touches live code — the
  pending-grid flow must be regression-covered in Test Design.
- New relay dependencies (purplepag.es, damus) are **search-path only** — membership truth and
  feed sourcing are untouched.
- Story #2 inherits: the panel container, the candidate card mode, `fetchSearchProfile`'s cache
  behavior, and the decode-else-freetext fork point.
- **Firmware reinstall required?** No (no concept definitions changed).

## Implementation notes

All in `public/index.html` unless noted.

- **Constants:** add `PROFILE_RELAYS = ['wss://purplepag.es', 'wss://relay.damus.io']` near `RELAYS` (~1832), commented as search-path-only.
- **`decodeIdentity(raw)`** (new, near `hexToNpubShort` ~2009): returns `{ hex, hints[] } | null`. Hex regex first; else prefix-gated `window._nostrDecode` in try/catch; nprofile → `{ pubkey, relays }`. Pure, no DOM.
- **`fetchSearchProfile(hex, hints, onProfile)`** (new, near `fetchMetadata` ~2245): `_metaCache` hit → call `onProfile(meta)` and return. Else fan out **in parallel** to `[...new Set([...RELAYS, ...PROFILE_RELAYS, ...sanitizedHints])]`, one `queryRelay(r, { kinds: [0], authors: [hex], limit: 4 }, 6000)` each. **Progressive resolve:** invoke `onProfile(meta)` on the FIRST relay hit (panel renders immediately) and invoke it again only if a strictly newer `created_at` arrives before all settle (card upgrades in place). On any hit, write the newest-so-far to `_metaCache` and add to `_metaFetched`; if all settle with no hit, signal the miss (O3 view-only state) **without** touching `_metaFetched`. Worst case for a miss = one timeout window; a hit renders at the speed of the fastest relay.
- **`publishVouch(targetHex, targetName)`** (refactor of `applyLFOTag` ~2136): move lines building `dTag`/`unsignedEvent`, the `LFOSigner.sign` try/catch, the parallel `publishEventToRelay` calls, and the optimistic `tagItems.push` + `_memberSetsCache = null` + `getMemberSets()` re-derive into it. Return `{ ok, verified: verifiedMap.has(targetHex), reason }`. `applyLFOTag` keeps signature and all DOM behavior, delegating to it — pending-grid behavior byte-identical from the user's perspective.
- **`makeMemberCard`** (~2272): accept `type === 'candidate'` with `options = { status, canVouch, hasProfile }`. Badge: `status==='verified'` → `✓ Member`; `'pending'` → `Pending`; `'none'` → new `Not yet a member` badge class. Vouch button rendered when `canVouch && hasProfile && status !== 'verified'`; its click handler calls the panel flow (below), not `applyLFOTag`. No-profile candidates render npub row + fallback avatar + the O3 copy block (see Copy).
- **Members page markup** (~1545, between `.telegram-row` and `#verified-members-section`): a `.member-search` block — label/hint, `<input id="member-search-input" …>` with placeholder naming all three accepted forms, and `<div id="member-search-panel" class="member-search-panel" hidden>` as the anchored overlay (`position:absolute` within a `position:relative` wrapper).
- **Search controller** (new script section near `loadMembersPage`): debounce 400ms; empty → hide panel; `decodeIdentity` null → inline invalid hint; valid → **panel opens immediately in a loading state** (spinner reusing `.syncing-mini-spinner` + a short "Searching…" message — PO requirement: no blank/frozen panel at any point between search and render), then `await getMemberSets()` for status, `fetchSearchProfile(hex, hints, onProfile)` with the loading state replaced by the candidate card on first profile hit (or by the O3 view-only card on miss). Vouch click → button→spinner, `publishVouch(...)`; on `ok && verified` → badge flips to `✓ Member`, toast-equivalent inline confirmation, `loadMembersPage()` refresh; `reason==='declined'` → restore button silently; error → inline error + retry button (matching grid patterns). `Escape`/click-outside/clear → hide panel, page untouched.
- **CSS** (with the members styles ~583-1000): `.member-search`, `.member-search-panel` (overlay, horizontal flex row, `overflow-x:auto` for #2), `.member-card.candidate` (fixed card width ~320px, no grid margins), `.member-badge.none-badge`. LFO palette vars throughout.
- **Copy (PO-fixed, vouch vocabulary):** no-profile state must say vouching requires visible profile metadata so the member can confirm they've found the right person, and encourage reaching out so the person completes their profile (mirror the existing "Make your profile recognizable" guidance, ~1418).
- **Tests:** `tests/npub-search.spec.js` (Playwright, PORT-aware config as-is). Note for Test Design: candidate/status flows need the page reachable — the suite's existing pattern of driving `showView`/stubbing state applies; regression on the pending-grid vouch path is mandatory (the `publishVouch` extraction touches it).

## Amendments

- **2026-07-31 — O3 REVERSED by the PO.** Every reference to the "O3 view-only state" in this
  ADR is historical: profile-less candidates are now **vouchable like any other valid npub**,
  with no "no profile found" copy. A full profile miss renders an npub-only candidate row
  (short npub in the name slot) with the normal status badge and Vouch action. The
  no-negative-cache rule and everything else in Option B stand unchanged.
- **2026-07-31 — Panel geometry.** Candidates render as full-width **rows** in a vertical
  dropdown list (brainstorm.world reference, reduced detail: photo, name, verification
  address, right-justified badge) rather than the horizontal card tiles originally sketched.
- **2026-07-31 — NIP-05 ✓ earned.** The verification-address checkmark renders only after a
  client-side `/.well-known/nostr.json` check confirms the domain maps the name to this
  pubkey ("✓ when provable"); session-cached per (address, pubkey).

## Out of scope

- Free-text search, ranking, Open Ranking vs NIP-50, and any server search proxy — story #2's ADR.
- Personalized-POV ordering (story #3).
- NIP-05 identifier input (`name@domain`) — natural follow-up once #2's fall-through exists.
- Profile-relay list evolution (e.g. swapping purplepag.es) — revisit only if coverage misses show up in practice.
