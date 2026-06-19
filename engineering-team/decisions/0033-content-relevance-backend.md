# ADR 0033: Content-relevance backend — request-time `/api/feed` + key-value score cache

**Status:** Accepted
**Date:** 2026-06-19
**Story:** `engineering-team/stories/community-feed/5-content-relevance-filter.md`

## Context

Story 5 (Step A — pool refinement) adds a **content-relevance filter** to Provider 1 (the hashtag
source). Hashtags signal author *intent*, not *content*: a dog post tagged `#grownostr` passes today's
`#t`-only query. The story classifies each candidate note with a small AI model and drops the
off-topic ones.

**Acceptance criteria (quoted back):**
- Feed content served via a **server-side** path (`GET /api/feed`); classification runs on the server; **the AI API key is never in client code or responses.**
- A hashtagged-but-off-topic note (golden: dog post + `#grownostr`) is **excluded**; an on-topic or clearly **adjacent** note (lightning/mining/crypto → bitcoin) is **included**.
- Relevance is **topical and depth-neutral** — a casual on-topic post scores like a technical deep-dive.
- Each note classified **once**; verdict **persisted** and reused on later requests (no re-classify).
- Classifier unavailable → **graceful fallback to hashtag-only**; feed never breaks.
- A golden fixture set of labelled notes produces verdicts matching labels.
- **Three per-topic scores** `{ bitcoin, nostr, lfo } ∈ [0,1]` persisted; filter = `max(...) ≥ threshold`; per-topic scores reusable by later curation and v2 topic tabs.
- **Synchronous** classification — an unjudged note is never shown.

**Constraints (story + project + prior ADRs):**
- **No build step / JS-without-build** (CLAUDE.md). Vercel serverless functions are plain JS with no
  bundler, so they preserve this. *New runtime libraries* for the backend (AI SDK, KV client) are
  authorized **by this ADR** — distinct from the lint/typecheck/build tooling CLAUDE.md forbids.
- **The app has no backend today.** `server.js` is a 43-line static file server; the app is served as
  static `public/` on Vercel (`vercel.json`); the only client dep is `nostr-tools` from esm.sh. There
  is **no server session** — gating today is client-side (sign-in reveals views).
- **ADR 0029 already designed this migration** ("Planned evolution: `GET /api/feed`"). It fixed the
  JSON **shape contract** (`{ memberCount, notes:[{ id, pubkey, created_at, content, author:{…} }] }`),
  built `getFeed()` as a drop-in boundary (`// PLANNED: replace this body with fetch('/api/feed')`),
  named **Vercel KV** as the likely store, and deferred two decisions to "when the endpoint is built":
  **(a) LFO's deployment model** and **(b) endpoint gating.** This ADR picks those up.
- Concept Graph API **unreachable** during design (same as ADR 0029). Nothing here defines or mutates a
  Tapestry concept, so the graph is not needed and **no firmware reinstall** applies.
- **PO direction (Story 5):** Claude Haiku; per-topic score output; moderate+adjacent+depth-neutral
  relevance; **conservative/lean-inclusive** starting threshold (small ~50-member base → over-filtering
  visibly empties the feed); synchronous; cost not a concern.

This story is the trigger 0029 named ("when post/user volume warrants it … robustness") — here the
trigger is the *secret*: AI classification **cannot** run client-side (key exposure; re-paying to
re-judge notes every load). That forces the backend, and the backend is then the natural home for all
curation — which is why this ADR **gates Story 2's implementation** (where `curate()` runs is decided
here, not in Story 2).

## Options considered

Two coupled questions: **(1) backend topology** — where does classification run relative to the
request — and **(2) the persistence store.** Options A/B differ on topology; C differs on the store.

### Option A — Request-time serverless `GET /api/feed` + key-value score cache  *(chosen)*
A Vercel serverless function at `api/feed.js` does, per request:
1. compute the verified-member set + fetch a **widened pool** of Provider-1 candidates from relays
   (candidate cap ≫ display size — see *Candidate pool vs. display size*; logic 0029 put in client
   `getFeed()`, ported to Node with `nostr-tools`);
2. look up each note's scores in **KV by note id**;
3. **synchronously classify** the *uncached* notes via Claude Haiku (structured JSON → 3 scores),
   parallelized with a concurrency cap;
4. **persist** new scores to KV (write-once);
5. filter `max(bitcoin,nostr,lfo) ≥ THRESHOLD`, then take the **newest `DISPLAY_LIMIT` (~100)** survivors;
6. return the **exact 0029 contract**. Client `getFeed()` becomes `return (await fetch('/api/feed')).json()`.

KV key `relevance:v1:<noteId>` → `{ bitcoin, nostr, lfo, model, scoredAt }`.

- **Pros:** Satisfies **synchronous** (no unjudged note ever served — classify-then-filter inside the
  request). Cold cost is paid **once per note**, then instant (cache hit); steady-state has near-zero
  classification. KV exactly fits the access pattern (see Decision). Serverless fits Vercel with **no
  long-lived process** (the worry 0029 raised) and **no cron**. Secret lives in a server env var.
  Reuses the 0029 contract, so render/nav/cards/header are **untouched**. Per-topic scores in KV are
  immediately reusable by Story 2's server-side curation and v2 tabs.
- **Cons:** First request after a burst of new notes pays Haiku latency (mitigations: bounded candidate
  pool, batched/parallel classification, fast Haiku). Adds runtime deps (AI SDK + KV client) and a
  server-side relay fetch. Cold starts. Requires resolving env/secrets and the gating posture (below).

### Option B — Cron precompute to KV, stateless serve  *(0029's original sketch)*
A scheduled function classifies + curates **offline**, writes the full payload to KV; `GET /api/feed`
serves the precomputed blob.

- **Pros:** `GET` is O(1) and never pays classification latency; trivially "no unjudged note" (payload
  only holds classified notes); smooth under load.
- **Cons:** **Freshness lag** — a new note appears only after the next cron tick, which is the
  "background pass" behaviour the PO **explicitly rejected** in Q4. Cron is more machinery and another
  deployment surface. Precomputing one shared payload pre-empts any later per-viewer personalization.
  Better at much larger scale; premature now.

### Option C — Relational DB (Vercel Postgres / SQLite) for persistence
Same topology as A, but scores live in a relational table instead of KV.

- **Pros:** Queryable (e.g. "all notes with `nostr ≥ 0.8`"); good if scores later feed analytics/joins.
- **Cons:** **Over-machinery** for write-once point-lookups keyed by id. Introduces schema, migrations,
  connection pooling, and an ORM/driver — against the project's minimal, JS-without-build, low-ops
  ethos. No relational query is needed today: the filter is a single `max` over three fields, done in
  app code. Revisit only when a future story needs relational queries over scores.

## Decision

We chose **Option A**.

**Topology — request-time over cron (B):** the PO chose *synchronous* over a background pass precisely
to avoid the appear-then-vanish flicker and the freshness lag. Classify-then-filter inside the request
delivers that directly, and KV caching means the latency cost is one-time per note, not per load. It
also needs no cron and no long-lived process — it slots into Vercel serverless cleanly, resolving
0029's "no always-on process" concern without new infra.

**Persistence — key-value over relational (C), justification made explicit (per the story's ask):**
- **Access pattern is pure point I/O by note id** — `get(noteId)` on read, `set(noteId, scores)` on
  first classification. No joins, scans, ranges, or ad-hoc queries. This is the textbook KV pattern.
- **Write-once / read-many:** a note's content is immutable, so its scores never change → a note is
  written once and read on every subsequent feed build. KV's `get`/`set` is the right primitive.
- **Note id is an ideal key:** the Nostr event id is immutable, globally unique, content-addressed.
- **Values are tiny and fixed-shape** (`{ bitcoin, nostr, lfo, model, scoredAt }`, ~tens of bytes).
- **Minimal ops, no schema/migrations** — matches JS-without-build and keeps the backend thin.
- **Vercel-native** (`@vercel/kv`, Upstash Redis under the hood) integrates with the existing Vercel
  deployment with near-zero setup — and is exactly what **ADR 0029 anticipated**, so we are executing a
  pre-blessed direction, not inventing one.

**Candidate pool vs. display size — decouple the two caps:** today `FEED_LIMIT = 100` is both the
fetch cap and the display cap. Once the relevance filter drops notes, those diverge — and because at
this story's completion the feed is **entirely Provider 1**, *every* displayed note passes through the
filter, so a fetch of 100 would render fewer than 100. We therefore fetch a **widened candidate pool**
(`CANDIDATE_LIMIT`, ~500 — the relay's natural cap) and, after filtering, display the **newest
`DISPLAY_LIMIT` (~100)** survivors. This is the same widening **ADR 0029 already planned for Story 2**
("widen the fetch to the relay's natural cap, ~500"), pulled forward because the filter needs the
larger pool now. If fewer than `DISPLAY_LIMIT` relevant notes exist, the feed shows what it has — a
smaller relevant feed beats a padded one.

**Deployment model & gating (0029's two deferred questions), decided for v1:**
- **Deployment:** Vercel **serverless functions** (`api/*.js`) alongside the existing static `public/`.
  No container/long-lived process; secrets via Vercel env vars. This is the smallest viable backend.
- **Gating:** v1 serves `/api/feed` **without a server-side auth gate.** Rationale (0029's own
  argument): feed content is **already public on Nostr relays**, so this is a posture choice, not a
  secrecy requirement — and the app has no server session today to gate against. Adding a NIP-07 /
  session gate is a separate, later decision (flagged below), not a blocker for this story.

## Consequences

- **Enables:** the app's **first backend** and the `/api/feed` boundary 0029 anticipated; the AI key
  stays server-side; a **persisted, reusable per-note content signal** (the three scores) that Story 2's
  curation and v2 topic tabs read directly; graceful degradation to hashtag-only.
- **Constrains / requires:**
  - **Story 2's `curate()` now belongs server-side**, inside `/api/feed`, since the data layer has moved
    there. This is the gate: Story 2 stays in Draft until this ships, then is built in Node, not the
    browser. (Exactly the rework 0029/Story-5 warned about, now avoided.)
  - **Membership computation moves server-side too:** the function must compute the verified-member set
    to fetch Provider-1 candidates. Rather than duplicate it, extract `getTagItems()`/`buildMemberSets()`
    into a **shared plain-JS ES module** (`public/lib/membership.js`) imported by **both** the inline
    client script (gated members view) and the Node `/api/feed` function — written once, no build step,
    no duplication.
  - New **env vars**: `ANTHROPIC_API_KEY`, and KV creds (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) on
    Vercel — must be set before deploy. New **runtime deps** (authorized here): `@anthropic-ai/sdk`,
    `@vercel/kv`; `nostr-tools` (already present) now also runs server-side.
- **Debt / follow-ups:**
  - **Cold-start + first-sight latency.** On a fully cold cache the first load classifies up to
    `CANDIDATE_LIMIT` (~500) notes in one request — a **one-time** cost (all cached afterward),
    bounded by the relay cap and parallelized. Mitigate via the concurrency cap; acceptable given the
    PO's "cost not a concern" and one-time nature.
  - **Re-classification / versioning.** Scores are immutable per (note, prompt, model). The KV key
    carries a **`v1`** prefix and the value stores `model`; a future prompt/model/threshold change
    re-scores under a new prefix (e.g. `relevance:v2:`) without colliding — so "no re-classify" holds
    for a fixed config, and config changes are an explicit, selective re-score.
  - **THRESHOLD** is a tunable server const, started **low (lean-inclusive)**; tighten as real verdicts
    are observed.
  - **Prompt wording** is the Implementer's, guided by the relevance definition (moderate + adjacency +
    depth-neutral).
- **Firmware reinstall required?** **No** — no concept definitions touched.

## Implementation notes

Concrete surface for the Tester/Implementer.

1. **`api/feed.js`** (new — Vercel serverless function; Vercel routes `/api/*` to `api/*.js`). Exports a
   handler that returns the **0029 contract** JSON. Body:
   - compute member set server-side via the shared `public/lib/membership.js` module (extracted
     `getTagItems`/`buildMemberSets`; query the two membership relays for kind 9999/39999, dedup by id,
     closure over the seed);
   - fetch Provider-1 candidates: `{ kinds:[1], authors: memberPubkeys, '#t': FEED_HASHTAGS, limit: CANDIDATE_LIMIT }`
     against `FEED_RELAYS` (nos.lol + primal, per ADR 0029 amendment), merge/dedup by id;
   - `scores = await classifyNotes(candidates)` (KV-cached, see #2);
   - keep notes where `Math.max(s.bitcoin, s.nostr, s.lfo) >= THRESHOLD`, then sort newest-first and
     slice to `DISPLAY_LIMIT`;
   - resolve author metadata (kind-0) and map to the contract; return `{ memberCount, notes }`.
2. **`classifyNotes(notes)`** (new module, e.g. `api/_lib/classify.js`):
   - for each note: `kv.get('relevance:v1:'+note.id)`; collect cache misses;
   - classify misses via Claude Haiku (`claude-haiku-4-5`) — **structured JSON** output
     `{ bitcoin:0..1, nostr:0..1, lfo:0..1 }`, prompt encoding moderate breadth + adjacency
     (lightning/mining/crypto→bitcoin; broader Nostr ecosystem→nostr; LFO community→lfo) + **explicit
     depth-neutrality** (event/casual posts score like technical ones). Parallelize with a concurrency
     cap (e.g. 5);
   - `kv.set('relevance:v1:'+note.id, { ...scores, model, scoredAt: Date.now() })`;
   - **fallback:** wrap the Haiku call in try/catch — on error or missing `ANTHROPIC_API_KEY`, return a
     sentinel that makes the note **pass** the filter (treat unknown as included) so the feed degrades
     to hashtag-only and never breaks.
3. **Config consts** (server): `THRESHOLD` (start low, e.g. `0.3`, tunable); `CANDIDATE_LIMIT` (~500,
   relay natural cap — the fetch size) and `DISPLAY_LIMIT` (~100 — the post-filter display size,
   replacing 0029's single `FEED_LIMIT`); reuse `FEED_HASHTAGS` / `FEED_RELAYS` from ADR 0029.
4. **Client `getFeed()`** (`public/index.html`): replace the body with
   `return (await fetch('/api/feed')).json();` — render layer, nav, cards, header, and the "Feed Source
   Relays"/"Topics" panels are **unchanged** (they consume the contract).
5. **Deps & config:** add `@anthropic-ai/sdk`, `@vercel/kv` to `package.json`; document required Vercel
   env vars; `vercel.json` continues serving `public/` statically with `/api/*` as functions.

## Out of scope
- **Story 2 curation algorithm** (endorsement+recency) — runs server-side *after* this lands; not built here.
- **Provider 2 / event-tag sourcing** — unrelated, still stubbed.
- **v2 topic tabs** — they will consume the per-topic scores; not built here.
- **Endpoint auth gating** (NIP-07/session protection of `/api/feed`) — flagged above; deferred, as
  feed content is already public on relays.
- **Exact prompt text and final THRESHOLD value** — Implementer/iteration, not fixed by this ADR.
- **Re-classification scheduling** — not needed for v1 (scores immutable per config); the `v1:`
  key-prefix scheme is the mechanism if/when config changes.
