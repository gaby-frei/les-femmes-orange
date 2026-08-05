# Story 6: Migrate free-text search from the meili proxy to ORE `/search/pubkeys`

**Status:** Approved (PO, 2026-08-05 — O1–O4 determinations recorded)
**Created:** 2026-08-05
**Type:** Refactor (backend swap behind an existing, test-pinned surface)
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** #2 (free-text search, ADR 0042 — which names ORE the planned successor and
contains the migration seam), #4 (ORE batch scores + `_houseScoreCache`, ADR 0043 — whose
convergence rationale this story completes), #5 (trust-ordered grids).

## Background

Free-text search currently calls the brainstorm meili proxy
(`GET tags.brainstorm.world/api/search/profiles/meili`) and re-sorts client-side by
`wot_rank`. The member-card chips already come from ORE. On 2026-08-05 a live probe
confirmed `POST https://brainstormserver.nosfabrica.com/search/pubkeys` with
`relevance-pov` serves **genuinely personalized** ranking for the designated house POV
(ADR 0042 → ORE probe record). Migrating search onto it completes the convergence ADR 0043
anticipated: search rows, member-card chips, and grid ordering all ranked by one engine
from one POV parameter — ending both the chip-vs-row drift and the meili path's structural
warts (server-stored POV resolution with silent fallback; pref-governed serving order).

## User-facing description

As a **member** searching by name, I get the same panel I have today — but the ranking
behind it comes from the same engine that scores the member grids, so the trust numbers I
see are consistent everywhere they appear.

## Acceptance criteria

- [ ] **Backend swap, surface intact.** Free-text queries are served by ORE
      `/search/pubkeys` (`relevance-pov`, `pov` = the active POV, default
      `HOUSE_POV.pubkey`). Every story-#2 panel behavior is preserved as pinned by
      T15–T27: live ≥2-char debounced trigger, up to 6 rows with photo/name/address/badge/
      vouch/score chip, encouragement footer, empty & unavailable states, stale-response
      and dismissal guards, identity fast path untouched.
- [ ] **Profile metadata joined client-side.** ORE returns `{pubkey, rank}` only; row
      profile fields come from a kind-0 join over the **story-#1 wide relay set**
      (membership pair + `purplepag.es` + `relay.damus.io`; misses not negative-cached) —
      PO determination O1, 2026-08-05. A profile-less pubkey in the top results renders per
      the story-#1 profile-less row rules (short npub, warning copy, vouchable) rather
      than being dropped.
- [ ] **Score display parity via the rank batch.** Row chips are sourced from ORE
      `/rank/pubkeys` (`graperank-pov`) through the story-#4 batch fetch + cache
      (`fetchHouseTrustScores`), shown as `round(rank × 100)` — PO determination O4,
      2026-08-05. (The `/search/pubkeys` rank is a fused text×WoT relevance float in the
      thousands — it orders results but is never displayed.) Identical `{pubkey, rank}`
      thus yields an identical number in panel and grid, and search results warm the same
      score cache the grids use.
- [ ] **Trust order without re-sort.** Rows render in ORE search's served (rank-desc)
      order; the client-side re-sort of served results is retired with the meili path.
- [ ] **POV seam preserved.** The routine still takes the POV pubkey as a parameter
      defaulting to `HOUSE_POV.pubkey`; story #3 remains a parameter change.
- [ ] **Unavailability with identity prompt.** ORE unreachable/erroring → the "search
      temporarily unavailable" state (retype to retry), whose copy **prompts searching by
      npub, hex pubkey, or nprofile** (the identity path keeps working) — PO determination
      O2, 2026-08-05.
- [ ] **One ORE host.** Both ORE calls (search and the story-#4 rank batch) target
      **`brainstormserver.nosfabrica.com`** via a shared host constant — PO determination
      O3, 2026-08-05. This moves story #4's shipped `/rank/pubkeys` URL off
      `api.brainstorm.world`; **the implementation commit message must call that out.**
- [ ] **No meili-proxy calls remain** on the free-text path (the identity path never used
      it).

## Out of scope

- Personalized POV opt-in (story #3).
- Member-card/grid behavior (#4/#5 — already on ORE; unchanged).
- The LFO swap itself (still config-only via `HOUSE_POV`; runbook in ADR 0042 — its
  ORE-side verification is a listed open question).
- NIP-05 lookup, pagination, and the retired meili envelope fields (`povResolution`
  fallback guard dies with the meili path — ORE has no observer echo to guard on).

## Open questions — all resolved (PO, 2026-08-05)

- **O1 — Metadata join.** ~~Open~~ **Resolved:** story-#1 wide relay set, misses not
  negative-cached (folded into the metadata AC). Exact ORE `limit` and batching mechanics
  stay Architecture's call within that constraint.
- **O2 — Fallback posture.** ~~Open~~ **Resolved:** unavailable state only — no meili
  fallback; the unavailable copy prompts identity search (npub / hex / nprofile).
- **O3 — Host.** ~~Open~~ **Resolved:** `brainstormserver.nosfabrica.com` for both ORE
  calls (probe-verified for personalized search 2026-08-05; `api.brainstorm.world`
  verified as an equivalent mirror the same day and noted as alternate). Story #4's
  shipped rank URL moves — commit message must mention it.
- **O4 — Chip source / score cache.** ~~Open~~ **Resolved:** chips from the `/rank/pubkeys`
  batch via `fetchHouseTrustScores` (grid parity by construction); search thereby warms
  the shared score cache. The fused `/search/pubkeys` relevance float is never displayed.

## Linked artifacts
- ADR: `engineering-team/decisions/0045-search-ore-migration.md` (Accepted 2026-08-05)
- Test plan: (Test Design phase)
- Review: (Review phase)
