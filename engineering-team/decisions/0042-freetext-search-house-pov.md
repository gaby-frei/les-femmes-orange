# ADR 0042: Free-text profile search — deployed ranked-search API, client-side trust ordering, house POV as a config constant

**Status:** Accepted (PO, 2026-08-02; ORE probe record consolidated 2026-08-05)
**Date:** 2026-08-01 (Updated and rewritten after successful ORE probe on 2026-08-05, see version history for the earlier probe table)
**Story:** `engineering-team/stories/npub-search/2-freetext-search-house-pov.md`

## Context

Story #2 converts story #1's non-identity dead end (the `!decoded` branch of
`runMemberSearch`) into free-text profile search: up to 6 candidate rows, ordered
highest-trust first with the numeric trust score shown, ranked from the perspective of a
**designated house npub** whose placeholder→LFO swap must be config-only. The identity fast
path is untouched.

**Concept graph:** API at `localhost:8877` unreachable at design time (as for ADR 0041). No
concept definitions change; no firmware impact. The LFO tag event, membership sets, and vouch
write path are reused unchanged.

**Candidate backends** (all live-probed during this phase; contract references:
`docs/meili-search-proxy-contract.md`, `docs/open-ranking-ore-algorithms.staging.json`, and
the [ORE probe record](#ore-probe-record) below):

- **Brainstorm meili proxy** (`GET tags.brainstorm.world/api/search/profiles/meili`,
  reference source `tapestry/src/api/search/profiles/meili/index.js:91-235`): client sends
  only `q`, `limit` (≤200), `offset`, `wotPov=house|user`, `userPubkey`. With
  `wotPov=user` the server resolves the pubkey's stored prefs → `rankAuthor` →
  `povSuffix` (first 8 hex chars), which names the score columns on each hit
  (`wot_rank_<povSuffix>`, `wot_followers_<povSuffix>`). No `rankAuthor` → silent fallback
  to the nosfabrica house POV; the deployed proxy reports resolution via a `povResolution`
  object. Sort/filter come from the resolved account's stored prefs, never from the client.
  CORS reflects arbitrary origins — direct browser calls work.
- **NIP-50** on `wss://tags.brainstorm.world/relay`: text search works and returns raw
  kind-0 events — no trust scores.
- **Open Ranking Engine (ORE)** — `POST /search/pubkeys` (`relevance` / `relevance-pov`)
  per the ORE-01/ORE-05 specs (`github.com/Open-Ranking/protocol`): `{query, algorithm?,
  pov?, limit?}` → `{results: [{pubkey, rank}], ttl}`. Wildcard CORS. See the probe record
  for live behavior.

**Constraints:** JS-without-build; all-client Members page (ADR 0041). The panel, candidate
row (`makeMemberCard` `'candidate'` mode), `publishVouch`, `getMemberSets`, `_searchSeq`
stale guard, and the 400 ms debounced controller exist from story #1 and must be reused, not
forked. Story #3 (personalized POV) will want the same search with a different POV pubkey.

## Options considered

### Option A — Brainstorm meili proxy, called directly from the client *(chosen)*

`fetch` with `wotPov=user&userPubkey=<house pubkey>`; read each row's score from
`wot_rank_<povSuffix>` using the response's own `povSuffix`.

Pros: profiles **and** house-POV scores in one round trip (every field a row renders plus
the score columns, in the same documents); CORS open, no proxy needed; the 6-suggestion /
≥2-char shape is brainstorm's own flow; POV is a request parameter, so the LFO swap and
story #3 are parameter changes; the `povResolution` echo makes POV resolution auditable
from the response.
Cons: runtime dependency on the deployment's HTTP API (scoped to free-text; identity path
stays relay-only); ranking correctness depends on the house account staying provisioned
server-side, with a *silent* fallback to nosfabrica's POV (mitigated: sub-decision 3);
served order follows the account's mutable stored sort pref, not necessarily trust
(mitigated: sub-decision 2).

### Option B — NIP-50 search on the relay

Pros: no HTTP dependency; reuses relay plumbing; returns the right profiles.
Cons: **no trust scores** — ranking would need per-candidate kind-30382 fetches from
`wss://nip85.nosfabrica.com` (a third relay) plus re-implementing the POV resolution the
proxy already owns. More moving parts for strictly less. Documented fallback if the HTTP
API's CORS ever closes.

### Option C — Our own serverless proxy (`api/search.js` beside `api/feed.js`)

Pros: shields the client from deployment API changes; a place to pin CORS.
Cons: adds surface and a hop for a call the browser already makes; breaks the Members
page's all-client pattern; ADR 0041 already rejected this shape. Revisit only if CORS closes.

### Option D — ORE `/search/pubkeys` with `relevance-pov`

`POST https://brainstormserver.nosfabrica.com/search/pubkeys` (also served at
`api.brainstorm.world`) with `{query, algorithm: 'relevance-pov', pov: <house hex>, limit}`.

Pros: the architecturally cleanest shape — POV as a per-request parameter (no stored-prefs
coupling, no silent-fallback hazard); one fused text-match × WoT rank, already
trust-ordered, so no client-side re-sort; published spec + OpenAPI contract; wildcard CORS;
fast (~250–450 ms, `ttl: 300`); **personalized ranking confirmed live for the placeholder
house POV** (probe of 2026-08-05, below).
Trade-offs: the response is `{pubkey, rank}` only — profile metadata for the rows requires
a second, batched kind-0 fetch; the ORE-05 response schema carries no echo of the resolved
observer, so which perspective served the ranks isn't verifiable from the response (Option
A's `povResolution` has no counterpart); the LFO target POV's behavior should be verified
once that account is provisioned. Migration path when adopted: contained inside
`runFreetextSearch` (swap the fetch + join metadata), POV-as-parameter seam unchanged.

## Decision

**Option A** — it satisfies every AC with a single call (profiles + scores + auditable POV
resolution in one response). **Option D is the planned successor**: ADR 0043 already adopts
ORE for the member-card batch scores on the explicit rationale that search converges on ORE
too, at which point chips, cards, and search rows share one source. The POV-as-parameter
seam below is deliberately shaped so the A→D migration touches only the inside of
`runFreetextSearch`.

Four sub-decisions:

1. **Trust score = the `rank` metric** (`wot_rank_<povSuffix>`, brainstorm's "Verification
   Score", 0–100). Displayed on each row and used as the ordering key. `followers` is
   ignored for ordering.
2. **Client-side re-sort with headroom.** Request `limit=24`, sort by `wot_rank_<povSuffix>`
   desc client-side (score-less hits last, in served order), take 6. Served order follows
   the designated account's stored sort pref — externally mutable — so "highest trust
   first" is made a property of our code, at zero extra request cost. (The placeholder
   account's pref is currently rank-desc, so served order already agrees; the re-sort is
   defense against pref drift, and equal-rank ties have no specified secondary order.)
3. **House POV is one config constant block** in `public/index.html`, beside `RELAYS`
   *(the block below is the story-#2 snapshot — `SEARCH_API`/`expectedPovSuffix` were
   deleted by ADR 0045 and the pubkey was replaced on 2026-08-18; see Amendments)*:

   ```js
   // House point of view for free-text search ranking (story #2, ADR 0042).
   // Swap to the official LFO account once provisioned — see swap runbook in the ADR.
   const SEARCH_API = 'https://tags.brainstorm.world/api/search/profiles/meili';
   const HOUSE_POV = {
     pubkey: '6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597', // placeholder: PO's account
     expectedPovSuffix: '39945424', // its delegated rank author's first 8 hex chars
   };
   ```

   The free-text routine takes the POV pubkey as a parameter defaulting to
   `HOUSE_POV.pubkey` (story #3 passes the member's pubkey). **Fallback guard:** warn when
   `povResolution.fellBackToHouse === true` *or* `povSuffix !==
   HOUSE_POV.expectedPovSuffix` — render normally (returned scores are real scores) but
   `console.warn`, converting the proxy's silent nosfabrica fallback into a detectable
   signal even if `povResolution` leaves the contract.
4. **Swap runbook (config-only).** *(Superseded 2026-08-18 — never executed; the house POV
   moved to a different account instead. Do not act on the prerequisites below; see
   Amendments.)* Prerequisites (external): (a) LFO pubkey `5f0d66ba…`
   registered as a brainstorm customer (self-serve sign-up); (b) an LFO-signed kind-10040
   delegating `30382:rank`; (c) deployment-side prefs for the LFO pubkey with `rankAuthor` —
   established by one sign-in to the brainstorm search UI as LFO after (b). Then the swap is
   editing `HOUSE_POV.pubkey` + `HOUSE_POV.expectedPovSuffix` — two strings, no logic.
   **Settings-panel checks for whichever account is house:** `rank` ticked in Available
   Trust Metrics (else its scores may stop refreshing on re-load while we display them);
   filters off unless intentional; Sort by → `rank` desc preferred (aligns the server-side
   cut with the metric we rank by; our re-sort remains the defense either way).

**Flow:** `runMemberSearch` keeps its decode-first fork. The `!decoded` branch becomes —
length < 2: gentle below-minimum prompt, never a request; length ≥ 2: loading state (reused),
one `fetch` (`q`, `limit=24`, `offset=0`, `wotPov=user`, `userPubkey=<POV>`) guarded by
`_searchSeq` + `AbortController`; re-sort/cut per sub-decision 2; membership status per hit
from cached `getMemberSets()`; rows via `makeMemberCard('candidate', …)` with a trust-score
element; identity-encouragement copy beneath results and in the empty state. Non-OK /
`success:false` / network failure → "search temporarily unavailable" (retyping retries;
identity path unaffected). Empty `hits` → empty state (also for `_searchTooBroad`; our copy,
not the server's `_notice`).

**Meta seeding:** each rendered hit becomes a kind-0-shaped meta object (`name`,
`display_name`, `picture`, `nip05`, `about`, `website`, `lud16`) written to `_metaCache`
**only if absent** (never overwrite; relay data may be fresher). `_metaFetched` untouched.

## Consequences

- Free-text inherits the deployment's 750K-profile index, typo tolerance, and house-POV
  scores through one GET — no new relays, no score math, no server code of ours.
- The feature (not the page) depends on `tags.brainstorm.world`'s HTTP API and CORS posture.
  Failure degrades to "search unavailable"; identity path and membership machinery
  unaffected. Options B/C are the documented fallbacks.
- Served order/filters stay externally mutable. Ordering is defended by the re-sort; a
  server-side score *filter* appearing later would silently narrow results — accepted risk,
  noted in the swap runbook checks.
- The POV-as-parameter seam makes story #3 a parameter change, not a redesign.
- `makeMemberCard` candidate mode gains a score element; score-less rows render without the
  chip and sort last.
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html` unless noted.

- **Constants:** `SEARCH_API` + `HOUSE_POV` per sub-decision 3.
- **`runMemberSearch`:** in the `!decoded` branch, the length fork (< 2 → prompt via
  `member-search-hint`; ≥ 2 → `runFreetextSearch(raw, seq)`). Identity branch byte-identical.
- **`runFreetextSearch(query, seq, povPubkey = HOUSE_POV.pubkey)`** (new): loading state;
  abort prior request; fetch; `seq === _searchSeq` check after every await; fallback-guard
  warn; sort `hit['wot_rank_'+povSuffix] ?? -1` desc, slice 6; seed `_metaCache`
  (absent-only); `getMemberSets()` for status/taggerHex; render rows + encouragement footer;
  error → unavailable state; zero hits → empty state.
- **`makeMemberCard`:** candidate mode takes `options.trustScore` (number | null);
  non-null renders the score element (right side near the badge, LFO palette).
- **Panel** (`#member-search-panel`): vertical list; encouragement-footer element class
  used under results and in the empty state.
- **Copy** (Tester pins exact strings, vouch vocabulary): below-minimum prompt, empty state,
  unavailable state, identity-encouragement footer (npub / hex / nprofile).
- **Vouch/dismiss/integrity:** no new paths — story-#1 panel vouch handler;
  `hideMemberSearchPanel` additionally aborts the in-flight free-text request.
- **Tests** (`tests/npub-search.spec.js`): stub via `page.route(SEARCH_API + '*', …)`;
  fixtures carry `povSuffix` + namespaced score fields to exercise ordering (including a
  served-order ≠ rank-order case), score-less hits, povSuffix mismatch, empty, error,
  and below-minimum no-request assertions (route call-count). Identity fast-path regression:
  no search-API request when input decodes.

## Amendments

- **2026-08-18 — sub-decision 4's swap runbook superseded, not executed** (commit
  `5296c17`): `HOUSE_POV.pubkey` moved off the PO's placeholder account
  (`6db8a13f…`) to `6ff68243…` (`npub1dlmgysu…`), which is now the designated house
  perspective. The official LFO account `5f0d66ba…` is **not** the house POV and the
  runbook's prerequisites were never carried out: provisioning a POV requires signing
  (an LFO-signed kind-10040 delegation plus a signed sign-in to the brainstorm UI), and
  the LFO account's private key is unavailable. Provisioning of `6ff68243…` was verified
  on `api.brainstorm.world` before the swap — `/rank/pubkeys` under the new POV returns
  non-zero, distinct ranks (curator 0.964, PO 0.568) while a control junk POV returns
  0.0. Sub-decision 3's **seam** stands unchanged: one constant, read by every consumer
  through `activePovPubkey()`, so the change was one string in the app and one in the
  spec. `api/feed.js` `TAG_AUTHOR` is deliberately untouched — same hex as the old
  placeholder, different role (feed tag-header authorship, not POV).
- **2026-08-05 — Option A backend superseded by ADR 0045** (story #6): free-text search
  runs on ORE `/search/pubkeys`; sub-decisions 1–2 and the `SEARCH_API` /
  `expectedPovSuffix` constants (and their fallback guard) are retired with the meili
  proxy. The house-POV-as-config seam carries forward.

## Out of scope

- Personalized POV (story #3) — this ADR only shapes the seam.
- NIP-05 identifier input and the proxy's `nip05Lookup` param — future story.
- Pagination / full results page (`offset` stays 0; `estimatedTotalHits` unused).
- The response's `tagHits` and `nip05Result` fields — explicitly ignored.
- Executing the LFO swap runbook (external) — superseded 2026-08-18, see Amendments.
- Our own proxy (Option C) — revisit only on a CORS/contract change.
- Migrating search to ORE `/search/pubkeys` (Option D) — the planned successor, per the
  convergence rationale in ADR 0043. When picked up: verify the LFO POV, and join profile
  metadata client-side (the ORE response is pubkey+rank only).

## ORE probe record

The two load-bearing live probes of the Open Ranking Engine. (This section supersedes the
earlier P1–P16 probe log; meili-proxy behavior is documented in
`docs/meili-search-proxy-contract.md`.)

### 2026-08-05 — `/search/pubkeys`, personalized search *(most recent; formerly P16)*

Outbound request:

```
POST https://brainstormserver.nosfabrica.com/search/pubkeys
Content-Type: application/json

{"query":"rando","algorithm":"relevance-pov","pov":"6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597","limit":6}
```

Differential baseline (same host, same query, global algorithm, no `pov`):

```
POST https://brainstormserver.nosfabrica.com/search/pubkeys
Content-Type: application/json

{"query":"rando","algorithm":"relevance","limit":6}
```

Response shape (both): `{"results":[{"pubkey":"<64-hex>","rank":<float>}, …],"ttl":300}`.

Findings: **personalization confirmed live for the placeholder house POV.** The POV
response's #1 hit (`16ea2a43c7b6e4f582ce3e06330b2b3ecaca13be7b654f96df13f6ca3b1d5eee`,
profile display-name "rando", rank ≈ 10037 — nearly double the global top) appears **only**
under the POV; the global response does not contain it. A re-run of the earlier "liz"
differential (same two request shapes with `"query":"liz"`) returned the same six pubkeys
in the same order but with **per-profile rank values differing from global** on three of
six — a genuine per-POV computation. (Probes on 2026-08-02 had shown POV responses
byte-identical to global; the change is server-side provisioning of this POV in the
interim, not a client-side variable.) Algorithm IDs verified against the host's own
discovery doc: `GET https://brainstormserver.nosfabrica.com/.well-known/open-ranking.json`
advertises `relevance` and `relevance-pov` for `/search/pubkeys`, matching the staging
snapshot in `docs/open-ranking-ore-algorithms.staging.json`.

### 2026-08-02 — `/rank/pubkeys`, batch personalized rank *(adopted in ADR 0043; formerly P15)*

Outbound request:

```
POST https://api.brainstorm.world/rank/pubkeys
Content-Type: application/json

{"pubkeys":["b8a9df8218084e490d888342a9d488b7cf0fb20b1a19b963becd68ed6ab5cbbd","0edc2f474484769bc9bf6d471d180e4e280b0bcd719b6da791001beb730cff1b"],"algorithm":"graperank-pov","pov":"6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597"}
```

Differential baseline (same host and body, `"algorithm":"graperank"`, no `pov`).

Response shape: `{"results":[{"pubkey":"<64-hex>","rank":<float 0–1>}, …],"ttl":3600}`.

Findings: **genuinely personalized** — POV values differ from global (0.96476 vs 0.96447;
0.92409 vs 0.91738). The meili proxy's `wot_rank_<suffix>` columns are exactly
`round(rank × 100)` of these values (0.9647 → 96; 0.9240 → 92), so both surfaces speak the
same number after conversion. This endpoint powers the member-card chips (ADR 0043) with
`pov` = `HOUSE_POV.pubkey`.
