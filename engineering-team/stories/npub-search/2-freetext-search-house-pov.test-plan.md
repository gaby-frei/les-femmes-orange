# Test Plan — npub-search #2: free-text search, house POV

**Story:** `engineering-team/stories/npub-search/2-freetext-search-house-pov.md`
**ADR:** `engineering-team/decisions/0042-freetext-search-house-pov.md`
**API reference:** `docs/meili-search-proxy-contract.md`
**Date:** 2026-08-02
**Spec:** `tests/npub-search.spec.js` — story-#2 cases appended as a second `describe` block
(per ADR implementation notes), reusing the story-#1 `openMembers` harness. No unit layer: all
new logic lives in the page's inline script and is exercised end-to-end.

## Approach

Free-text search reaches exactly one new network seam: `GET <SEARCH_API>?q=…` to the
brainstorm meili proxy. Every test stubs it with `page.route('**/api/search/profiles/meili*')`,
recording each request's query params node-side and serving fixture responses shaped per
`docs/meili-search-proxy-contract.md` (envelope: `success`, `povSuffix`, `povResolution`,
`hits`, …; hits carry `wot_rank_39945424` / `wot_followers_39945424` columns). CORS header
included on fulfills (cross-origin fetch; T4b precedent).

Fixtures are served **deliberately in followers-desc order with rank disagreeing** (the P3/P14
reality: served order is a mutable server pref) — that is what lets the specs prove the
client-side re-sort rather than accidentally passing on a pre-sorted fixture.

Relay/vouch/membership stubs are unchanged from story #1 (`queryRelay`, `publishEventToRelay`,
`LFOSigner`, synthetic tag items: SEED→ME verified, PENDING self-applied).

## Seam contract pinned by this spec (from ADR 0042)

- **Request:** `q=<input>`, `limit=24`, `offset=0`, `wotPov=user`,
  `userPubkey=6db8a13f…` (HOUSE_POV placeholder). Fired live at ≥ 2 chars on the story-#1
  debounce, no Enter; never below 2; never for input that decodes as an identity.
- **Rendering:** up to 6 rows in `#member-search-panel`, each
  `.member-card.candidate` (story-#1 anatomy + badge rules) plus a **`.candidate-trust-score`**
  element whose text contains the row's `wot_rank_<povSuffix>` integer. Order = rank desc
  (client re-sort); score-less hits last, no score element.
- **New panel states** (class names pinned here, copy left to the Implementer except where
  noted): `.member-search-empty` (no matches), `.member-search-unavailable` (backend
  failure), `.member-search-footnote` (identity-encouragement copy — must name npub, hex,
  and nprofile) under results and in the empty state.
- **Guard:** `povResolution.fellBackToHouse === true` or `povSuffix ≠ 39945424` →
  `console.warn` mentioning "POV"; rows still render from the returned suffix.
- **Caches:** hits seed `_metaCache` only when absent; `_metaFetched` untouched.
- **Races:** only the latest query may paint (`_searchSeq` + abort).

## Cases

| # | Case | Story AC / ADR point |
|---|---|---|
| T15 | 1-char input: no search request ever; 2-char input: request fires live (no Enter) | AC below-minimum / live trigger |
| T16 | Fall-through fork: `liz` → exactly one request with the full pinned param set, dead-end hint gone; `npub…` → story-#1 single-candidate flow, **zero** search requests | AC fall-through; ADR request contract |
| T17 | 8 scored hits served followers-desc → exactly 6 rows, rank-desc [100, 92, 75, 68, 53, 30], each row's `.candidate-trust-score` shows its rank; the late-served rank-100 hit is row 1; the two lowest-rank hits are cut | AC ranked panel; ADR re-sort + cut |
| T18 | Rows for ME / PENDING / outsider carry ✓ Member (no vouch) / Pending (vouch) / Not a member (vouch) | AC row anatomy parity |
| T19 | Score-less hit sorts last and renders without a score element | ADR score-less rule |
| T20 | Encouragement footnote (npub + hex + nprofile named) beneath results and in the empty state | AC encouragement copy |
| T21 | Vouch on row 2 of 3: exact story-#1 wire shape for that row's pubkey; badge flips ✓ Member; sibling rows' DOM untouched; verified grid gains the member | AC vouch parity |
| T22 | Slow response → loading state first (never blank); rows render; Escape / clear / click-outside each dismiss; panel is an absolute overlay; verified grid byte-identical after the whole interaction | AC loading & dismissal; AC page integrity |
| T23 | Zero hits → `.member-search-empty` visible (not blank, not the identity dead-end hint) | AC no matches |
| T24 | 503 → `.member-search-unavailable`; retyping with the backend healthy again → results (retry is just typing) | AC search unavailable |
| T25 | Slow query then fast retype → only the second query's rows paint; the stale response never overwrites them | ADR `_searchSeq`/abort |
| T26 | Response with `fellBackToHouse: true` + foreign `povSuffix` → `console.warn` mentioning POV; rows still render with the returned-namespace scores | ADR fallback guard |
| T27 | Hit pubkeys seeded into `_metaCache` when absent; a pre-existing `_metaCache` entry is not overwritten by a search hit | ADR meta seeding |

**Amendment to story #1:** T12 ("non-identity input → inline hint, zero fan-out") asserted
the dead-end hint that this story removes by design. Re-pinned as **below-minimum
integrity**: 1-char input → zero relay fan-out, zero search requests, no candidates, grids
untouched (hint presence no longer asserted). Green today, stays green after #2. Recorded in
the story-#1 test plan's amendments.

## Test infrastructure

- Playwright via `playwright.config.js` (self-booting `server.js`, PORT-aware). No new
  frameworks; no concept-graph dependency (`localhost:8877` not required).
- Search API stub: `page.route('**/api/search/profiles/meili*')` — fixtures in-spec
  (`mkHit`, `searchResponse`, `stubSearch` helpers).
- Live `tags.brainstorm.world` is **never** contacted by the suite.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

(Full suite: `npm test`.)

## Verification

T15–T27 fail against the current build (no `SEARCH_API` fetch, no multi-row rendering, no
new panel states); T1–T11, T13, T14 and amended T12 pass. Confirmed 2026-08-02 at commit
`7888d52` (`npx playwright test tests/npub-search.spec.js`):

```
13 failed
  › free-text search … › one char never queries the backend; two chars fire live without Enter
  › free-text search … › fall-through fork: free text sends the pinned request contract; identities never touch the backend
  › free-text search … › six rows, highest trust first by the response povSuffix, regardless of served order
  › free-text search … › per-row membership: ✓ Member (no vouch) / Pending (vouch) / Not a member (vouch)
  › free-text search … › a score-less hit sorts last and renders without a score element
  › free-text search … › identity-search encouragement copy renders beneath results and in the empty state
  › free-text search … › vouching one row publishes the story-#1 wire shape for that pubkey; sibling rows untouched
  › free-text search … › loading state while in flight; Escape, clear, and click-outside dismiss; grid byte-identical
  › free-text search … › no matches → a real empty state, not a blank panel and not the identity dead-end hint
  › free-text search … › backend failure → unavailable state; retyping when healthy retries; nothing breaks
  › free-text search … › stale responses never paint: a slow query is superseded by a fast retype
  › free-text search … › POV fallback in the response → console.warn mentioning POV; rows still render from the returned namespace
  › free-text search … › hits seed _metaCache when absent; existing cache entries are never overwritten
15 passed (1.8m)
```

Failure modes are behavioral (zero search-API calls recorded; `.member-card.candidate`
count 0; missing panel-state elements) — not syntax or import errors.
