# Review: Story 10 — Feed header semantics ("active content taggers")

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-12
**Diff:** implementation commit `a57f90b` (vs test-design commit)
**Story / ADR / Plan:** `10-feed-header-semantics.md` / ADR 0038 / `10-feed-header-semantics.test-plan.md`

## Quality gates (run by reviewer)
- [x] `npm run test:unit` — **98/98** (re-run independently).
- [x] `npm test` incl. Playwright — **90/90**, including 4/4 `feed-tagger-count.spec.js` (run this session, post-fix).
- [x] Live smoke: 31 tagged notes → **1 distinct active tagger** (`6db8a13f…`) across all four channels — so production renders the singular copy "1 active content tagger" on day one; both copy paths are exercised (singular live, plural by test).

## Spec adherence
- [x] All 9 ACs map to passing tests (payload appliers-only/disputer-excluded/multi-applier;
  merge union by pubkey; feed-level presence + P1-absence; e2e: dedupe across notes+tags, live
  per-channel recompute down to zero, singular at 1, always-rendered zero state, first line
  unchanged).
- [x] PO decisions honored: members/posts line untouched (copy + both counting branches);
  zero state always renders; appliers only.
- [x] Descriptive naming per PO direction: `contributorCount`, `activeTaggerCount` — no x/y/z
  (`public/index.html:2208–2223`); the pre-existing `count` variable was renamed in passing.

## ADR adherence
- [x] Exactly the ADR's four touch points: `tagged.js` step-5 `taggers` (from the resolver's
  applications bucket — disputes structurally excluded), `merge.js` pubkey union mirroring
  channels, `feed.js` additive emit-when-non-empty, `renderFeedNotes()` recompute over `visible`.
- [x] No other files changed; no new dependencies; vendored files untouched.
- [x] One unplanned one-character-class fix: `\n` separators in the header template — the two
  subtitle divs otherwise concatenate in `textContent` ("2 posts0 active…"), breaking story-6's
  word-boundary assertion. Fixed in markup rather than weakening the old test; story-6's spec runs
  green unmodified. Correct call.

## Things tests can't catch
- [x] Header `innerHTML` interpolations are numbers or length-derived strings only — no
  relay-sourced text enters this template; XSS surface unchanged.
- [x] No debug residue, no secrets; payload growth is bounded (≤ pool × distinct-tagger pubkeys,
  trivial at 100 notes).

## Findings
### Blocking — none.
### Non-blocking
1. `taggers` and `taggedWith` now both ride every (tag, note) candidate; if candidate volume ever
   grows large, per-tag shared references could be revisited — noted, irrelevant at current scale.

## Verdict
**PASS.** All 188 tests green under reviewer runs; ACs, ADR, and PO decisions fully honored; the
whitespace fix is documented and behavior-preserving.
