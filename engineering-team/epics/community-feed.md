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
> order" below). **#2 (`2-curated-selection`) was long blocked on Tapestry event-tag support. That
> block cleared 2026-07-09** — the protocol shipped and is live with real LFO data. #2 was then
> **split**: the read path became **#8 (`8-event-tag-source`)**, a pilot proving we can source
> event-tagged notes; #2 retains the policy decisions (tag scope, channel assignment, ranking, caps),
> which are deferred by the PO. #2 is now blocked on **product decisions**, not on Tapestry.

- #1 — `1-feed-view` — Gated Feed view: fetch & display qualifying member notes (newest-first, cap 100), cards, open-in-Primal, loading/empty states. *(Done — review PASS)*
- #2 — `2-curated-selection` — **Superseded (2026-07-12): decomposed into the `curation-policy` epic** (same book), whose four candidate stories carry the ranking / tag-DList / tag↔channel-map / pool-shape scope and open questions o1–o8. **Exception: open question 9 (feed header semantics) stays HERE** — see #10 below. The story file is retained as the pre-decomposition record.
- #3 — `3-inline-images` — Rich rendering: inline images (up to 2 side-by-side, "+N" overlay for extras), media URLs stripped from text. *(Done — review PASS)*
- #4 — `4-mention-resolution` — Rich rendering: resolve @ mentions (members → @DisplayName, others → short @npub handle), backed by a shared member-metadata cache. *(Done — review PASS)*
- #5 — `5-content-relevance-filter` — Step A pool refinement: server-side AI (Claude Haiku) judges whether a hashtagged note's *content* is actually about Bitcoin/Nostr/LFO and drops off-topic notes; stands up the app's first backend (`GET /api/feed`) + persisted relevance signal. *(Done — review PASS 2026-06-22)*
- #6 — `6-topic-channels` — Topic channels (the v2 topic filter tabs): a filter banner of toggleable pills (Bitcoin / NOSTR / LFO Community) that filter the feed **client-side** over the fetched pool using #5's persisted per-topic scores (a note is in channel X iff its X score ≥ the #5 threshold; none selected = show everything); renames the side panel "Topics" → "Source Hashtags"; degrades to disabled pills when scores are unavailable (`channelsAvailable=false`). *(Done — review PASS 2026-06-24, ADR 0034)*
- #7 — `7-inline-videos` — Rich rendering: inline **videos** + extension-less **Blossom media**. Extension-based video URLs (`.mp4/.webm/.mov/.m4v`) **and** extension-less Blossom videos (`blossom.primal.net/<hash>`) embed as a click-to-play, muted, native-controls inline player (player clicks don't open Primal, the rest of the card still does); extension-less Blossom **photos** also embed, reusing #3's image grid. Type of an extension-less URL is resolved via NIP-92 `imeta` metadata (preferred) or a content-type probe (fallback); unconfirmable candidates degrade to a shortened display-only link. Sibling of #3 (images) / #4 (mentions). *(Done — review PASS 2026-07-07, ADR 0035)*
- #8 — `8-event-tag-source` — **Provider 2, read-only pilot.** Source kind-1 notes carrying the `lfo-community` event-tag from `wss://tags.brainstorm.world/relay`: resolve the tagging-header indirection, keep only `apply` assertions whose **tagger** is a verified member (the note's author need not be), assign the existing `lfo` channel, and merge with Provider 1 **by recency** (dedupe by event id, cap 100). Introduces the sources → merge → selection seam with per-note provenance. Provider-2 notes **bypass #5's relevance classifier**. Degrades to zero notes if the tagging relay or TA-pubkey endpoint is unreachable. Amended in flight: a **tag pill** UI (toggleable, shows the tag's name + description from the live tag-element) on Provider-2 notes, and a Decision-3 revision — note **bodies** are fetched from the tagging relay ∪ nos.lol + damus, since the tagging relay holds tagging events, not bodies (live-verified 0/10). *(Done — review PASS 2026-07-11, ADR 0036)*
- #9 — `9-multi-tag-sources` — **Provider 2 widened to four tags.** Extends #8's mechanism to `bitcoin` → bitcoin channel, `nostr` → nostr channel, and `ask-lfo` → a **new "Ask LFO" channel pill** that only Provider 2 ever populates (the classifier's topic set is untouched). Static four-entry tag→channel config, deliberately shaped as the projection of #2's future curated DList. Multi-tagged notes union channels and render one pill per tag. Uniform four-pill degradation when `channelsAvailable=false`. All four tags live with real assertions (verified 2026-07-11: 10 lfo-community, 5 bitcoin, 13 nostr, 6 ask-lfo). In flight: the tagging relay was added to the "Feed Source Relays" panel (user-directed, same dot semantics). *(Done — review PASS 2026-07-12, ADR 0037)*
- #10 — `10-feed-header-semantics` — **Resolved additively (PO 2026-07-12):** the members/posts line stays exactly as-is (status quo ratified, non-member authors included); the header gains a second line, **"Z active content taggers"** — distinct member APPLIER pubkeys over the *visible* note pool, deduped across tags/notes, disputers never counted, recomputed live on channel toggles, always rendered (zero included, singular form at 1). Requires an additive payload extension carrying per-note applier pubkeys. *(Done — review PASS 2026-07-12, ADR 0038)*
- #11 — `11-note-translation` — **(QUEUED — candidate; no story file; decision pending)** Translate note content from its detected language to the reader's preferred language (live motivation: real German notes in the feed today). Feasibility discussed 2026-07-12, three shapes on the table: **(a)** browser-built-in only (`Translator`/`LanguageDetector` — free, on-device, but desktop Chrome/Edge ONLY in mid-2026: no mobile, no Safari, Firefox negative position); **(b)** server-only via existing Haiku + KV pattern (ADR 0033 precedent; cache by `(noteId, targetLang)` — notes immutable so cache-forever; universal coverage incl. iOS; can preserve @mentions/#hashtags verbatim); **(c)** hybrid. Product Expert lean: (b). **PO decisions pending before /plan-feature:** preferred-language source (navigator.language vs picker), per-note button vs auto-translate, whether mobile coverage is required (this alone nearly decides a vs b/c), cost tolerance. *(Not started — return to when ready)*

**Execution order:** #1 (done) → #3 (done) → #4 (done) → #5 (done) → #6 (done) → #7 (done) → #8 (done) → #9 (done) → #10 (done) → *#11 (queued — awaiting PO decisions)*.
#2 left the queue 2026-07-12 — decomposed into the sibling `curation-policy` epic (its DList story
inherits the `EVENT_TAGS` socket #9 shaped for it). All *committed* stories are Done; #11 is a
queued candidate, not yet planned. The epic stays Active per PO direction (2026-07-12) while #11
is pending and the sibling `curation-policy` is in flight — epic retirement and book close are
deferred decisions, not defaults.
#5 was sequenced before the event-tag work: its ADR moved the feed data layer server-side (ADR 0033),
which is where #8's Provider 2 now lives. #8 lands the **mechanism** (sourcing + the three-layer seam)
against one pilot tag with recency ordering; #2 then lands the **policy** (endorsement ranking, tag
scope, tag↔channel map, floor/cap) over the seam #8 built — so #2 changes only the selection layer.
#2 stays in Draft pending PO answers to its 9 open questions.

## Open questions (epic-level)
- **Member coverage of the feed source** Initially, Primal was the augment relay
  because nos.lol's web-of-trust **write** filter blocks some members from publishing there, so their
  notes only surfaced via primal. Story #5 moved the relay fetch **server-side**, where `relay.primal.net`
  accepts the WebSocket but silently drops REQ subscriptions from a datacenter IP (verified 2026-06-21:
  opens, 0 messages, times out — headers don't help), so primal no longer contributes. nos.lol alone
  covered ~45/48 members, dropping the contributions of write-blocked members from the feed -- a gap likely to
  grow with membership. Two routes worth exploring:
  - **(a) Swap in a datacenter-friendly augment relay.** Coverage-probe the permissive, server-reachable
    shortlist (`relay.snort.social`, `offchain.pub`, `nostr-pub.wellorder.net`, `nostr.oxtr.dev`) against
    the **real member set** to find which actually carries the write-blocked members (reuse
    `scripts/Relay Probe Scripts/`). `relay.nostr.band` is out — Cloudflare-gated from servers;
    `relay.mostr.pub` is a fediverse bridge. **`relay.damus.io` is the current interim augment** —
    server-reachable and confirmed to carry the maintainer's write-blocked test npubs (contra ADR 0029's
    earlier browser-only "strict subset of nos.lol" finding); it should be re-measured in this probe.
  - **(b) Adopt the NIP-65 outbox model.** Read each member's `kind:10002` relay list and query their own
    **write** relays — fetching each author from where they actually publish, which inherently covers the
    write-blocked members rather than betting on one augment relay. More work (per-author relay resolution),
    but the protocol-correct, durable fix.

  **Interim (Story #5):** `relay.damus.io` replaced `relay.primal.net` as the augment in `FEED_RELAYS`
  (backend + panel), since primal silently drops server-side REQs. This is a stopgap that restores the
  write-blocked test npubs; the routes above are the real resolution.

## Forward-looking design notes
- **Channel membership has two sourcing mechanisms, by provider.** Topic feed channels (#6, ADR 0034)
  are a lens defined by each note's `channels` array. How that array is populated depends on where the
  note came from:
  - **Provider 1 (hashtag source) — by content score.** A Provider-1 note's channels are derived from
    Haiku's per-topic relevance scores `{ bitcoin, nostr, lfo }` (a note is in channel X iff `score_X ≥`
    the #5 threshold). This is the only mechanism today.
  - **Provider 2 (event-tag source; #8 pilots it, #2 generalizes it) — by event-tag.** Provider-2 notes are
    **not** channel-categorized by Haiku scores, and are **not subject to #5's relevance filter at all** — a
    member's tag *is* the relevance judgment. Instead, LFO supports a set of **event-tags that correspond to
    feed channels**, and a note carrying a given event-tag belongs to the channel(s) that tag maps to. The
    mapping is **not necessarily 1:1** — one event-tag may map to **one or several** channels. **#8 hardcodes
    the single pilot mapping `lfo-community → lfo`**; the general map is #2's to design.
  - **Provider 2 gates on the tagger, not the author.** A note admitted by an event-tag need **not** be
    authored by a verified member — only **tagged** by one. This breaks the author-axis assumption behind
    the representation floor and the per-member cap, and it means `memberCount` ("X members contributing")
    can be inflated by non-member authors. Both are open questions on #2.
  - **Keep in mind as we build:** treat `channels` (ADR 0034) as the provider-agnostic seam — both
    providers ultimately emit a per-note `channels` list, just computed differently (P1: score→channels;
    P2: event-tag→channels via the tag↔channel map). When #2 lands, the channel set may also need to grow
    beyond the current three (Bitcoin / NOSTR / LFO Community) to match the supported event-tags.

## Resolved
- **Header** = title "What LFO members are saying…" + subtitle "X members contributing across the latest 100 posts" (member count; copy updated 2026-06-15).
- **Hashtag list (v1)** = `nostr`, `asknostr`, `grownostr`, `bitcoin`, `btc`, `lightning`, `sats` (resolved 2026-06-12).
