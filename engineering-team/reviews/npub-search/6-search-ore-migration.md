# Review: npub-search #6 — Search → ORE migration

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-08-05
**Story:** `engineering-team/stories/npub-search/6-search-ore-migration.md` (Approved with O1–O4 PO determinations)
**ADR:** `engineering-team/decisions/0045-search-ore-migration.md` (Accepted)
**Test plan:** `engineering-team/stories/npub-search/6-search-ore-migration.test-plan.md`
**Diff audited:** implementation `7476f76..f03c598` (`public/index.html` +59/−60); full story chain `60177ba..a706e5c` for records context.

## Quality gates (run by reviewer, not trusted)

- [x] `npx playwright test` — **156/156 pass** (1.0m), clean run: re-pinned T15–T27b
      red→green, re-pointed T12/T34 green, stories #1/#4/#5 suites and all other epics
      green. (The single `community-feed` flake seen once during Implementation did not
      recur; it passes in isolation and in-spec.)
- [x] `node --test test/*.test.js` — **106/107**; sole failure is the pre-existing
      `builder-parity` tapestry-checkout drift (dispositioned in reviews #2 and #4).
- [x] _Lint / typecheck / build: not configured — skipped._

## Spec adherence

- [x] **Backend swap, surface intact** — T15–T27b pin the panel behaviors on the ORE
      backend; T1–T14 pin the untouched identity path; `page.__meiliCalls === 0` (T16)
      pins "no meili-proxy calls remain" structurally, suite-wide.
- [x] **Metadata joined client-side** over the wide relay set (O1): `fetchSearchProfilesBatch`
      queries `[...RELAYS, ...PROFILE_RELAYS]`, one batched authors filter per relay;
      profile-less results render per story-#1 rules via `noProfile` (T27b, verbatim ⚠️ copy).
- [x] **Score parity via the rank batch** (O4): chips = `Math.round(rank * 100)` from
      `fetchHouseTrustScores(pubkeys, povPubkey)` — same function, cache, and conversion
      as the grids; the fused search rank is never displayed (T17's non-monotonic chips).
- [x] **Trust order without re-sort:** rows render in served order (`for (const hex of
      pubkeys)` over the response array); the re-sort and `limit=24` headroom are deleted
      (T17, T19).
- [x] **POV seam preserved:** `runFreetextSearch(query, seq, povPubkey = HOUSE_POV.pubkey)`
      threads `povPubkey` into both the search body and the rank batch.
- [x] **Unavailability with identity prompt** (O2): new copy names npub, 64-character hex
      pubkey, and nprofile (T24); metadata/rank failures degrade rows instead (T26 pins
      rank-failure → chipless, not unavailable).
- [x] **One ORE host** (O3): `ORE_HOST` derives both endpoints; T16 asserts both request
      URLs on `brainstormserver.nosfabrica.com`. The story's commit-message requirement is
      satisfied — `f03c598`'s body carries the explicit NOTE that story #4's shipped
      `/rank/pubkeys` call moves off `api.brainstorm.world`, with the mirror noted in the
      constant comment.

## ADR adherence

- [x] Option A pipeline exactly: sequential search → `Promise.all(join, ranks)` → single
      render; `seq !== _searchSeq` checked after every await; abort scaffolding untouched
      and applied to the search POST; join/rank settle idle on dismissal per the ADR.
- [x] Deletions as specified: `SEARCH_API`, meili envelope handling, povResolution guard,
      `HOUSE_POV.expectedPovSuffix` (grep-verified no stale references).
- [x] `fetchSearchProfilesBatch` per Decision 3: newest-wins `_ts` comparison (an entry
      without `_ts` is overwritten — relay data authoritative), no negative caching,
      per-relay `.catch` so one bad relay never sinks the join; `limit: pubkeys.length*4`
      mirrors the story-#1 per-pubkey heuristic.
- [x] No new dependencies; all-client; `fetchSearchProfile` (identity path) untouched.

## Concept-graph integrity

- [x] No concept definitions touched; no firmware reinstall required.

## Things tests can't catch

- [x] Injection: profile fields render through `makeMemberCard`'s `escHtml`/`safePicUrl`
      path; the chip value passes through `Math.round`; `query` travels in a JSON body
      (no URL interpolation — the review-#2 URI-encoding note is moot by construction).
- [x] Defensive hex filter on `results[].pubkey` before any relay query or cache write.
- [x] Race behavior: stale guard after each of the three awaits; a superseded slow search
      returns silently (T25); the rank batch usefully warms the shared cache even when
      superseded.
- [x] No secrets; no debug logging (the deleted `console.warn` was the retired guard);
      no commented-out code.

## Findings

### Blocking

None.

### Non-blocking

1. **`public/index.html` (`runFreetextSearch`)** — duplicate pubkeys in an ORE response
   would render duplicate rows. Not observed in any probe and not in the ORE-05 contract;
   a one-line dedup if it ever appears in the wild.
2. **Story #3 caveat widens (carried forward):** `_houseScoreCache` is pubkey-keyed with
   POV implicit; after this story it feeds search chips *and* grid chips *and* grid
   ordering. A POV switch must clear/re-key it or every trust surface serves the previous
   perspective's numbers.
3. **Latency profile changed:** time-to-rows is now bounded by the slowest wide-set relay
   when a result pubkey has no kind-0 anywhere (~6 s worst case vs the meili path's single
   HTTP round trip). Accepted by ADR 0045; noted so a future "search feels slower" report
   has its explanation on file.
4. **`test/builder-parity.test.js`** — pre-existing environmental failure, unchanged
   disposition (intake recommendation stands from review #2).

## Verdict

**PASS** — the diff implements every story AC (including all four PO determinations), the
ADR 0045 pipeline, and the re-pinned test plan; reviewer-run gates are green with only the
known pre-existing environmental unit failure. The convergence goal is structurally
complete: search rows, member-card chips, and grid ordering now share one engine, one host,
and one POV parameter.
