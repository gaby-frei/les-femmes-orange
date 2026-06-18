# Epic: community-feed

**Status:** Active
**Created:** 2026-06-12
**Book:** `engineering-team/audits/community-feed/book.md`

## Goal
Give signed-in verified members a native, read-only **Feed** inside the LFO app — recent kind-1
notes authored by verified members on Bitcoin/Nostr topics — so new members get a feel for the
community's voice on Nostr before onboarding to richer clients (Primal etc.). v1 is deliberately
small and curated, not a full client.

## Why
LFO is gated by a web-of-trust membership list but, once inside, offers no window into what the
community is actually saying on Nostr. A lightweight, curated feed is a low-risk on-ramp: it
shows the community is alive and gives newcomers somewhere to land before they adopt a full Nostr
client. It stays a **read-only consumer** of relays — consistent with the app's posture (we read,
we don't publish social content).

## Scope (v1)
- Single **unified** feed of Bitcoin- *and* Nostr-hashtagged notes (no topic filter tabs — that's v2).
- Hashtag-only topic detection; content from **nos.lol** only.
- Curated to ~100 notes: representation floor + recency + soft per-member cap.
- Non-interactive cards; click opens the note in Primal.

## Stories

> **Note — stories are not executed in authoring order.** Story numbers reflect the order stories were
> *written*, not the order they're *built*. Execution follows logical dependencies (see "Execution
> order" below). In particular, **#2 (`2-curated-selection`) has been deliberately left in the queue**,
> awaiting stories that logically come first — namely #5 (`5-content-relevance-filter`), whose ADR
> decides whether curation runs server-side and therefore where #2's ranking is built. #2 stays in
> Draft until those land.

- #1 — `1-feed-view` — Gated Feed view: fetch & display qualifying member notes (newest-first, cap 100), cards, open-in-Primal, loading/empty states. *(Done — review PASS)*
- #2 — `2-curated-selection` — Endorsement-ranked curation over a multi-source candidate pool: widen the `getFeed()` seam into 3 layers (sources → merge → selection); primary relevance signal = count of distinct verified-member LFO `nostr-event-tag` attestations on a note; hashtag source (Provider 1) backfills for freshness; event-tag source (Provider 2) stubbed until the protocol lands. *(Draft — 2026-06-18)*
- #3 — `3-inline-images` — Rich rendering: inline images (up to 2 side-by-side, "+N" overlay for extras), media URLs stripped from text. *(Done — review PASS)*
- #4 — `4-mention-resolution` — Rich rendering: resolve @ mentions (members → @DisplayName, others → short @npub handle), backed by a shared member-metadata cache. *(Done — review PASS)*
- #5 — `5-content-relevance-filter` — Step A pool refinement: server-side AI (Claude Haiku) judges whether a hashtagged note's *content* is actually about Bitcoin/Nostr/LFO and drops off-topic notes; stands up the app's first backend (`GET /api/feed`) + persisted relevance signal. *(Draft — 2026-06-18)*

**Execution order:** #1 (done) → #3 (done) → #4 (done) → **#5** → #2. #5 is sequenced before #2: its ADR decides whether curation runs server-side, which determines where #2's ranking is built (avoids building #2 twice). #2 stays in Draft until #5's ADR lands.

## Open questions (epic-level)
- _(none open)_

## Resolved
- **Header** = title "What LFO members are saying…" + subtitle "X members contributing across the latest 100 posts" (member count; copy updated 2026-06-15).
- **Hashtag list (v1)** = `nostr`, `asknostr`, `grownostr`, `bitcoin`, `btc`, `lightning`, `sats` (resolved 2026-06-12).
