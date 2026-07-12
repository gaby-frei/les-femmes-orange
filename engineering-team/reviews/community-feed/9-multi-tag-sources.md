# Review: Story 9 — Multi-tag sources (Bitcoin, Nostr, Ask LFO channel)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-12
**Diff:** `git diff 79a4fdd..HEAD` (implementation commit `39fd845`; base = test-design commit)
**Story:** `engineering-team/stories/community-feed/9-multi-tag-sources.md`
**ADR:** `engineering-team/decisions/0037-multi-tag-sources.md`
**Test plan:** `engineering-team/stories/community-feed/9-multi-tag-sources.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **94/94 pass**, including the 13 migrated #8 gates re-armed under the
  `tags`-array signature and the 7 new multi-tag tests.
- [x] `npm test` (incl. Playwright) — **86/86 pass**, including all 6 story-9 e2e tests.
- [x] Live smoke (recorded during implementation, 2026-07-12): 35 (tag, note) candidates → 31 merged
  notes; per-channel {ask-lfo 6, bitcoin 5, nostr 13, lfo 11}; 4 real multi-tag unions with both
  pills; `relayOk: true`.
- [x] _Lint / typecheck / build not configured — skipped (intentionally JS-without-build)._

## Spec adherence

- [x] Every acceptance criterion maps to a passing test (coverage map in the plan): per-tag channel
  assignment, multi-tag union (once / both channels / both pills / both vias), tag+Provider-1 union,
  ask-lfo exclusivity, silent-tag isolation, per-tag gate spot-checks, four-pill banner with #6
  semantics, uniform degradation, multi-pill independence, contract stability.
- [x] The uniform-degradation PO decision is enforced by construction (the generic `.feed-channel`
  disable loop) **and** pinned by e2e test.
- [x] **In-phase scope addition, ratified by the requester (2026-07-12):** the tagging relay now
  appears in the "Feed Source Relays" panel with the standard status-dot semantics
  (`public/index.html:1550–1557`). User-directed during implementation, display-only (one config
  entry; dots were already server-driven via `relayStatus` since #8), covered by a new e2e test and
  a test-plan row. Recorded here as ratified scope, not creep.
- [x] No other behavior beyond the story.

## ADR adherence

- [x] Decision 1: `EVENT_TAGS` config matches the ADR literally (`api/feed.js:44–49`) — per-tag
  `channels` arrays, `authorPubkey` per entry, four entries.
- [x] Decision 2: batched fan-out implemented as specified (`api/_lib/tagged.js`): one multi-`#a`
  headers REQ + one elements REQ in parallel; headers partitioned by their `a` pointer; ONE
  assertions REQ over all discovered coordinates; per-tag in-memory resolution via the vendored
  `groupTaggingsByTarget`; one union bodies fetch (tagging relay ∪ noteRelays, any-ok); one candidate
  per (tag, note). The wire contract is pinned by test (`test/multi-tag.test.js`).
- [x] Decision 3: the Ask LFO pill is one static button (`public/index.html:1415`); zero JS changes;
  `CHANNELS` (`api/feed.js:76`) untouched → ask-lfo exclusivity holds by construction.
- [x] The review-0036 finding about the stringly `:null` guard was addressed as the ADR suggested:
  header coords now filter on `tagVal(h,'d') != null` (`tagged.js:93–95`).
- [x] No changes to `merge.js`, `ta.js`, vendored files (verified byte-identical again), `select.js`,
  or the pill renderer — exactly the ADR's "no changes" list.
- [x] No new dependencies; no hardcoded TA (grep clean; the only pinned pubkey is the shared tag
  author, per the story's config).

## Concept-graph integrity

- [x] Handles composed via the vendored composers (`tagElementAddr`, `conceptTaggingWithSpecificTag`)
  — `kind:pubkey:slug` form throughout; TA always a runtime parameter.
- [x] No concept definitions changed → **no firmware reinstall**.

## Things tests can't catch

- [x] No secrets, no debug logging, no commented-out code (grep clean).
- [x] Shared-reference safety through the merge: candidates copy `tag.channels`
  (`tagged.js:132`) and the merge copies on first occurrence, so the module-level `EVENT_TAGS`
  config and the per-tag shared `taggedWith` arrays are never mutated across requests.
- [x] Error paths preserved: never-throws contract, empty-`tags` guard, criticality split
  (headers/assertions/bodies critical; elements → per-tag slug fallback), zero-header and
  zero-admissible early returns with `relayOk: true`.
- [x] A header carrying an `a` pointer to an unconfigured tag is dropped at partition time; an
  assertion for an undiscovered header skips silently in the by-tag resolver — both consistent with
  #8's sourcing-time exclusion posture.

## Findings

### Blocking
None.

### Non-blocking
1. **`api/_lib/tagged.js:70–74`** — the elements REQ is an `authors × #d` cross-product; with
   multiple distinct tag authors it could over-fetch same-slug elements by the other author. Harmless
   today (single author) and the per-tag `metaFor` filter re-partitions exactly; noted for when the
   config diversifies.
2. **`api/_lib/tagged.js:82`** — header→tag partition takes the header's **first** `a` tag (`tagVal`),
   mirroring the vendored resolver's own `.find()` semantics; a nonconforming multi-`a` header would
   partition by tag order. Same class as #8's documented `.find()` edge; recognized, not mitigated.
3. Review-0036's remaining non-blocking notes (handler `r` shadow, pill `aria-controls`, TA cache
   cold-start race) are unchanged and still open as polish items.

## Verdict

**PASS.** The diff matches the story, ADR 0037, and the test plan; all 180 tests pass under the
reviewer's own runs; the live pipeline sources all four production tags with correct per-channel
attribution and multi-tag unions; #8's gates are fully re-armed under the new signature; the
in-phase panel addition is user-ratified, tested, and documented.
