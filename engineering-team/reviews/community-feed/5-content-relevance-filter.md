# Review: Story 5 — Content-relevance filter (server-side, AI-assisted)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-22
**Diff:** `git diff 950b37c..HEAD` (story #5 commits f9c0ab5, 7758b30, 3789dc9, fd5c791; ADR 6ec156d/adfd2b7; tests 7f848fe)
**Story:** `engineering-team/stories/community-feed/5-content-relevance-filter.md`
**ADR:** `engineering-team/decisions/0033-content-relevance-backend.md`
**Test plan:** `engineering-team/stories/community-feed/5-content-relevance-filter.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm test` (node --test + Playwright) — **PASS**: `tests 18 / pass 18 / fail 0`, then `44 passed`.
- [x] `npm run test:playwright` — covered by the above (44 passed).
- [x] _Lint not configured — skipped._
- [x] _Typecheck not configured — skipped._
- [x] _Build not configured — skipped._
- [x] Secrets scan clean — only a doc-comment example (`eval/relevance.eval.js:3`) and the negative
  assertion in `tests/feed-api.spec.js:33`; no real keys committed; `.env.local` gitignored. Keys read
  only from `process.env` (`api/feed.js:89-90`).
- [x] No debug logging in shipped source (`api/`, `public/lib/`).

## Spec adherence (acceptance criteria → tests)
- [x] AC-1 server-side path / key never in client — `tests/feed-api.spec.js` (getFeed→/api/feed + key-absent guard) + `test/feed-handler.test.js` (contract). Key read server-side only.
- [x] AC-2 off-topic excluded — `test/select-relevant.test.js` (dog post dropped).
- [x] AC-3 adjacent included — `test/select-relevant.test.js` (lightning kept; max-of-three).
- [x] AC-4 depth-neutral — `test/select-relevant.test.js` (casual + technical both kept) + opt-in eval.
- [x] AC-5 judge-once / cache reuse — `test/classify-notes.test.js` (hit skips model; miss persists once).
- [x] AC-6 synchronous / no unjudged note — `test/select-relevant.test.js` (no-score excluded) + `test/feed-handler.test.js` (unjudged never returned).
- [x] AC-7 graceful fallback — `test/classify-notes.test.js` (throw→pass-through, not cached) + `test/feed-handler.test.js` (fallback feed unfiltered).
- [x] AC-8 golden verdicts — `eval/relevance.eval.js` (opt-in, real Haiku) — appropriately out of `npm test`.
- [x] AC-9 three scores persisted / max≥threshold — `test/classify-notes.test.js` + `test/select-relevant.test.js`.
- [x] 5 obsolete Story-1 client-side `getFeed` tests removed with user approval; coverage relocated; documented (spec comment, story `## Deviations`, test plan). Verified no regression — all other Story-1/3/4 tests green.

## ADR adherence
- [x] Files match ADR implementation notes: `api/feed.js` (`buildFeedPayload` + `handler`), `api/_lib/{select,classify,relay}.js`, shared `public/lib/membership.js`, client `getFeed()`→`fetch('/api/feed')`.
- [x] Layering respected: pure orchestrator with injected deps (unit-tested) vs. real-dep handler wiring.
- [x] Dependencies authorized by the amended ADR: `@anthropic-ai/sdk`, `@upstash/redis` (init from `KV_REST_API_*`), `nostr-tools`→deps. No lint/build tooling added; `node --test` is built-in.
- [x] **Documented deviations** (story `## Deviations`) — acceptable, rationale sound:
  - shared module = `buildMemberSets` only (not `getTagItems`, which is env-specific I/O);
  - relay fetch via Node global `WebSocket` (not SimplePool);
  - payload carries `memberNames` + `relayStatus` (handler) to keep the render layer unchanged;
  - `FEED_CANDIDATE_LIMIT` env knob (default 500);
  - augment relay primal→damus (interim; epic-level open question owns the durable fix).
- [ ] **BLOCKING — undocumented ADR deviation:** classification is **sequential**, not parallel. See Findings.

## Concept-graph integrity
- [x] No concepts touched; no firmware reinstall (ADR confirms). No `kind:pubkey:slug` handles introduced. Concept Graph API not required.

## Things tests can't catch
- [x] No secrets, no debug logging, no commented-out code (the removed-tests block is a deliberate documentation comment).
- [x] Error paths: classifier failure → `PASS_THROUGH` (not cached); handler wraps in try/catch → 500 with empty contract; `anthropic` null when key absent → classifyOne throws → fallback. All graceful.
- [x] Security: AI key never reaches client (server-only; guarded by test); feed content is already-public relay data.
- [ ] **Concurrency / cold-start:** the ADR's stated mitigation is missing — see Findings.

## House rules check
- [x] Concept Graph API authority respected (n/a here).
- [x] No new lint/typecheck/build tooling without an ADR.

## Findings

### Blocking
1. **`api/_lib/classify.js:15-26`** — `classifyNotes` classifies cache-misses **sequentially** (`for...of`
   with `await classifyOne` inside), but **ADR 0033 explicitly requires parallel classification with a
   concurrency cap** (ADR lines 71, 167-169) and makes its cold-start risk acceptance *contingent* on it:
   *"the first load classifies up to `CANDIDATE_LIMIT` (~500) notes … bounded by the relay cap and
   **parallelized**. Mitigate via the concurrency cap."* As built, a cold-cache load at the production
   default (`CANDIDATE_LIMIT=500`) serializes up to 500 Haiku calls (~minutes) — well past any Vercel
   function timeout — so the **first production feed load would time out**. Preview only validated a
   small, gradually-warmed cache (`FEED_CANDIDATE_LIMIT` set low), so this path is untested in practice.
   **Asked change:** classify cache-misses with **bounded concurrency** (a cap of ~5, per the ADR),
   preserving order-independence and the existing cache/fallback semantics. Contained to
   `api/_lib/classify.js`; existing `test/classify-notes.test.js` should still pass (consider adding a
   cap assertion, optional).

### Non-blocking
1. **`api/_lib/relay.js:11-22`** — `queryRelayStatus` has no `ws.onclose` handler (the browser original
   did). If a relay closes without EOSE, resolution waits for the full timeout rather than resolving on
   close. Minor added latency on a misbehaving relay; functionally correct. Optional: resolve on close.
2. **`api/_lib/classify.js:31`** — model id is the alias `claude-haiku-4-5`; the project's pinned latest
   is `claude-haiku-4-5-20251001`. Alias is fine; optionally pin for reproducibility of eval runs.
3. **Live `/api/feed` handler is not covered by `npm test`** (real relays/Haiku/KV) — *by design* (test
   plan "Approach"), and corroborated by the user's preview validation (KV writes, feed render, damus
   filling the nos.lol write-gap all confirmed). Noted as an accepted coverage boundary, not a defect.

## Verdict
**CHANGES_REQUESTED** — one blocking item: implement the ADR-mandated bounded-concurrency parallel
classification in `api/_lib/classify.js` (cold-start timeout risk at the production `CANDIDATE_LIMIT`
default). Everything else is solid: all acceptance criteria covered and green, ADR otherwise conformed
to (deviations documented), no secrets/debug, clean fallback and security posture. Re-review should be
quick once the classification loop is bounded-parallel.
