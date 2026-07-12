# ADR 0038: "Active content taggers" — per-note applier pubkeys through the provider seam

**Status:** Accepted
**Date:** 2026-07-12
**Story:** `engineering-team/stories/community-feed/10-feed-header-semantics.md`

## Context

Story 10 adds a second header subtitle line — "Z active content taggers" — where Z is the count of
distinct member *applier* pubkeys over the **visible** note pool, recomputed live on channel
toggles, always rendered (zero included). The client therefore needs per-note applier identities;
today only application *counts* exist (server-internal `vias`), never identities. The members/posts
line is ratified unchanged.

Codebase facts: the vendored resolver's targets already carry
`applications: [{ authorPubkey, … }]` (`api/_lib/event-tagging/classify.js:208`) — identities are
computed and then discarded at wrap time (`api/_lib/tagged.js`, step 5). `renderFeedNotes()`
(`public/index.html`) rebuilds the header on every pill toggle from the fetched pool — the live
recompute point already exists. `mergeCandidatePools` (`api/_lib/merge.js`) is the union seam.

## Options considered

**Option A — a per-note `taggers` array through candidate → merge → note (chosen).**
Candidates gain `taggers` (distinct applier pubkeys for that tag's applications); the merge unions
them by pubkey exactly as `channels` union; note shaping emits the field only when non-empty (the
`taggedWith` additive pattern). Client: `Z = new Set(visible.flatMap(n => n.taggers || [])).size`.
*Pros:* one shape for what the feature needs (per-note, cross-tag deduped identity); counting is a
flat union; zero server-side counting logic to keep in sync with the client's channel filter.
*Cons:* pubkeys repeat across notes (bytes; trivial at 100 notes).

**Option B — applier pubkeys inside `taggedWith` entries.** Rejected: `taggedWith` is per-*tag
display* metadata shared across notes of the same tag; counting needs per-*note* identity, and
nesting forces the client to double-flatten and couples the pill contract to a counting concern.

**Option C — server-computed count.** Rejected outright: Z depends on the client's live channel
selection; a server number cannot follow pill toggles without re-fetch, violating the story.

## Decision

Option A. Appliers only, by construction — the resolver segregates disputes into a bucket the
candidate wrap never reads.

## Consequences

- Payload: notes gain optional `taggers: [hex…]` — additive; absent on untagged notes; top-level
  contract unchanged. Tagger pubkeys are already-public relay data.
- Story `curation-policy/#1` (endorsement ranking) gets per-note tagger identity for free if it
  wants client-side signals; `vias` stays the server-side ranking input.
- **Firmware reinstall required?** No.

## Implementation notes

- `api/_lib/tagged.js` step-5 wrap: `taggers: [...new Set(t.applications.map(a => a.authorPubkey))]`.
- `api/_lib/merge.js`: union `taggers` by value on dedupe (init `[...new Set(c.taggers || [])]`,
  push-if-absent on merge) — mirror of `channels`.
- `api/feed.js` note shaping: `...(c.taggers && c.taggers.length ? { taggers: c.taggers } : {})`.
- `public/index.html` `renderFeedNotes()`: compute Z over `visible`, append
  `<div>…Z active content tagger(s)…</div>` as a second `feed-header-sub` line in BOTH header
  branches (unfiltered and filtered) — same element rebuild, so pill toggles update it for free.
  Singular at Z === 1; renders "0 active content taggers" whenever the header renders with no
  tagged notes visible.

## Out of scope

Rendering tagger names/avatars; any ranking use; members/posts line changes.
