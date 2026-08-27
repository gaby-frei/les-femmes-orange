# Review: npub-search #4 (mini) — Member-card trust scores via ORE batch

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-08-02
**Story:** `engineering-team/stories/npub-search/4-member-card-trust-scores.md`
**ADR:** `engineering-team/decisions/0043-member-card-trust-scores-ore-batch.md` (Accepted; PO pre-selected Route B)
**Test plan:** `engineering-team/stories/npub-search/4-member-card-trust-scores.test-plan.md`
**Diff:** story/epic → ADR 0043 + 0042-P15 → red tests (T28–T30) → implementation (`public/index.html` +~60, `tests/npub-search.spec.js` harness default-stub fix)
**Process note:** run under the PO's 2026-08-02 directive — all gates authorized to execute
without per-phase sign-off; roles were still exercised in order with per-phase commits.

## Quality gates (run by reviewer)

- [x] `npx playwright test` — **151/151 pass** (46.7s): T28/T30 red→green, T29 guard green
      throughout, all 148 prior cases (stories #1/#2 + other epics) green.
- [x] `node --test test/*.test.js` — **106/107**; the 1 failure is the pre-existing
      `builder-parity` tapestry-checkout drift already dispositioned in review #2.
- [x] _Lint / typecheck / build: not configured — skipped._

## Spec adherence

- [x] All five ACs covered and passing: chip on every scored card + ×100 conversion +
      single batch (T28), enhancement-only failure (T29), chipless fallback (T30),
      display-only (T28 count assertions + untouched ordering logic in the diff).
- [x] No scope creep: the only non-ADR change is the test-harness default rank stub in
      `openMembers` — necessitated by the plan's own "no live hosts" rule (see finding 1).

## ADR adherence

- [x] `ORE_RANK_API` beside the 0042 constants; `fetchHouseTrustScores(pubkeys, povPubkey =
      HOUSE_POV.pubkey)` — POV seam preserved for story #3; body contract
      `{pubkeys, algorithm: 'graperank-pov', pov}` verbatim; 8 s `AbortController` timeout;
      all failures swallowed (chipless, never an error state); `_houseScoreCache`
      missing-only refetch; `patchGridTrustScores` prepends the story-#2 chip class into
      `.member-footer`, idempotent via existing-chip check; `loadMembersPage` calls it
      **un-awaited** (AC: rendering never blocks).
- [x] No new dependencies; no server code; search path untouched.

## Concept-graph integrity

- [x] No concept definitions touched; no firmware reinstall required.

## Things tests can't catch

- [x] Chips render via `textContent` — no injection surface; `typeof rank === 'number'`
      gates malformed results.
- [x] Re-entrancy: a vouch-triggered `loadMembersPage` re-render is followed by a fresh
      patch pass over the *current* DOM; the freshly vouched pubkey is fetched as a
      cache-miss. Duplicate chips prevented by the existing-chip check.
- [x] `pov` travels in a JSON POST body (not URL) — the review-#2 URI-encoding note does
      not apply to this path.

## Findings

### Blocking

None.

### Non-blocking

1. **`tests/npub-search.spec.js` (openMembers)** — the live-host leak this story surfaced
   (unrouted `/rank/pubkeys` calls escaping to the real ORE host mid-suite) was real: three
   byte-identical tests failed against live data before the default stub landed. The fix
   (flag-coordinated default stub) is sound; noted because it means **pre-#4 suite runs were
   silently network-dependent-adjacent** — worth remembering if flakes are ever bisected.
2. **`public/index.html` (patch fn)** — a server-sent `NaN` rank would render "🏅 NaN"
   (same cosmetic class as review-#2 finding 2; not producible from the documented
   contract).
3. **`_houseScoreCache`** has no TTL expiry — session-lifetime staleness is accepted
   (ADR sub-decision 4; ORE `ttl: 3600` exceeds realistic page sessions). Story #3 should
   revisit if it reuses the cache across POVs (cache is keyed by pubkey only — a POV switch
   must clear or re-key it).

## Verdict

**PASS** — implementation matches the story's ACs, ADR 0043's design, and the test plan;
reviewer-run gates green (one pre-existing environmental unit failure, out of scope).
Finding 3's POV-keying caveat is flagged forward to story #3.
