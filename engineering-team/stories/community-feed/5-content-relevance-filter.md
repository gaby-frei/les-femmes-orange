# Story 5: Content-relevance filter for the hashtag source (server-side, AI-assisted)

**Status:** Draft
**Created:** 2026-06-18
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background

Think of feed curation as two steps:

- **Step A — what's eligible at all?** Which notes are even allowed into the pool.
- **Step B — what order do we show them in?** Ranking the eligible notes.

**Story 2 is Step B** (endorsement + recency scoring). **This story is Step A** — and the two are
independent jobs that compose: this narrows what the hashtag source (Provider 1) contributes; Story 2
ranks whatever ends up in the pool.

**The problem.** A hashtag is a label the *author* chose; it does not guarantee the note's **content**
is on-topic. Previewing the `feat/community-feed` branch surfaced a meaningful number of notes that
carry a qualifying hashtag but whose content has nothing to do with Bitcoin/Nostr/LFO — e.g. a post
about dogs tagged `#grownostr`. The current Provider 1 query matches on the `t` tag only, so these
pass through. We want to refine Provider 1 by **reading the note and judging whether it is actually
about Bitcoin/Nostr/LFO**, dropping the ones that are not — a judgment well-suited to a small AI model
(Claude Haiku).

**Why this forces a backend, and why it goes first.** Today the entire app runs **client-side**:
`server.js` is a 43-line static file server, Vercel serves `public/` statically, and the feed is
built from in-browser relay queries. AI classification cannot run there — the API key would be exposed
in the browser, and we'd re-pay to re-judge the same notes on every page load. Both problems require a
**server we control** that (1) holds the secret and (2) **remembers each note's verdict** (persistence)
so each note is judged once. This is therefore the app's **first real backend** — the `GET /api/feed`
boundary that ADR 0029 already anticipated (`getFeed()` was written as a drop-in for it).

That backend decision is a fork in the road for *all* curation: once the server exists, it becomes the
natural home for sourcing, merging, classification, **and Story 2's ranking**. If Story 2 is built
client-side first and the backend lands afterward, Story 2 gets rebuilt server-side. So this story is
sequenced **before Story 2's implementation**: its ADR settles where curation runs, and Story 2 stays
in Draft until then. (Story 2 is independent of content tags — this ordering is about *where the work
runs*, not a data dependency.)

## User-facing description
As a **signed-in verified member**, I want the feed to show notes that are **actually about**
Bitcoin/Nostr/LFO — not posts that merely carry a relevant hashtag — so that the feed feels relevant
and isn't padded with off-topic content.

## Acceptance criteria
Testable from the outside. AI verdicts are non-deterministic, so criteria target the **pipeline** and a
small **golden fixture set**, not exact per-note model output.

- [ ] Given the feed loads, then its content is served via a **server-side** path (the `GET /api/feed`
  boundary), and the AI classification runs **on the server** — the AI API key is never present in
  client code or network responses.
- [ ] Given a note that carries a qualifying hashtag but whose **content is off-topic** (golden example:
  a dog post tagged `#grownostr`), when the feed is built, then that note is **excluded**.
- [ ] Given a note that is genuinely about Bitcoin/Nostr/LFO, then it is **included**.
- [ ] Given a note has already been classified, when the feed is requested again, then it is **not
  re-classified** — the stored verdict is reused (each note judged once; verdict persisted).
- [ ] Given the classifier is **unavailable or errors**, when the feed is built, then it **falls back to
  hashtag-only** (no content filtering) and still renders — the feed never breaks on classifier failure.
- [ ] Given the golden fixture set of labelled on-topic / off-topic notes, when run through the pipeline,
  then verdicts match the labels for that set.
- [ ] Given a classified note, then its **relevance verdict/score is persisted as a reusable content
  signal** (not a fire-and-forget drop), so later curation can consume it.

## Concepts touched
Concept Graph API should be consulted by the Architect for live handles.

- **Nostr kind-1 text note** — the unit classified and filtered.
- **Topic hashtag (`t` tag)** — Provider 1's coarse signal; this story adds a *content* signal on top.
- **Content-relevance signal** *(new)* — a persisted per-note verdict/score (on-topic vs off-topic),
  produced by the classifier; initially a Provider-1 filter, available to later curation.
- **`GET /api/feed` backend boundary** *(new; anticipated by ADR 0029)* — the server-side seam this
  story stands up.
- **Verified LFO member set** — unchanged; still gates Provider 1's authors.

## Out of scope
- **Step B ranking** (endorsement + recency) — that's Story 2.
- **Provider 2 / event-tag sourcing** — unrelated source, still stubbed.
- **Per-topic split** (Bitcoin vs Nostr tabs) — v2; this story produces one relevance verdict, not
  topic tabs.
- **Feed display / card UI changes** — the rendered feed looks the same; only the pool changes.
- **Exact model, prompt, persistence technology, and hosting choices** — Architecture/ADR decisions,
  not fixed here (Claude Haiku is the PO's default; see below).

## Open questions
Resolve before approving.

1. **Model & prompt** — confirm Claude Haiku; classification prompt and the on-topic definition
   (Bitcoin OR Nostr OR LFO — how broadly?).
2. **Borderline handling** — strict drop vs. a score with a threshold; what happens to "maybe" notes.
3. **Persistence** — what store holds verdicts, and the **cache key** (note id; re-classify never, or on
   some interval?).
4. **When classification runs** — synchronously on first request (slower first load) vs. a background
   pass (feed may briefly include not-yet-judged notes).
5. **Cost budget** — expected classification volume and a ceiling.
6. **Single verdict vs. content tags** — does the classifier emit one relevance verdict now, or also
   coarse content tags (e.g. `bitcoin`/`nostr`) that v2 topic tabs and later curation could reuse?

## Decided constraints (PO direction)
- Classification **must run server-side**; the API key never reaches the client.
- Verdicts are **persisted and reused** — each note classified once, not per feed load.
- The feed **degrades gracefully** to hashtag-only if the classifier is unavailable.
- The classifier emits a **reusable content signal**, not just an in-place filter decision.
- This story's **ADR gates Story 2 implementation** (where curation runs is decided here).
- Default model: **Claude Haiku** (latest), pending confirmation in Open questions.

## Linked artifacts
- ADR: (filled in after Architecture phase — **not yet started; gates Story 2 implementation**)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- Related: ADR 0029 (community-feed view / `GET /api/feed` boundary); Story 2 `2-curated-selection`
  (Step B ranking); memory `project-feed-curation-direction`.
