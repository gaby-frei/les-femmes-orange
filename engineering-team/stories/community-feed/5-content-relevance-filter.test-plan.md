# Test Plan: Story 5 — Content-relevance filter (server-side, AI-assisted)

**Story:** `engineering-team/stories/community-feed/5-content-relevance-filter.md`
**ADR:** `engineering-team/decisions/0033-content-relevance-backend.md`
**Date:** 2026-06-19

## Approach

Story 5 moves the feed's data logic **server-side** (a Vercel serverless function `api/feed.js`, calling
Claude Haiku + Vercel KV + relays). The existing harness (Playwright against the static `server.js`,
which does **not** run `/api/*` functions) can't exercise that, and we must **not** hit real Haiku / KV /
relays in CI (non-deterministic, costs money, needs secrets). So tests are split by level, and the
**external dependencies are injected** so fakes stand in for them.

**The determinism split (important):** AI verdicts are non-deterministic, so model *quality* (does Haiku
actually rate the dog post low?) is validated by an **opt-in eval** against the golden set (real key,
not in `npm test`). Everything else — the *pipeline* given scores (include/exclude, slice, cache reuse,
fallback, contract shape) — is **deterministic** and tested by seeding the fake classifier with the
golden labels. So the golden fixtures do double duty: labeled inputs for deterministic pipeline tests,
and the eval set for the real model.

### Test levels
- **L1 — pure unit** (`node --test`): `selectRelevant(notes, scores, {threshold, displayLimit})` — filter
  on `max(bitcoin,nostr,lfo) ≥ threshold`, sort newest-first, slice to `displayLimit`.
- **L2 — orchestration unit** (`node --test`, fakes): `classifyNotes(notes, {kv, classifyOne})` — cache
  hit skips the model; miss calls `classifyOne` once and persists; `classifyOne` throwing → fallback.
- **L3 — handler/contract integration** (`node --test`, all deps faked): `buildFeedPayload(deps)` returns
  the **0029 contract** `{ memberCount, notes }`, off-topic excluded, sliced, fallback path unfiltered.
- **L4 — model eval** (opt-in, real Haiku, needs `ANTHROPIC_API_KEY`): golden set → verdicts match labels
  within tolerance. **Not** part of `npm test`; run via `npm run eval:relevance`.
- **L5 — Playwright e2e**: route-mock `/api/feed` → the render layer (unchanged from Story 1) shows the
  returned notes; fallback payload still renders; and the **AI key never appears** in client code or in
  the `/api/feed` response body (AC-1 key-safety).

## Dependency / seam contract (the implementation must satisfy)

So fakes can be injected, the implementation must expose these importable units (CommonJS or ESM,
consistent with Vercel's runtime):

- `public/lib/membership.js` — extracted `getTagItems`/`buildMemberSets`, importable by **both** the
  inline client and Node. Pure given an injected relay-query fn.
- `api/_lib/classify.js`:
  - `classifyOne(note, { anthropic })` → `{ bitcoin, nostr, lfo } ∈ [0,1]` (the single Haiku call).
  - `classifyNotes(notes, { kv, classifyOne })` → `Map<id, {bitcoin,nostr,lfo}>` (KV-cached; persists
    misses via `kv.set('relevance:v1:'+id, …)`; on `classifyOne` throw, returns a sentinel that **passes**
    the filter).
- `api/_lib/select.js` — `selectRelevant(notes, scores, { threshold, displayLimit })` → filtered,
  newest-first, sliced array.
- `api/feed.js` — `buildFeedPayload(deps)` orchestrator (deps: `computeMembers`, `fetchCandidates`,
  `classifyNotes`, `fetchMetadata`, `kv`, `threshold`, `candidateLimit`, `displayLimit`) returning the
  contract; plus the thin HTTP `handler(req,res)` that wires the **real** deps from env and calls it.
  Tests call `buildFeedPayload` with fakes; the handler is what Vercel invokes.
- Constants: `THRESHOLD` (~0.3), `CANDIDATE_LIMIT` (~500), `DISPLAY_LIMIT` (~100).
- Client `getFeed()` (`public/index.html`) → `return (await fetch('/api/feed')).json()`; render layer
  (`loadFeedPage`/`makeFeedNote`/`#feed-*`) unchanged.

## Coverage map

| # | Acceptance criterion | Test name | File | Level |
|---|---|---|---|---|
| AC-1 | served via `/api/feed`; key never in client/response | `handler returns the /api/feed contract shape` + `client code and feed response contain no ANTHROPIC key` | `test/feed-handler.test.js`, `tests/community-feed.spec.js` | L3 + L5 |
| AC-2 | off-topic hashtagged note (dog `#grownostr`) excluded | `drops a note whose max score is below threshold` | `test/select-relevant.test.js` | L1 |
| AC-3 | adjacent note (lightning/mining/crypto→bitcoin) included | `keeps a note scoring >= threshold on any one bucket` | `test/select-relevant.test.js` | L1 |
| AC-4 | depth-neutral (casual scores like technical) | `golden casual on-topic note scores >= threshold like its technical twin` (pipeline) + eval | `test/select-relevant.test.js` + `eval/relevance.eval.js` | L1 + L4 |
| AC-5 | classified once; re-request reuses verdict | `cache hit skips the model` + `cache miss classifies once and persists` | `test/classify-notes.test.js` | L2 |
| AC-6 | synchronous — unjudged note never shown | `every returned note has a score (none unjudged)` | `test/feed-handler.test.js` | L3 |
| AC-7 | classifier error → fallback hashtag-only, never breaks | `classifyOne throwing yields pass-through (unfiltered) feed` | `test/classify-notes.test.js`, `test/feed-handler.test.js` | L2 + L3 |
| AC-8 | golden set verdicts match labels | `golden fixtures classify within tolerance` | `eval/relevance.eval.js` | L4 (opt-in) |
| AC-9 | three scores persisted; filter = max≥threshold; reusable | `persists {bitcoin,nostr,lfo} under relevance:v1:<id>` + `filter uses max of three` | `test/classify-notes.test.js`, `test/select-relevant.test.js` | L1 + L2 |
| ADR | widen fetch, slice to display size | `slices filtered survivors to displayLimit, newest-first` | `test/select-relevant.test.js` | L1 |

## Edge cases
- [ ] Empty candidate pool → `{ memberCount: 0, notes: [] }`, no model calls.
- [ ] All notes off-topic → empty feed (not a crash, not padded).
- [ ] Fewer than `displayLimit` relevant notes → feed shows what exists.
- [ ] Mixed cache state (some hits, some misses) → only misses call the model; result merges both.
- [ ] Score exactly at threshold → boundary (`>=` keeps it).
- [ ] KV read/write error (not just model error) → degrade rather than 500 (document expected behavior).
- [ ] Tie on `created_at` during slice → stable.

## Test infrastructure
- **Frameworks:** Node's **built-in** test runner (`node --test`) for L1–L3 (no new dependency — it ships
  with Node); Playwright for L5 (existing). L4 eval is a plain Node script.
- **New:** a `test/` directory and `"test:unit": "node --test test/"` script; `npm test` updated to run
  unit + Playwright. `"eval:relevance": "node eval/relevance.eval.js"` (opt-in, needs `ANTHROPIC_API_KEY`).
- **Fakes:** in-memory KV (`Map`-backed `{ get, set }`); `classifyOne` stubs (fixed scores; a throwing
  variant); fake `fetchCandidates`/`computeMembers`/`fetchMetadata` returning fixtures.
- **No** real relays, Haiku, or KV in `npm test`. Concept Graph API not used (no concepts touched).
- **Fixtures:** `test/fixtures/golden-notes.js` — labelled notes incl. the `#grownostr` dog post
  (off-topic), a lightning post (bitcoin-adjacent), a casual + a technical Bitcoin post (depth-neutral
  pair), a Nostr post, an LFO post.

## How to run
```
npm test                 # unit (node --test) + Playwright
npm run test:unit        # L1–L3 only
npm run test:playwright  # L5 only
npm run eval:relevance   # L4 — opt-in, requires ANTHROPIC_API_KEY (not in CI)
```

## Explanatory notes (plain-language, for future reference)

Two **kinds** of tests here, because the AI doesn't always give the exact same answer (it's
non-deterministic), so we can't put it inside tests meant to pass identically every run. We split them:

### Kind 1 — the "plumbing" test (`npm test`, runs always, fast & free)
Checks that *everything around the AI* works, by **pretending the AI already answered**: we hand-feed
known scores ("this note = 0.1, that one = 0.9") and verify the machine does the right thing with them
— drops the low ones, keeps the high ones, remembers past answers so it doesn't re-ask, doesn't crash if
the AI is down, and hands the page the right shape of data. It never calls real Haiku, so it's instant,
costs nothing, and is identical every run. **It proves the pipes are connected — not that the AI has good
judgment.** These are levels **L1–L3**:
- `test/select-relevant.test.js` (L1) — keep/drop by `max ≥ threshold`, newest-first, slice (AC-2, AC-3, AC-9, ADR widening).
- `test/classify-notes.test.js` (L2) — judge-once / cache reuse, persist the three scores, fallback when the AI errors (AC-5, AC-7, AC-9).
- `test/feed-handler.test.js` (L3) — the whole `/api/feed` payload: right shape, off-topic excluded, no unjudged note, fallback path (AC-1, AC-6, AC-7).

### Kind 2 — the "judgment" test (`npm run eval:relevance`, run only when you choose)
Actually calls **real Haiku** with the golden notes (the dog post, the bitcoin post, …) and checks "did it
rate the dog post low and the bitcoin post high?" Because it hits the real AI it needs the API key, costs a
little, and can wobble run-to-run — so it's **not** in everyday `npm test`. Run it deliberately when you
want to check or tune the prompt. This is level **L4**: `eval/relevance.eval.js` (AC-8, and the model side
of AC-4).

**Takeaway:** every commit cheaply confirms "the system handles scores correctly" (Kind 1); separately,
whenever you care, you confirm "the AI gives good scores" (Kind 2). The flaky, costs-money part stays out
of the test you run constantly.

## Verification
The new tests fail with the current code — RED for the right reason: the contracted modules don't
exist yet (`api/_lib/select.js`, `api/_lib/classify.js`, `api/feed.js`) and `getFeed()` is not yet
`fetch('/api/feed')`. The Implementer creates those modules to the seam contract above and the
assertions then run. Confirmed red on 2026-06-19 (`npm run test:unit`):

```
✖ test/classify-notes.test.js — 'test failed'
✖ test/feed-handler.test.js   — 'test failed'
✖ test/select-relevant.test.js — 'test failed'
   → Error [MODULE_NOT_FOUND]: Cannot find module '../api/_lib/select.js' (and ../api/_lib/classify.js,
     ../api/feed.js) — i.e. the units the contract requires are not implemented yet.
ℹ tests 3  ℹ pass 0  ℹ fail 3
```

Playwright (L5) collects cleanly (`npx playwright test feed-api --list` → 2 tests). The
`getFeed() sources from /api/feed` test is red-by-design until the client boundary is migrated; the
key-safety test is a guard expected to stay green.

**Post-implementation note (2026-06-21):** moving the data layer to `/api/feed` obsoleted the 5
client-side `getFeed` data-layer tests in `tests/community-feed.spec.js` (they stubbed
`queryRelayStatus`/`getTagItems`/`fetchMetadata`, seams `getFeed` no longer calls). With the user's
approval those 5 were **removed** (a documentation comment marks the spot); their coverage is now the
`node --test` suite + `tests/feed-api.spec.js`. See the story's `## Deviations`.
