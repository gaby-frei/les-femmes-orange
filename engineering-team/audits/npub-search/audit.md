# Build Audit: Npub search (find + attest any Nostr identity)

**Book:** `engineering-team/audits/npub-search/book.md`
**Date:** 2026-08-14
**Branch / commit range:** `feat/npub-search`, `a6d1738..0fec33b` (41 commits, +5031/−76; NOT yet merged to main per PO instruction)
**Provenance:** Acceptance-frame
**Confidence:** high — anchor captured at kickoff; every story ran the full five-phase cycle with a PASS review; live-preview checks PO-confirmed 2026-08-14

## 1. What shipped

- **Identity search + vouch from panel** — paste an npub / 64-hex pubkey / nprofile above the member grids; the resolved identity renders as a candidate row (photo, name, domain-*proven* NIP-05 ✓, membership badge) with a Vouch action publishing the existing kind-39999 LFO attestation — `stories/npub-search/1-identity-search-attest.md`
- **Free-text ranked search** — non-identity input (≥2 chars, live debounced) returns up to 6 profiles ranked by trust from the designated house POV, each row showing its numeric trust chip — `stories/npub-search/2-freetext-search-house-pov.md`, re-based by #6
- **Trust chips on member cards** — every verified/pending card carries the same 0–100 chip, from one batched ORE rank call per page load — `stories/npub-search/4-member-card-trust-scores.md`
- **Trust-ordered grids** — both grids render highest-trust upper-left (POV-agnostic); vouched members slot into rank position from either vouch path — `stories/npub-search/5-trust-ordered-grids.md`
- **Search on production ORE** — free-text matching/ordering by `POST /search/pubkeys` (`relevance-pov`), profiles joined client-side from the wide relay set, chips from the shared rank batch — `stories/npub-search/6-search-ore-migration.md`
- **Community view / My view** — a readiness-gated toggle re-points every trust surface at the signed-in member's own POV; session-scoped, community-default, warm dual-view cache — `stories/npub-search/3-personalized-pov-ranking.md`

## 2. Epics & stories rolled up

### Epic: `npub-search` (execution order #1 → #2 → #4 → #5 → #6 → #3)
| Story | Delivered | Status | Review |
|---|---|---|---|
| #1 identity-search-attest | Decode + wide-relay profile fetch + candidate row + `publishVouch` extraction | Done | `reviews/npub-search/1-identity-search-attest.md` (PASS 2026-07-31) |
| #2 freetext-search-house-pov | 6-row ranked panel, house POV, score chips, panel states | Done | `reviews/npub-search/2-freetext-search-house-pov.md` (PASS 2026-08-02) |
| #4 member-card-trust-scores (mini) | Batch ORE scores + chips on grid cards, session cache | Done | `reviews/npub-search/4-member-card-trust-scores.md` (PASS 2026-08-02) |
| #5 trust-ordered-grids (mini) | Stable per-grid rank sort + sorted vouch placement (amendment) | Done | `reviews/npub-search/5-trust-ordered-grids.md` (PASS + addendum 2026-08-02) |
| #6 search-ore-migration | meili proxy → ORE three-call pipeline; meili path deleted | Done | `reviews/npub-search/6-search-ore-migration.md` (PASS 2026-08-05) |
| #3 personalized-pov-ranking | View toggle, readiness probe, (pov,pubkey) cache, indicators, decrowding pass | Done | `reviews/npub-search/3-personalized-pov-ranking.md` (PASS 2026-08-06) |

ADRs: 0041 (identity search), 0042 (house-POV search; rewritten 2026-08-05 → ORE probe record), 0043 (ORE batch chips), 0044 (grid ordering), 0045 (ORE migration), 0046 (view toggle). Post-close policy commit `0fec33b` (2026-08-14) amends #6/0045 for the settled host.

## 3. As-built inventory

**User-facing** (all in `public/index.html`; Members page, verified-members-gated):
search block (input + dropdown panel: candidate rows, trust chips, loading/empty/unavailable states, identity-encouragement footer); pov-toggle segmented control (bitcoin-mark / avatar segments, disabled note); inline `— searching as …` indicator; trust chips + rank ordering on both grids.

**Domain:** no concept definitions changed across the book; no firmware reinstalls. The attestation write path is the pre-existing kind-39999 LFO tag event (`publishVouch`, extracted in #1 from `applyLFOTag`), unchanged in shape; NIP-51 list remains read-only.

**Data & contracts:**
- ORE (production, `api.brainstorm.world` per settled policy 2026-08-14 — one `ORE_HOST` constant): `POST /search/pubkeys` `{query, algorithm: relevance-pov, pov, limit: 6}` → ordering; `POST /rank/pubkeys` `{pubkeys, algorithm: graperank-pov, pov}` → chips (`round(rank×100)`) + readiness probe (ready ⟺ any rank > 0). Contract references: `docs/open-ranking-ore-algorithms.staging.json`, ADR 0042 § ORE probe record, `NosFabrica/brainstorm_server` source.
- Relays: kind-0 metadata joins over membership pair + `purplepag.es` + `relay.damus.io` (searches: batched, newest-wins, no negative cache; identity path: per-pubkey progressive fan-out + nprofile hints).
- Client caches: `_scoreCache` keyed `(povPubkey, pubkey)`; `_metaCache`/`_metaFetched` (shared, pre-existing); `_activeView` session state.
- Retired: `tags.brainstorm.world` meili proxy off the search path (#6); its contract preserved at `docs/meili-search-proxy-contract.md` (marked pre-#6).
- Tests: `tests/npub-search.spec.js`, T1–T43 (45 cases incl. sub-splits), fully stubbed/offline.

## 4. Deviations from intent

| # | Specified (anchor) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | "horizontal dropdown panel … shortened npub, truncated bio" | Vertical full-width rows, reduced detail (photo, name, address, badge — no bio/npub row) | intentional-change | PO row-format directive 2026-07-31, brainstorm.world reference (ADR 0041 amendments) | Cleaner rows; bio/npub not shown in panel | — |
| 2 | (implied: profile required to attest) | Profile-less candidates ARE vouchable, with ⚠️ warning copy | intentional-change | PO O3 rollback 2026-07-31 (ADR 0041 amendments) | Any valid key vouchable | — |
| 3 | frame silent on NIP-05 trust | ✓ renders only after live `/.well-known/nostr.json` proof | added-beyond-scope | PO option-b 2026-07-31 (ADR 0041) | Impersonation-resistant address display | — |
| 4 | "Backend decided in story #2 (Open Ranking vs NIP-50)" | Decided **twice**: meili proxy (ADR 0042, only backend then serving scores+profiles in one call) → production ORE (ADR 0045) once `/search/pubkeys` personalization went live server-side (2026-08-05 probe) | constraint-discovered → intentional-change | ADR 0042 (probe evidence), ADR 0043 convergence rationale, ADR 0045 | Search, chips, grids share one engine/POV; meili dependency gone | — |
| 5 | "designated house npub … target: official LFO account" | Placeholder (PO's pubkey) still active; swap = one config string | deferred | External provisioning not complete (ADR 0042 swap runbook; PO driving) | Ranking reflects PO's POV until swap | ✔ register #1 |
| 6 | frame bullets 3–4 only (search ranking) | Trust chips on all member cards + trust-ordered grids in BOTH views + sorted vouch placement | added-beyond-scope | PO directives 2026-08-02 (stories #4/#5; ADR 0043/0044 — 0043's "display-only" superseded by 0044) | Grids are trust-ranked even without opt-in — exceeds frame | — |
| 7 | "opt into personalized-POV ranking" | Community/My view toggle: visible-but-disabled gating (rank-probe readiness), session-default community, single inline indicator | interpretation | PO determinations 1–4 + O1–O3 (story #3, 2026-08-06); decrowding pass same day superseded ADR 0046 Decisions 5–7 UI details (story amendments are authority; PO declined ADR edit) | Opt-in is per-session, only for provisioned members | ✔ register #2 |
| 8 | "repurposes the deployed brainstorm.world search page" | UX repurposed (suggestion flow, POV pill); backend intentionally diverged from the tapestry R&D stack to production ORE | interpretation | Settled policy 2026-08-14 (CLAUDE.md § Brainstorm Hosts): tapestry = R&D, nosfabrica = production; #6 retroactively aligned with it | Consistency with brainstorm.world ranking | — |
| 9 | (host unstated) | `ORE_HOST` chose `brainstormserver.nosfabrica.com` (#6 O3), reversed post-close to `api.brainstorm.world` | constraint-discovered | LFO weekly meeting notes → settled policy 2026-08-14 (`0fec33b`); one-string change by design | None (same backend) | — |

**Undocumented work** — diff vs docs gap: none found beyond commit-documented test-harness fixes (default stubs added when #4's live-host leak surfaced — noted in review #4; T22 click-target and T41 fixture adjustments — noted in commits/reviews). The GrapeRank probe-rationale error in ADR 0046 (curator-target justification argued from the vouch graph; GrapeRank actually uses FOLLOWS/MUTES/REPORTS) is a **known documentation defect, PO-ruled to stand uncorrected** — superseded in practice by CLAUDE.md settled policy and register #2.

## 5. Quality state at close

- Test gate (run at close): Playwright **165/165**; unit **106/107** — the 1 failure is `test/builder-parity.test.js`, pre-existing `tapestry/` checkout drift (module removed upstream), dispositioned in reviews #2/#4/#6 → register #3.
- Live-preview checks: all six story-#3 items + post-host-flip CORS confirmed by the PO, 2026-08-14.
- Accepted behaviors (documented, not bugs): cold-cache grid re-order on score arrival (ADR 0044); free-text time-to-rows bounded by slowest relay ~6 s when a result has no kind-0 anywhere (ADR 0045 / review #6); My-view search sparsity from the server-side trust floor (ADR 0046); "NaN-rank renders 🏅 NaN" cosmetic class, not producible from the documented contract (reviews #2/#4/#5).
- Debt rolled up from ADR Consequences: ORE responses carry no observer echo — personalization unverifiable from the response (accepted; discharged when register #2 lands); grid/search latency profiles as above.

## 6. Carry-forward register

- [ ] **LFO house-account swap** — external: brainstorm customer registration + LFO-signed kind-10040 + one UI sign-in; then edit `HOUSE_POV.pubkey` (one string). Runbook: ADR 0042 sub-decision 4. (§4 #5)
- [ ] **Adopt the ORE personalization-status message** when the production contract ships it — retires story #3's rank-probe heuristic, makes POV fallback detectable from responses, moots the ADR 0046 curator-rationale defect. Tracked: `stories/_intake.md` 2026-08-14 entry; preview R&D-siloed at `tapestry.brainstorm.world/developers/open-ranking`. (§4 #7)
- [ ] **`builder-parity` unit test** — re-pin the `tapestry/` checkout or retire/re-point the test (its upstream module vanished). Recommended since review #2.
- [ ] **NIP-05 identifier input** (`name@domain` → search) — deferred by ADRs 0041/0042/0045; natural next search story.
- [ ] **Pagination / full results page** — panel caps at 6 by design (story #2 O1); brainstorm parity would add "press Enter for full results".
- [ ] **Feed personalization** — story #3 scoped to the Members page only; the feed never consumes trust scores.
- [ ] **Operator asks** — observer-echo field on ORE responses (subsumed by register #2 if the status message ships); LFO-POV verification on ORE once provisioned.
