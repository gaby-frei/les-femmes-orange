# ADR 0042: Free-text profile search — deployed ranked-search API, client-side trust ordering, house POV as a config constant

**Status:** Accepted (PO, 2026-08-02)
**Date:** 2026-08-01 (probes updated 2026-08-02)
**Story:** `engineering-team/stories/npub-search/2-freetext-search-house-pov.md`

## Context

Story #2 converts story #1's non-identity dead end (`public/index.html:2731`, the `!decoded`
branch of `runMemberSearch`) into free-text profile search: up to 6 candidate rows, ordered
highest-trust first with the numeric trust score shown, ranked from the perspective of a
**designated house npub** whose placeholder→LFO swap must be config-only. The identity fast
path is untouched.

**Concept graph:** API at `localhost:8877` unreachable at design time (as for ADR 0041). No
concept definitions change; no firmware impact. The LFO tag event, membership sets, and vouch
write path are reused unchanged.

**Candidate backend contracts** — all findings below are probe-verified; see the
[Probe log](#probe-log):

- **Brainstorm meili proxy** (`GET tags.brainstorm.world/api/search/profiles/meili`, source
  `tapestry/src/api/search/profiles/meili/index.js:91-235`): client sends only `q`, `limit`
  (≤200), `offset`, `wotPov=house|user`, `userPubkey`. With `wotPov=user` the server resolves
  the pubkey's stored prefs → `rankAuthor` → `povSuffix` (first 8 hex chars), which names the
  score columns on each hit (`wot_rank_<povSuffix>`, `wot_followers_<povSuffix>`). No
  `rankAuthor` → silent fallback to the nosfabrica house POV; the deployed proxy reports this
  via a `povResolution` object (P1). Sort/filter come from stored prefs, never the client (P3).
- **NIP-50** on `wss://tags.brainstorm.world/relay`: text search works, returns raw kind-0
  events, no scores (P4).
- **Open Ranking Engine (ORE)** `POST /search/pubkeys` (`relevance` / `relevance-pov`), per
  the ORE-01/ORE-05 specs (`github.com/Open-Ranking/protocol`) and the discovery doc snapshot
  `docs/open-ranking-ore-algorithms.staging.json`: `{query, algorithm?, pov?, limit?}` →
  `{results: [{pubkey, rank}], ttl}` (P5–P12).

**Constraints:** JS-without-build; all-client Members page (ADR 0041). The panel, candidate
row (`makeMemberCard` `'candidate'` mode), `publishVouch`, `getMemberSets`, `_searchSeq`
stale guard, and the 400 ms debounced controller exist from story #1 and must be reused, not
forked. Story #3 (personalized POV) will want the same search with a different POV pubkey.

## Options considered

### Option A — Brainstorm meili proxy, called directly from the client *(chosen)*

`fetch` with `wotPov=user&userPubkey=<house pubkey>`; read each row's score from
`wot_rank_<povSuffix>` using the response's own `povSuffix`.

Pros: the only backend returning profiles **and** house-POV scores in one round trip (P1);
CORS open, no proxy needed (P2); the 6-suggestion / ≥2-char shape is brainstorm's own flow;
POV is a request parameter, so the LFO swap and story #3 are parameter changes.
Cons: runtime dependency on the deployment's HTTP API (scoped to free-text; identity path
stays relay-only); ranking correctness depends on the house account staying provisioned
server-side, with a *silent* fallback to nosfabrica's POV (mitigated: sub-decision 3); served
order follows a mutable stored pref, not trust (P3; mitigated: sub-decision 2).

### Option B — NIP-50 search on the relay

Pros: no HTTP dependency; reuses relay plumbing; returns the right profiles (P4).
Cons: **no trust scores** — ranking would need per-candidate kind-30382 fetches from
`wss://nip85.nosfabrica.com` (a third relay) plus re-implementing the POV resolution the
proxy already owns. More moving parts for strictly less. Documented fallback if the HTTP
API's CORS ever closes.

### Option C — Our own serverless proxy (`api/search.js` beside `api/feed.js`)

Pros: shields the client from deployment API changes; a place to pin CORS.
Cons: adds surface and a hop for a call the browser already makes (P2); breaks the Members
page's all-client pattern; ADR 0041 already rejected this shape. Revisit only if CORS closes.

### Option D — ORE `/search/pubkeys` with `relevance-pov`

Pros: the *architecturally right shape* — POV as a per-request parameter (no stored-prefs
coupling); one fused text×WoT rank, already trust-ordered; published spec + OpenAPI; wildcard
CORS; fast; production hosts exist (P5, P6).
Cons — each independently disqualifying **today**:
(a) no host serves a *personalized* ranking for our POVs — LFO gets a deliberate,
spec-conformant "computed: zero results" (P8, P11), and the PO pubkey, though recognized, is
served ranks byte-identical to the global observer (P9);
(b) the response carries no echo of the resolved observer — by protocol design (P12) —
so fallback and personalization are unverifiable from the response;
(c) results are pubkey+rank only (P12) — rows would need a second batched kind-0 fetch.
Migration path if revisited: contained inside `runFreetextSearch`, POV seam unchanged.

## Decision

**Option A.** Option D is the likely successor — it fixes Option A's two structural warts
(server-side POV resolution, pref-governed ordering) — but today it cannot serve a
personalized house-POV ranking, cannot prove whose perspective it served, and cannot draw a
row without a second fetch. Option A satisfies every AC with one call now.

Four sub-decisions:

1. **Trust score = the `rank` metric** (`wot_rank_<povSuffix>`, brainstorm's "Verification
   Score", 0–100). Displayed on each row and used as the ordering key. `followers` is ignored
   for ordering (it's the stored pref currently governing server order — P3).
2. **Client-side re-sort with headroom.** Request `limit=24`, sort by `wot_rank_<povSuffix>`
   desc client-side (score-less hits last, in served order), take 6. "Highest trust first"
   becomes a property of our code, not of a mutable server pref, at zero extra request cost.
   (As of P14 the PO account's stored sort is rank-desc, so served order already agrees —
   the re-sort stays as defense against pref drift, not as the primary mechanism.)
3. **House POV is one config constant block** in `public/index.html`, beside `RELAYS` (~1914):

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
4. **Swap runbook (config-only).** Prerequisites (external): (a) LFO pubkey `5f0d66ba…`
   registered as a brainstorm customer (self-serve sign-up); (b) an LFO-signed kind-10040
   delegating `30382:rank`; (c) deployment-side prefs for the LFO pubkey with `rankAuthor` —
   established by one sign-in to the brainstorm search UI as LFO after (b). Then the swap is
   editing `HOUSE_POV.pubkey` + `HOUSE_POV.expectedPovSuffix` — two strings, no logic.
   **Settings-panel checks for whichever account is house** (P13): `rank` ticked in
   Available Trust Metrics (else its scores may stop refreshing on re-load while we display
   them); filters off unless intentional; Sort by → `rank` desc preferred (aligns the
   server-side cut with the metric we rank by; our re-sort remains the defense either way).

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

All in `public/index.html` unless noted. Line numbers as of `206f1a0`.

- **Constants** (~1914): `SEARCH_API` + `HOUSE_POV` per sub-decision 3.
- **`runMemberSearch`** (~2725): in the `!decoded` branch (~2731), replace the dead-end hint
  with the length fork (< 2 → prompt via `member-search-hint`; ≥ 2 →
  `runFreetextSearch(raw, seq)`). Identity branch byte-identical.
- **`runFreetextSearch(query, seq, povPubkey = HOUSE_POV.pubkey)`** (new): loading state;
  abort prior request; fetch; `seq === _searchSeq` check after every await; fallback-guard
  warn; sort `hit['wot_rank_'+povSuffix] ?? -1` desc, slice 6; seed `_metaCache`
  (absent-only); `getMemberSets()` for status/taggerHex; render rows + encouragement footer;
  error → unavailable state; zero hits → empty state.
- **`makeMemberCard`** (~2471): candidate mode takes `options.trustScore` (number | null);
  non-null renders the score element (right side near the badge; placement/copy are Test
  Design + implementation detail, LFO palette).
- **Panel** (`#member-search-panel`, ~1640): already a vertical list; add an
  encouragement-footer element class used under results and in the empty state.
- **Copy** (Tester pins exact strings, vouch vocabulary): below-minimum prompt, empty state,
  unavailable state, identity-encouragement footer (npub / hex / nprofile).
- **Vouch/dismiss/integrity:** no new paths — story-#1 panel vouch handler (~2770-2812);
  `hideMemberSearchPanel` additionally aborts the in-flight free-text request.
- **Tests** (`tests/npub-search.spec.js`): stub via `page.route(SEARCH_API + '*', …)`;
  fixtures carry `povSuffix` + namespaced score fields to exercise ordering (incl. the
  served-order ≠ rank-order case, P3), score-less hits, povSuffix mismatch, empty, error,
  and below-minimum no-request assertions (route call-count). Identity fast-path regression:
  no search-API request when input decodes.

## Out of scope

- Personalized POV (story #3) — this ADR only shapes the seam.
- NIP-05 identifier input and the proxy's `nip05Lookup` param — future story.
- Pagination / full results page (`offset` stays 0; `estimatedTotalHits` unused).
- The response's `tagHits` and `nip05Result` fields — explicitly ignored.
- Executing the LFO swap runbook (external; the PO is driving it).
- Our own proxy (Option C) — revisit only on a CORS/contract change.
- Migrating to ORE (Option D) — revisit when a host serves a genuinely personalized
  (≠ global) `relevance-pov` for the house pubkey and it's verifiable; a **202 +
  `Retry-After`** on a POV request (ORE-05's compute-pending signal, unused today) would
  signal changed provisioning semantics. Re-probe per the Probe log's differential checks.

## Probe log

All probes live against running services. 2026-08-01 (P1–P4) and 2026-08-02 (P5–P12).
Query used throughout: `"liz"`. Pubkeys: **PO** = `6db8a13f…` (placeholder house POV),
**LFO** = `5f0d66ba…` (target house POV), **TA** = `39945424…` (PO's delegated rank author /
Brainstorm assistant). ORE hosts: **stg** = `brainstormserver-staging.nosfabrica.com`,
**prod** = `api.brainstorm.world` and `brainstormserver.nosfabrica.com` (same backend or
close mirrors; ranks match to data-age drift).

| # | Target | Probe | Result | Implication |
|---|--------|-------|--------|-------------|
| P1 | meili proxy | `wotPov=user&userPubkey=<PO>` | 6 hits, all with `wot_rank_39945424` + `wot_followers_39945424`, full profile fields; `povSuffix: "39945424"`; `povResolution: { fellBackToHouse: false, delegateSource: "user-prefs", … }` | One GET returns profiles + scores + auditable POV resolution; deployed proxy is newer than the `tapestry/` checkout |
| P2 | meili proxy | Request with foreign `Origin`; POST preflight | Origin reflected in `Access-Control-Allow-Origin`, `Vary: Origin` | Direct browser fetch works; no proxy of ours needed |
| P3 | meili proxy | Inspect hit order vs scores | Order is `followers`-desc (rank 68 above rank 75), per the PO account's stored `sortConfig`; client cannot send sort | Served order ≠ trust order → client-side re-sort (sub-decision 2) |
| P4 | relay (NIP-50) | `{kinds:[0], search:"liz", limit:6}` | EOSE, same 6 profiles, raw kind-0, no scores | Text search alone can't satisfy the score/ordering ACs (Option B cons) |
| P5 | ORE stg | `/.well-known/open-ranking.json` + OpenAPI | `/search/pubkeys` advertises `relevance` + `relevance-pov`; wildcard CORS, preflight passes | Contract snapshot: `docs/open-ranking-ore-algorithms.staging.json`; browser-callable |
| P6 | ORE stg + prod | `relevance` (global) | 6 genuine matches everywhere, ~250–450 ms, `ttl: 300` | ORE text+WoT fusion works; global observer only |
| P7 | ORE stg | `relevance-pov`, pov = PO or LFO | `{"results": []}`, HTTP 200 | Staging has no WoT for our POVs |
| P8 | ORE prod | `relevance-pov`, pov = LFO or bogus | `{"results": []}`, HTTP 200, no `Retry-After`, repeatedly | Deliberate "computed: zero results", not "pending" — won't heal by waiting (see P11) |
| P9 | ORE prod | `relevance-pov`, pov = PO, vs global | 6 results **byte-identical to global** (pubkeys + ranks, full float precision) | Recognized POV served the default observer — not personalized; matches PO's npub.world observation |
| P10 | ORE prod | `relevance-pov`, pov = TA | `{"results": []}` | `pov` = perspective *owner*, not score author; delegate has no standing as a POV |
| P11 | ORE prod | ORE-01/05 conformance battery | `relevance-pov` w/o `pov` → 422; empty query → 422; unknown algorithm → 422; `pov` on global → ignored; hex-only `pov` enforced (npub → validation error) | Host is spec-conformant → its 200-empties are deliberate semantics; a 202 would be the on-demand-compute signal |
| P12 | ORE spec + prod | Response shape | `{results: [{pubkey, rank}], ttl}` only — no profile fields, no observer echo (none defined in ORE-05) | Un-audit-able by design + needs a second kind-0 fetch to draw rows (Option D cons b, c) |
| P13 | meili proxy | `wotPov=house` vs `wotPov=user&userPubkey=<PO>` differential; PO's settings-panel screenshot | House: delegate `78ed0837`, `mode: "filtered"`, `minRank: 2`. PO: delegate `39945424`, unfiltered, sort `followers` desc, `selectedMetrics` = followers only (rank unchecked) | PO prefs fully reconstructed (see `docs/meili-search-proxy-contract.md` § Observed prefs); rank-metric staleness risk + "tick rank / sort by rank" recommendation added to the swap-runbook checks |
| P14 | meili proxy | Re-probe after PO applied the P13 recommendation (settings saved: `rank` ticked, `followers` unticked, sort → rank desc, filter still off) | Served order now strictly rank-desc (75 above 68), `mode: "unfiltered"`, delegate unchanged | Runbook checks satisfied for the placeholder account; server cut now aligns with the displayed metric. Client re-sort **retained** as defense (prefs remain externally mutable; rank ties have unspecified secondary order) |
