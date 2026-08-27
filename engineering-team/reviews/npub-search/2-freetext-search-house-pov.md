# Review: npub-search #2 — Free-text profile search, house POV

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-08-02
**Story:** `engineering-team/stories/npub-search/2-freetext-search-house-pov.md`
**ADR:** `engineering-team/decisions/0042-freetext-search-house-pov.md` (Accepted)
**Test plan:** `engineering-team/stories/npub-search/2-freetext-search-house-pov.test-plan.md`
**Diff:** `206f1a0..6ba9ef1` (ADR `7888d52` → red tests `4489679` → implementation `6ba9ef1`); code diff audited: `4489679..6ba9ef1` (+146/−7, `public/index.html` + a 4-line test-mechanics fix in `tests/npub-search.spec.js`)

## Quality gates (run by reviewer, not trusted)

- [x] `npx playwright test` (full suite, all specs) — **148/148 pass** (50.6s), including
      story-#2 T15–T27, story-#1 T1–T14 (amended T12), and every other epic's spec.
- [x] `node --test test/*.test.js` — **106/107**; the 1 failure is `test/builder-parity.test.js`,
      a `MODULE_NOT_FOUND` for `tapestry/src/lib/event-tagging/builders.js` — that path no
      longer exists in the externally-updated read-only `tapestry/` checkout. Fails identically
      with this diff stashed (verified during Implementation; cause re-confirmed here).
      **Pre-existing environmental drift, unrelated to this story** — see non-blocking #4.
- [x] _Lint / typecheck / build: not configured — skipped (house rules)._

## Spec adherence

- [x] Every acceptance criterion has a passing test (coverage map T15–T27 in the test plan):
      fall-through fork (T16), ranked 6-row panel with displayed scores (T17), encouragement
      copy (T20), vouch parity + sibling isolation (T21), loading/dismissal (T22), no-matches
      (T23), unavailable + retype-retry (T24), below-minimum / live 2-char trigger (T15),
      page integrity (T22 + amended T12). ADR mechanics additionally covered: stale-response
      race (T25), POV fallback warn (T26), absent-only cache seeding (T27), score-less rows
      (T19), per-row badges (T18).
- [x] No criterion silently dropped. The story-#1 dead-end hint is retired exactly as the
      story specifies; its old T12 assertion was re-pinned in the Test Design phase (recorded
      in both test plans), not silently.
- [x] No behavior beyond the story: diff adds config, one search routine, a score chip,
      three panel states, and the length fork. The hint-copy change (`index.html:1656`) is
      the below-minimum "gentle prompt" the story asks for.

## ADR adherence

- [x] Files and shapes match the implementation notes: `SEARCH_API` + `HOUSE_POV`
      (`index.html:1948-1956`, both fields, swap-runbook comment); `runFreetextSearch(query,
      seq, povPubkey = HOUSE_POV.pubkey)` (`:2813-2905`) — POV-as-parameter seam preserved
      for story #3; request contract `q/limit=24/offset=0/wotPov=user/userPubkey` verbatim
      (`:2836`); client-side rank re-sort, stable, score-less last, cut to 6 (`:2869-2870`);
      absent-only `_metaCache` seeding, `_metaFetched` untouched (`:2857-2864`); fallback
      guard on both `povResolution.fellBackToHouse` and `expectedPovSuffix` mismatch with
      render-anyway semantics (`:2846-2849`); `hideMemberSearchPanel` aborts in-flight
      requests (`:2734`); trust-score chip via `options.trustScore` (`:2548-2552`, `:2568`).
- [x] Layering: all-client, no server code, no new relays; `tagHits`/`nip05Result`/
      `estimatedTotalHits` ignored per Out of scope.
- [x] No new dependencies (native `fetch` + `AbortController` only).

## Concept-graph integrity

- [x] No concept definitions touched; no firmware reinstall required (matches ADR).
- [x] No handles introduced; membership/vouch machinery reused byte-identical.

## Things tests can't catch

- [x] No secrets: `HOUSE_POV.pubkey` and the suffix are public Nostr identifiers.
- [x] `console.warn` at `:2848` is not leftover debug — it *is* the ADR-specified fallback
      guard (T26 asserts it).
- [x] XSS: all hit-derived strings render through `makeMemberCard`'s existing `escHtml`
      path; avatar URLs through `safePicUrl`; the score renders through `Number()`.
      `query` is `encodeURIComponent`-ed into the URL.
- [x] Races: `seq !== _searchSeq` checked after every await; aborted/superseded requests
      return before painting; below-min and dismissal paths abort in-flight fetches.
- [x] Error paths: non-OK, `success:false`, and network throw all land in the unavailable
      state; malformed `hits` guarded by `Array.isArray`.
- [x] No commented-out code; comments state constraints, not narration.

## Findings

### Blocking

None.

### Non-blocking

1. **`public/index.html:2836`** — `povPubkey` is interpolated into the URL without
   `encodeURIComponent`. Safe today (config-controlled hex constant), but story #3 will pass
   member-supplied pubkeys through this parameter — encode it then (or now, one-word change).
2. **`public/index.html:2550`** — a hit whose `wot_rank_<suffix>` is `NaN` passes the
   `typeof === 'number'` gate and would render "🏅 NaN" (and sort arbitrarily). Not
   producible from the documented contract (integers observed); cosmetic hardening only.
3. **`public/index.html:2766-2778`** — the identity branch doesn't abort an in-flight
   free-text fetch (the `seq` guard already prevents any stale paint; the socket just
   completes idle). Harmless; tidy-up candidate if `runFreetextSearch` grows.
4. **`test/builder-parity.test.js`** — pre-existing failure from `tapestry/` checkout drift
   (its parity target module vanished upstream). Recommend an `_intake.md` entry to either
   re-pin the tapestry checkout or retire/re-point the parity test. Not this story's scope.
5. **`tests/npub-search.spec.js:695-698`** — the Implementer adjusted T22's click-outside
   target (`h2` → `.telegram-row`) because the original target sits under the open overlay
   and Playwright correctly refuses the intercepted click. Assertions unchanged; documented
   in the commit message. Legitimate test-mechanics fix, noted for transparency.

## Verdict

**PASS** — the diff matches the story's nine acceptance criteria, the ADR's design
(including the config-only swap seam and the POV audit guard), and the test plan; the
reviewer-run gates are green except one verified-pre-existing environmental failure outside
the story's scope.
