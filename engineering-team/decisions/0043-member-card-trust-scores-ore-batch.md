# ADR 0043: Member-card trust scores — ORE `/rank/pubkeys` batch (Route B)

**Status:** Accepted (PO pre-selection, 2026-08-02)
**Date:** 2026-08-02
**Story:** `engineering-team/stories/npub-search/4-member-card-trust-scores.md`
**Extends:** ADR 0042 (house-POV trust surface; `HOUSE_POV` config seam; probe log P1–P15)

## Context

Story #2 displays house-POV trust scores on free-text search rows, sourced from the meili
proxy's `wot_rank_<povSuffix>` columns. This mini story adds the same signal to every card
on the member grids (~45 pubkeys per load). The search endpoint cannot batch by pubkey
(`pubkeyLookup` is single-pubkey), so a grid-wide decoration needs either N lookups or a
different endpoint.

**New probe evidence (2026-08-02, recorded as ADR 0042 P15):** ORE
`POST api.brainstorm.world/rank/pubkeys` with `algorithm: "graperank-pov", pov: <PO hex>`
returns **genuinely personalized** values — measurably different from global `graperank`
(0.96476 vs 0.96447; 0.92409 vs 0.91738) — unlike `/search/pubkeys`, whose
recognized-but-global behavior (ADR 0042 P9) is therefore endpoint-specific, not
provider-wide. Scale is 0–1 float, and the meili columns are exactly `round(rank × 100)`
(Tanja 0.9647 → 96; Liz 0.9240 → 92), so both surfaces speak the same number after
conversion. `ttl: 3600`.

## Options considered

### Option A — meili `pubkeyLookup` per card (same host as #2)
One GET per member; docs carry all POV namespaces (probe-verified). Pros: zero new hosts;
byte-identical to the search chip's source. Cons: ~45 requests per load; N× the surface for
transient failures; no batch semantics at all.

### Option B — ORE `/rank/pubkeys` batch *(chosen — PO pick)*
One `POST {pubkeys, algorithm: 'graperank-pov', pov}` → `{results: [{pubkey, rank}], ttl}`.
Pros: single round trip for the whole grid; genuinely personalized for our POV (P15);
`ttl: 3600` invites session caching; the ORE contract is spec-published (ORE-01/-05 family).
Cons: second backend host (`api.brainstorm.world`); 0–1 scale needs ×100 conversion; scores
may drift slightly from the search chips (different compute vintage than the meili columns).

### Option C — kind-30382 batch REQ from the rank author's relay
Native Nostr path. Cons: third relay dependency (`nip85.nosfabrica.com`), per-event parsing,
and re-implementing what both HTTP surfaces already serve. Not pursued.

## Decision

**Option B.** PO rationale, recorded verbatim in intent (2026-08-02): **search will
eventually shift to adopt ORE as well** (ADR 0042 already names ORE the probable successor
for `/search/pubkeys` once its POV personalization and auditability land) — at which point
chips and cards share one source and **the drift window closes by convergence** rather than
by us engineering around it. Until then the residual chip-vs-card drift (sub-point
differences that mostly vanish under ×100 rounding) is accepted.

Sub-decisions:

1. **Same POV seam.** The batch call takes `pov` from `HOUSE_POV.pubkey` — the ADR 0042
   config constant. The LFO swap remains two strings; story #3 passes a member pubkey.
2. **Display conversion:** `Math.round(rank * 100)`, rendered in the story-#2 chip format
   (`.candidate-trust-score`, 🏅 prefix) so the two surfaces read identically.
3. **Enhancement-only, patch-after-render.** Cards render immediately as today; the batch
   fires in parallel and chips are patched into already-rendered cards on arrival. Any
   failure (non-200, timeout ~8 s, malformed body) yields a chipless page — no error UI,
   no retry loop. ORE 202/Retry-After handling is explicitly deferred (hosts don't emit it
   today — ADR 0042 P11).
4. **Session cache.** Results cached in-memory per pubkey (`ttl: 3600` comfortably exceeds
   a page session); re-loads only fetch pubkeys not yet cached (e.g. a freshly vouched
   member).

## Consequences

- The Members page gains a second, independent backend dependency — but strictly as
  decoration: its total failure is visually indistinguishable from "no scores computed."
- Chip/card values may differ transiently from search-panel chips until search itself moves
  to ORE (accepted; the convergence is the plan of record).
- The ORE response remains un-audit-able POV-wise (no observer echo — ADR 0042 P12); for a
  decorative surface this is tolerated without the warn guard the search path carries.
- Story #3 inherits a working batch-score fetch parameterized by POV.
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html`.

- **Constant** (beside `SEARCH_API`): `const ORE_RANK_API = 'https://api.brainstorm.world/rank/pubkeys';`
- **`fetchHouseTrustScores(pubkeys, povPubkey = HOUSE_POV.pubkey)`** (new, near
  `runFreetextSearch`): filter to pubkeys missing from the module-level `_houseScoreCache`
  Map; if any, one `POST` (JSON body `{pubkeys: missing, algorithm: 'graperank-pov',
  pov: povPubkey}`, `AbortController` timeout ~8 s); on 200, cache each
  `results[].{pubkey, rank}` with `typeof rank === 'number'` guard; all failures swallowed.
  Returns `Map<hex, rank0to1>` for the requested pubkeys.
- **`patchGridTrustScores(pubkeys)`** (new): awaits the fetch, then for each
  `#verified-members-grid .member-card, #pending-members-grid .member-card` resolves the
  card's hex via its `.member-copy-btn[data-hex]`, skips chipless-eligible (no score) and
  already-chipped cards, and prepends the chip
  (`span.candidate-trust-score`, `🏅 ${Math.round(rank*100)}`) into `.member-footer`.
- **`loadMembersPage`**: after the grids render, call `patchGridTrustScores([...verifiedPubkeys,
  ...pendingPubkeys])` **without awaiting** (fire-and-forget — AC: rendering never blocks).
- **Tests** (`tests/npub-search.spec.js`, describe block 3): stub
  `page.route('**/rank/pubkeys', …)`; assert single batch POST with the exact body contract,
  chip values = `round(rank*100)` on both grids, chipless on missing pubkey, and the
  failure mode (abort → page renders exactly as today, zero chips).

## Out of scope

- Grid reordering by score (story #3); search-panel changes; 202 handling; any warn guard
  on the decorative path.
