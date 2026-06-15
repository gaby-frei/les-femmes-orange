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
- #1 — `1-feed-view` — Gated Feed view: fetch & display qualifying member notes (newest-first, cap 100), cards, open-in-Primal, loading/empty states. *(Done — review PASS)*
- #2 — `2-curated-selection` — Curated selection within the 100: representation floor (every qualifying member ≥1 note) + soft per-member cap (~10) + recency fill. *(Planned — circle back after #3)*
- #3 — `3-inline-images` — Rich rendering: inline images (up to 2 side-by-side, "+N" overlay for extras), media URLs stripped from text. *(Done — review PASS)*
- #4 — `4-mention-resolution` — Rich rendering: resolve @ mentions (members → @DisplayName, others → short @npub handle), backed by a shared member-metadata cache. *(Approved — in progress)*

**Execution order:** #1 (done) → **#3** → #4 → #2.

## Open questions (epic-level)
- _(none open)_

## Resolved
- **Header** = distinct member count, phrased "X members contributing to the discussion" (resolved 2026-06-12).
- **Hashtag list (v1)** = `nostr`, `asknostr`, `grownostr`, `bitcoin`, `btc`, `lightning`, `sats` (resolved 2026-06-12).
