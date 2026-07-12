# Epic: note-tagging

**Status:** Active
**Created:** 2026-06-25
**Book:** `engineering-team/audits/note-tagging/book.md`

## Goal
Let verified members apply **event-tags** to community notes (kind-1) from within the LFO feed —
classifying and curating content the way the existing npub-tagging on `tags.brainstorm.world` classifies
people. Tagging a note records a member's judgment that the note belongs to some concept (e.g. a topic),
which the feed can later read as a curation/channel signal.

## Why
LFO already runs a peer web-of-trust over *people* (the LFO npub tag). Notes have no equivalent: the feed
can only guess topical relevance from hashtags (author-chosen) and an AI content read (story #5). Letting
members **tag the notes themselves** adds a human, trust-weighted signal over *content* — the same
mechanism, applied to events instead of pubkeys. This is the write/interaction counterpart to the
read-only `community-feed` epic, and the eventual source of Provider-2 channel membership (see
`community-feed` epic → "Forward-looking design notes").

## Dependency
> **STALE — resolved (sync note at merge, 2026-07-12).** The paragraph below was true when this epic
> opened (2026-06-25). Since then the protocol **shipped and is live**: event-tagging runs on
> `tags.brainstorm.world` with four LFO tags carrying real data, and the mainline app already
> implements the full **read** path (community-feed stories #8/#9/#10, ADRs 0036–0038: vendored SDK
> read side, four-tag provider, pills, channels, tagger counts). This epic's remaining dependency is
> only the **write** wiring: signer + publish of tagging assertions (the SDK's `builders.js` /
> `apply.js` are deliberately not yet vendored — ADR 0036 excluded the write path). The demo below
> (#1, ADR 0039 — renumbered from 0035 at merge) predates all of it.

The real capability depends on **Tapestry/nostr `nostr-event-tag` support (tags applied to notes)** that a
teammate has **not yet implemented**. This epic therefore starts with a non-functional demo UI and grows
as the protocol lands — signing, publishing, and querying event-tags are deferred until then.

## Stories
- #1 — `1-note-tag-demo` — Primitive, non-functional demo: a plus button on each feed note opens an "Add a tag" popup with two toggle views ("Search existing" / "Apply new"), both showing "No support for event tags yet. Check back later." No event-tag creation/signing/publishing. *(Draft — 2026-06-25)*

## Relationship to community-feed
- `community-feed` = **read/display** notes (and *consume* event-tags later as a feed/channel signal).
- `note-tagging` = **create/apply** event-tags on notes.
- They meet at two documented seams: the `channels` array (ADR 0034) and `community-feed` story #2's
  event-tag sourcing. Channel membership for event-tagged notes will come from an **event-tag↔channel map
  (1:1 or 1:many)**, not from AI content scores (see `community-feed` epic → Forward-looking design notes).

## Open questions (epic-level)
- The exact **event-tag event format** (kind, tags, parent concept) for tagging a *note* — analogous to the
  npub `nostr-user-tag` format but targeting an event id rather than a pubkey. Resolved by the teammate's
  protocol work; the Architect should consult the Concept Graph / Tapestry reference once available.
- Which **concepts/tags** members may apply, and how they map to feed channels.
