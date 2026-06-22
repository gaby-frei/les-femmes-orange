# Review: Story 5 — Content-relevance filter (server-side, AI-assisted)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-22
**Diff:** `git diff 950b37c..HEAD` (story #5 commits f9c0ab5, 7758b30, 3789dc9, fd5c791; ADR 6ec156d/adfd2b7; tests 7f848fe; fix 35f042a)

> **Re-review 2026-06-22:** the single blocking item (sequential classification) was fixed in
> `35f042a` — `classifyNotes` now uses a `CONCURRENCY=5` worker pool with identical cache/persist/
> fallback semantics, plus a regression test. Verdict updated **CHANGES_REQUESTED → PASS**.
**Story:** `engineering-team/stories/community-feed/5-content-relevance-filter.md`
**ADR:** `engineering-team/decisions/0033-content-relevance-backend.md`
**Test plan:** `engineering-team/stories/community-feed/5-content-relevance-filter.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm test` (node --test + Playwright) — **PASS**: `tests 19 / pass 19 / fail 0` (post-fix; +1 concurrency regression test), then `44 passed`.
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
- [x] **RESOLVED** (was blocking): classification is now **bounded-parallel** (`CONCURRENCY=5`), per ADR. See Findings.

## Concept-graph integrity
- [x] No concepts touched; no firmware reinstall (ADR confirms). No `kind:pubkey:slug` handles introduced. Concept Graph API not required.

## Things tests can't catch
- [x] No secrets, no debug logging, no commented-out code (the removed-tests block is a deliberate documentation comment).
- [x] Error paths: classifier failure → `PASS_THROUGH` (not cached); handler wraps in try/catch → 500 with empty contract; `anthropic` null when key absent → classifyOne throws → fallback. All graceful.
- [x] Security: AI key never reaches client (server-only; guarded by test); feed content is already-public relay data.
- [x] **Concurrency / cold-start:** ADR mitigation now present — bounded-parallel classification (cap 5).

## House rules check
- [x] Concept Graph API authority respected (n/a here).
- [x] No new lint/typecheck/build tooling without an ADR.

## Findings

### Blocking — RESOLVED in `35f042a`
1. ~~**`api/_lib/classify.js`** — `classifyNotes` classified cache-misses **sequentially**, but ADR 0033
   requires parallel classification with a concurrency cap (lines 71, 167-169) and pinned its cold-start
   risk acceptance to it; a cold cache at `CANDIDATE_LIMIT=500` would serialize ~500 Haiku calls and time
   out the first request.~~ **Fixed:** `classifyNotes` now drains cache-misses with a `CONCURRENCY=5`
   worker pool (`api/_lib/classify.js:15-48`) — a `scoreNote` helper keeps the cache/persist/fallback
   semantics identical, return order is irrelevant (feed sorts by recency), and a new regression test
   asserts peak in-flight is `>1` and `≤5`. Verified semantics-preserving and the empty-notes case (0
   workers → empty map). Logged as a missed deviation in the story.

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
**PASS** (re-review 2026-06-22, after fix `35f042a`).

The sole blocking item — sequential classification vs. the ADR-mandated bounded concurrency — is fixed:
`classifyNotes` now uses a `CONCURRENCY=5` worker pool with identical cache/persist/fallback semantics
and a regression test. Test gate green (19 unit + 44 Playwright). All acceptance criteria covered, ADR
conformed (remaining deviations documented in the story), no secrets/debug, graceful fallback and
sound security posture. The non-blocking notes (relay `onclose`, model alias, live handler outside
`npm test`) stand as accepted follow-ups, none gating.

Initial verdict (2026-06-22, commit fd5c791): **CHANGES_REQUESTED** — recorded above for the audit trail.
