# ADR 0034: Topic channels — client-side topic filter over server-tagged notes

**Status:** Accepted
**Date:** 2026-06-24
**Story:** `engineering-team/stories/community-feed/6-topic-channels.md`

## Context

Story 6 adds a **topic channels** filter banner to the Feed: three toggleable pills — **Bitcoin**,
**NOSTR**, **LFO Community** — that narrow the feed to the selected topic(s). The categorization signal
already exists: ADR 0033 / Story 5 persists three per-topic relevance scores `{ bitcoin, nostr, lfo } ∈
[0,1]` per note (`api/_lib/classify.js`), and `api/_lib/select.js` already uses them to keep notes whose
`max(scores) ≥ THRESHOLD`.

Relevant facts from the current code:

- **The feed is fetched once.** `getFeed()` (`public/index.html:2058`) does a single `GET /api/feed`;
  `loadFeedPage()` (`:2091`) renders all `feed.notes` and a header built from `feed.memberCount` and the
  constant `FEED_LIMIT = 100` (`:1515`, `:2125`).
- **The payload contract** (ADR 0029 + 0033) is `{ memberCount, notes, memberNames, relayStatus }`. Each
  note is `{ id, pubkey, created_at, content, author }` (`api/feed.js:55–68`). **The per-topic scores are
  computed server-side and dropped** — they are not in the payload today.
- **The threshold lives server-side**: `THRESHOLD = 0.3` in `api/feed.js:33`, applied in `select.js:19`.
- **Fallback sentinel**: when the classifier is unavailable, `classify.js` returns
  `PASS_THROUGH = { bitcoin: 1, nostr: 1, lfo: 1 }` per note (`:13`), *not persisted*, so nothing is
  dropped for being unjudged.
- **Panels**: `renderFeedPanels()` (`:2067`) paints the relay panel and the hashtag panel. The hashtag
  panel's title **"Topics"** is static markup at `public/index.html:1393`.

Constraints from the story (Decided constraints):

- Channels map 1:1 to score buckets: Bitcoin→`bitcoin`, NOSTR→`nostr`, LFO Community→`lfo`.
- **Single shared threshold** `T` (reuse Story 5's `THRESHOLD`); a note is in channel X iff `score_X ≥ T`.
  Multi-label allowed.
- Default + deselect-all = **show everything** (zero selected = no filter).
- Multi-select = **union (OR)**, de-duplicated.
- Source unchanged (Provider 1 hashtag pool); **no** new sourcing or re-classification.
- If scores are **unavailable**, show all notes and **disable** the pills.
- Rename the hashtag panel **"Topics" → "Source Hashtags"**.

Project rules: JS-without-build, no new lint/typecheck infra (CLAUDE.md). The frontend is a single
`public/index.html`; the backend is the `api/feed.js` Vercel function.

## Options considered

### Option A — Server-side per-toggle filtering
Send the selected channels to `/api/feed` (e.g. `?channels=bitcoin,nostr`); the server filters and
returns only matching notes.
- **Pros:** filtering logic stays entirely server-side next to the scores.
- **Cons:** a network round-trip on *every* pill toggle; re-runs the whole pipeline (members → fetch →
  classify → select) per request; the "newest 100" pool would differ per selection, so toggling could
  surface/hide notes unpredictably rather than acting as a stable lens. Contradicts the story's "lens over
  the existing pool" intent and the "~100 cap holds over whatever subset is displayed" criterion.

### Option B — Server tags each note with its channels; client filters the already-fetched set
Extend the payload so each note carries a `channels: string[]` array (computed server-side from the
existing scores and `THRESHOLD`). The browser holds the fetched `feed` and re-renders the visible subset
on toggle, with **no** new request. Empty selection → show all.
- **Pros:** channels are a true client-side **lens** over the same stable ~100-note pool; toggling is
  instant (no network); the threshold stays **single-sourced on the server** (the client never sees `T`);
  additive, backward-compatible payload change; the fallback `PASS_THROUGH` sentinel *automatically*
  yields `channels = [bitcoin, nostr, lfo]`, so degraded notes are never hidden by a filter — no special
  casing.
- **Cons:** adds one field to the payload and a small client re-render path; the header count must be
  recomputed client-side over the displayed subset (server's `memberCount` is whole-pool).

### Option C — Ship raw scores to the client, filter there
Include `{ bitcoin, nostr, lfo }` per note; the client applies `≥ T` itself.
- **Pros:** maximal client flexibility (future per-channel tuning, debugging).
- **Cons:** **duplicates the threshold** `T` into client code — two sources of truth for the same cutoff,
  exactly the drift the story warns against. No benefit over B for this story's needs.

## Decision

We chose **Option B**. Channel membership is computed once on the server from the scores that already
exist, attached to each note as a `channels` array, and the browser filters the already-fetched feed in
memory. This honors the story's "lens over a stable pool" intent, keeps the single shared threshold in one
place (`api/feed.js`), makes toggling instant, and gets correct fallback behavior for free from the
existing `PASS_THROUGH` sentinel.

For the **scores-unavailable** case: the payload gains a top-level boolean `channelsAvailable`. The server
sets it `false` when classification could not produce real scores (classifier/score store unreadable — the
same condition that triggers the `PASS_THROUGH` fallback). When `false`, the client shows all notes and
renders the pills **disabled**; when `true`, pills are interactive.

## Consequences

- **Enables:** instant, no-network topic filtering; a clean reusable `channels`/`channelsAvailable`
  contract the future v2 work (and any per-channel UI) can read; exact equivalence to today's feed when no
  channel is selected.
- **Constrains / makes harder:** the header's member/post counts can no longer be taken verbatim from the
  server payload — they must be recomputed over the displayed subset. The render path in `loadFeedPage()`
  must be refactored so notes+header+empty-state can be re-painted on toggle without re-fetching.
- **New debt / follow-ups:** `channelsAvailable` detection is a coarse global signal (degraded vs not),
  not per-note provenance; sufficient for this story. Persisting the user's channel selection across
  reloads is explicitly deferred (story Out of scope).
- **Firmware reinstall required?** No — no concept definitions change. `channels` is a payload field, not a
  Nostr/concept-graph concept.

## Implementation notes

**Backend — `api/feed.js` (`buildFeedPayload`):**
- The scores map is already in scope (`const scores = await classify(candidates)`, `:49`). In the
  `selected.map(...)` that builds each note object (`:55–68`), attach:
  ```js
  const CHANNELS = ['bitcoin', 'nostr', 'lfo'];
  const s = scoreFor(ev.id);                 // same lookup select.js uses (Map.get or obj[id])
  channels: CHANNELS.filter((c) => (s?.[c] || 0) >= threshold),
  ```
  Use the **same `threshold`** already passed into `buildFeedPayload` — do not introduce a second constant.
- Add `channelsAvailable` to the returned payload. Derive it from whether classification degraded to
  fallback: have the injected `classifyNotes` dep report degradation (e.g. anthropic client absent, or all
  results were `PASS_THROUGH` / KV unreadable) and thread a boolean up; default `true`. Keep the existing
  `{ memberCount, notes, memberNames }` fields unchanged (purely additive).
- `select.js` is unchanged — selection still keys off `max(scores) ≥ threshold`; channel tagging is a
  presentation concern layered on the **already-selected** notes.

**Frontend — `public/index.html`:**
- **Markup:** add a `#feed-channels` filter banner above `#feed-notes`, containing three pill buttons
  (`data-channel="bitcoin|nostr|lfo"`, labels "Bitcoin" / "NOSTR" / "LFO Community"). Add CSS for
  pill, selected, and disabled states (match existing `feed-panel` styling vocabulary).
- **State:** a module-scoped `selectedChannels` (a `Set`) and a cached `feed` from the last fetch.
- **Refactor `loadFeedPage()` (`:2091`)**: keep the fetch + loading/error handling; extract the
  notes+header+empty-state painting into a `renderFeedNotes()` that reads `feed` + `selectedChannels`:
  - Visible set: `selectedChannels.size === 0 ? feed.notes : feed.notes.filter(n => n.channels?.some(c => selectedChannels.has(c)))`.
  - Empty visible set → show `#feed-empty` (reuse existing element/string).
  - Header: recompute `distinctAuthors` and `postCount` over the **visible** notes (not `feed.memberCount`
    / not the constant `FEED_LIMIT`); keep the "What LFO members are saying…" title and the
    "N member(s) contributing across … posts" shape, with numbers reflecting what's shown.
- **Pill toggle handler:** flip membership in `selectedChannels`, toggle the pill's selected class, call
  `renderFeedNotes()`. No re-fetch.
- **Degraded mode:** after fetch, if `feed.channelsAvailable === false`, add a `disabled` class +
  `aria-disabled` to the pills and skip wiring their click handlers; `selectedChannels` stays empty so all
  notes render.
- **Panel rename:** change the static title at `public/index.html:1393` from `Topics` to `Source Hashtags`
  (keep the `(case sensitive)` note).

**Tests (for the Tester):** `buildFeedPayload` is the pure, dependency-injected seam (already unit-tested
in `test/` with fakes) — add cases asserting `channels` tagging (single-, multi-, and pass-through/all-
three) and `channelsAvailable`. Client filtering/disabled-state/header-recompute are Playwright e2e
(`tests/`), consistent with how Stories 1/3/4 are tested.

## Out of scope

- The classifier, prompt, scores, and `THRESHOLD` value — owned by ADR 0033; this ADR only **reads** them.
- Ranking/curation (Story 2), Provider 2 sourcing, per-channel relays/caps.
- Persisting the user's channel selection across reloads/sessions.
- Any change to the channel set beyond the three named channels.
