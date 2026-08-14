# ADR 0045: Search → ORE migration — three-call pipeline inside `runFreetextSearch`

**Status:** Accepted (PO, 2026-08-05)
**Date:** 2026-08-05
**Story:** `engineering-team/stories/npub-search/6-search-ore-migration.md`
**Supersedes in part:** ADR 0042's Option A (the meili-proxy backend for free-text search)
and its sub-decisions 1–2; the `HOUSE_POV` seam (sub-decision 3) and swap runbook
(sub-decision 4) carry forward. Completes the convergence rationale of ADR 0043.

## Context

The story is fully determined (PO, 2026-08-05 — O1–O4): free-text search moves to ORE
`/search/pubkeys` (`relevance-pov`, personalization probe-verified — ADR 0042 → ORE probe
record); row metadata joins over the story-#1 wide relay set; row chips come from the
story-#4 `/rank/pubkeys` batch; both ORE calls share host
`brainstormserver.nosfabrica.com`; ORE failure → unavailable state with identity-search
prompt, no meili fallback.

**Concept graph:** `localhost:8877` unreachable at design time (as for ADRs 0041–0044); no
concept definitions change; no firmware impact.

**What the swap dissolves** (from the current implementation, `public/index.html`):
the meili envelope handling in `runFreetextSearch` (~2835-2905) — `povSuffix` /
`povResolution` fallback guard, `wot_rank_<suffix>` column reads, client-side re-sort with
`limit=24` headroom, absent-only meta seeding from proxy documents — and the `SEARCH_API`
constant (~1948). The ORE response is `{results: [{pubkey, rank}], ttl}` with the rank a
fused text×WoT float (ordering signal only, never displayed — PO O4).

**What already exists to build on:** `fetchSearchProfile` (story #1) — wide-set kind-0
fan-out for ONE pubkey with progressive resolve and no negative cache;
`fetchHouseTrustScores` + `_houseScoreCache` (story #4, ~2925) — the batch rank fetch the
chips reuse; `makeMemberCard('candidate', { trustScore })`; the `_searchSeq` +
`_freetextAbort` guards; panel states and encouragement footer (story #2).

## Options considered

### Option A — Sequential search → parallel (metadata join ‖ rank batch) → single render *(chosen)*

`runFreetextSearch` becomes: POST ORE search (`limit: 6`) → on results, run **in
parallel** (a) one batched kind-0 filter (`authors: [top pubkeys]`) per wide-set relay,
and (b) `fetchHouseTrustScores(pubkeys)` → await both (each internally bounded) → render
all rows once, in ORE served order, chips from (b).

Pros: one paint per query — matches every pinned panel behavior (loading state → rows,
stale-guard checks after each await); the metadata join is one filter per relay (4 sockets,
6 authors each), same breadth as story #1's single-pubkey fan-out; the rank batch is ~300 ms
and cache-warm after first use, so the long pole is the metadata join, which relay timeouts
already bound; profile-less pubkeys render (story-#1 rules) when their authors settle with
no hit; chip failure degrades to chipless rows exactly like story #4's grids.
Cons: time-to-rows ≈ search + slowest-relay settle for misses (a full-miss pubkey holds
rows until the relay timeout window closes) — acceptable: hits resolve at
fastest-relay speed and full misses are the rare case (mitigation: the metadata join
resolves per-pubkey as soon as every relay has answered *for that pubkey* — in practice
one shared settle, since the filters travel together).

### Option B — Progressive per-row rendering (first metadata paints first)

Render each row as its profile arrives, story-#1-style progressive resolve generalized to N.
Pros: fastest first paint. Cons: rows appearing out of served order then re-slotting (or
order-reserved placeholder rows) — new UI states the pinned tests don't describe and the
story doesn't ask for; racier DOM under the `_searchSeq` guard; complexity with no AC
behind it. Rejected.

### Option C — Keep the meili proxy (status quo)

Rejected by the story itself; recorded only as the fallback posture question, which the PO
resolved as "no fallback" (O2). The meili path is deleted, not shadowed.

## Decision

**Option A**, with these specifics:

1. **Constants** (~1948-1959): one `ORE_HOST = 'https://brainstormserver.nosfabrica.com'`;
   `ORE_SEARCH_API = ORE_HOST + '/search/pubkeys'`; `ORE_RANK_API = ORE_HOST +
   '/rank/pubkeys'` (**moves story #4's shipped URL off `api.brainstorm.world`** — the
   implementation commit message must say so; `api.brainstorm.world` stays noted in the
   constant comment as the verified alternate mirror). `SEARCH_API` and
   `HOUSE_POV.expectedPovSuffix` are deleted — the suffix's only consumer was the meili
   fallback guard, which dies with the envelope. `HOUSE_POV.pubkey` remains the POV seam.
2. **Search call:** `POST ORE_SEARCH_API`, JSON body
   `{query, algorithm: 'relevance-pov', pov: povPubkey, limit: 6}`, guarded by the existing
   `_freetextAbort` controller + `_searchSeq`. `limit: 6` exactly — no headroom, since
   served order is trusted (no re-sort, no cut) and profile-less results still render.
   POV travels in the JSON body — the URI-encoding caveat from review #2 is moot.
3. **Metadata join — `fetchSearchProfilesBatch(pubkeys)`** (new, beside
   `fetchSearchProfile`, which stays for the identity path): one
   `queryRelay(r, { kinds: [0], authors: pubkeys, limit: pubkeys.length * 4 }, 6000)` per
   relay in `[...RELAYS, ...PROFILE_RELAYS]`; collect the newest event per pubkey across
   relays; write winners into `_metaCache` when newer than what's cached (story-#1
   newest-wins semantics — supersedes the meili path's absent-only rule, since relay data
   is authoritative); **no negative caching** (O1); resolve with `Map<hex, meta>` when all
   relays settle. No nprofile hints here (none exist for free-text).
4. **Chips:** `fetchHouseTrustScores(pubkeys)` in parallel with the join; row
   `trustScore = Math.round(rank * 100)` when present, chipless otherwise. Search thereby
   warms `_houseScoreCache` for the grids (O4). The fused search rank is never shown.
5. **Render:** rows in ORE served order via `makeMemberCard('candidate', …)` — status from
   `getMemberSets()`, profile-less rows per story-#1 rules (short npub in the name slot,
   warning copy, vouchable), encouragement footer beneath results and empty state.
6. **States:** empty `results` → empty state + footer (unchanged). Search POST non-OK /
   network / abort-superseded → the unavailable state, **copy now prompting identity
   search** (npub / hex / nprofile — O2; Tester pins the string). Metadata/rank failures
   are NOT unavailable states: rows render profile-less/chipless respectively.
7. **Dismissal/abort:** unchanged — `hideMemberSearchPanel` aborts the controller; the
   controller signal is passed to the search POST. The metadata join and rank batch are
   seq-guarded rather than aborted (in-flight relay queries settle idle; the rank batch
   usefully warms the shared cache either way).

## Consequences

- Search, member-card chips, and grid ordering now share one engine, one host, one POV
  parameter — the ADR 0043 convergence is complete; chip/row/grid numbers are identical by
  construction (same `graperank-pov` values through the same cache).
- The free-text path's dependency moves from `tags.brainstorm.world` to
  `brainstormserver.nosfabrica.com`; the meili proxy remains in use **nowhere**. ADR
  0042's Options B/C fallback notes are historical.
- The `povResolution` auditability of the meili envelope is consciously given up (ORE has
  no observer echo — spec-level); the compensating control is the probe record + the
  operator relationship. `expectedPovSuffix` leaves the config.
- Free-text now touches relays (the wide set) for the first time — per-query sockets rise
  from 1 HTTP call to 1 HTTP + 4 relay queries + 1 cache-warm HTTP batch; identity-path
  behavior and load are unchanged.
- Story #3 inherits: one `povPubkey` parameter end-to-end (search body + rank batch) plus
  the known cache-re-key caveat (`_houseScoreCache` is pubkey-keyed — carried forward from
  review #4).
- Time-to-rows is bounded by the metadata join's relay timeout when a result pubkey has no
  kind-0 anywhere; typical queries render at fastest-relay speed.
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html`; line refs as of `60177ba`.

- **Constants** (~1948-1959): replace `SEARCH_API` + `ORE_RANK_API` per Decision 1;
  delete `expectedPovSuffix` from `HOUSE_POV` (comment updated — swap = one string now).
- **`runFreetextSearch`** (~2835-2905): keep signature `(query, seq, povPubkey =
  HOUSE_POV.pubkey)`, loading state, abort/seq scaffolding. Replace body per Decisions
  2–6. Delete: povSuffix/povResolution guard + warn, `wot_rank_` column reads, re-sort,
  absent-only seeding loop.
- **`fetchSearchProfilesBatch(pubkeys)`** (new, near `fetchSearchProfile` ~2500s): per
  Decision 3. Pure addition; `fetchSearchProfile` untouched (identity path).
- **`fetchHouseTrustScores`** (~2925): unchanged (already parameterized; URL constant
  moves with Decision 1).
- **Copy:** unavailable-state string gains the identity prompt (Tester pins; vouch
  vocabulary; the existing `.member-search-footnote` copy stays as-is under results).
- **Tests** (`tests/npub-search.spec.js`, Test Design phase): re-point the free-text stubs
  from the meili glob to `**/search/pubkeys` (ORE body fixtures `{results, ttl}`); the
  existing `stubRankApi` + kind-0 `queryRelay` stub cover the other two calls. Expected
  re-pins: T16 (request contract → POST body assertions), T17 (order = served order;
  chips from rank fixtures), T19 (score-less = missing from rank response), T26 (the
  povResolution warn test is obsolete — replace with a served-order-trusted or
  rank-batch-failure case), T27 (seeding semantics now newest-wins from relay fixtures).
  T15/T18/T20-T25 assertions should survive with fixture swaps. Grid suites (T28-T34)
  unaffected except the host constant (stubs are host-agnostic globs).

## Amendments

- **2026-08-14 — Decision 1 host superseded by settled policy** (CLAUDE.md § Brainstorm
  Hosts): `ORE_HOST` = `api.brainstorm.world`; `brainstormserver.nosfabrica.com` is
  deprecated (same IP). Everything else in Decision 1 (one host constant deriving both
  endpoints, `SEARCH_API`/`expectedPovSuffix` deletions) stands.

## Out of scope

- Personalized POV opt-in and `_houseScoreCache` re-keying (story #3).
- LFO-POV verification on ORE (swap runbook, ADR 0042 — external).
- ORE 202/`Retry-After` handling (not emitted by the hosts today).
- Retiring `docs/meili-search-proxy-contract.md` (stays as reference for the deployment's
  API; no longer describes our search path once this ships).
