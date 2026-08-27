# Test Plan — npub-search #3: Community view / My view toggle

**Story:** `engineering-team/stories/npub-search/3-personalized-pov-ranking.md`
**ADR:** `engineering-team/decisions/0046-personalized-pov-toggle.md`
**Date:** 2026-08-06
**Spec:** `tests/npub-search.spec.js`, new describe block 4 (T35–T43); story-#4 T28 amended
(see below). `bigGridSetup`/`gridNames` fixtures hoisted to module scope for reuse.

## Approach

All three backend calls on `**/rank/pubkeys` (community chip batch, My-view chip batch,
readiness probe) hit one stub — fixtures discriminate by the POSTed `pov`, exactly as the
ADR prescribes. New helper `stubPovRankApi(page, byPov)`: `byPov` maps
`povHex → { pubkeyHex → rank }`; a request returns entries only for pubkeys present in its
POV's map (an explicit `0` entry IS returned — that's how the two server generations are
simulated: absent = deployed-style empty, `0` = main-style zero-fill). The readiness probe
is recognizable by its body: `pov === ME` with `pubkeys ⊇ {ME, CURATOR}`.

DOM contract pinned by this spec (from ADR Decisions 5–7): `.pov-toggle` (segmented,
between `.telegram-row` and `.member-search`) with two `role="radio"` `.pov-segment`
buttons ("Community view", "My view"; active = `aria-checked="true"`);
`.pov-disabled-note` carrying the O1 string verbatim; `.pov-indicator` lines under the
search label and in the verified-members header; header parity via computed styles.

## Cases

| # | Case | AC / determination |
|---|---|---|
| T35 | Toggle renders between Telegram banner and search bar (DOM order pinned); Community view active by default; indicators read "searching as Les Femmes Orange" / "viewing as Les Femmes Orange" | Determinations 2, 3; O3 placement |
| T36 | Ready member (probe returns rank > 0): My view enabled, no disabled note; probe request contract pinned (`algorithm: graperank-pov`, `pov = member`, `pubkeys ⊇ {member, curator}`) | Determination 1; ADR Decision 3 |
| T37 | Three not-ready shapes — empty results (deployed server), all-zero results (main server), probe network failure — each: My view disabled + O1 copy **verbatim**; page renders normally (grids + vouch intact) | Determination 1; O1; enhancement-only AC; ADR robust predicate |
| T38 | Probe fires on every Members-page visit: navigate away and back → second probe call | O2 |
| T39 | Switch to My view: verified AND pending grids re-rank to member-POV order (fixtures make it differ from house order in both grids), chips swap to member-POV values, indicators flip to "…as you" | Switching re-ranks everything; determination 3 |
| T40 | Open search panel dismissed on switch; next search POST carries `pov = member` (and pre-switch search carried `pov = house`); row chips from member-POV ranks | Coherence incl. mid-switch; My-view search |
| T41 | Switch back: house order/chips/indicators restored; **zero additional house-POV rank fetches** across the whole dance (composite cache stays warm — PO re-key preference observable from outside) | Switching back restores; no stale numbers |
| T42 | Reload after switching → Community view active again | Session default (determination 2) |
| T43 | "Find someone on Nostr" and "Verified Members" headers: identical computed font family, size, weight, alignment | Determination 4 |

**Amendment to story #4 (T28):** "exactly one batch request per load" becomes "exactly one
**chip-shaped** batch request per load" — probe-shaped calls (`pov = member` with the
member+curator target set) are excluded from the count. Green before implementation
(nothing matches the probe shape yet) and after (the probe is filtered out). Recorded in
the #4 test plan.

## Expected initial state

T35–T43 RED against the current build (no `.pov-toggle`, no indicators, no probe, single
POV) — failures behavioral (elements not found, probe never fires, order unchanged).
T1–T34 (including amended T28) stay green.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

## Verification

Red run confirmed 2026-08-06 at `4d078d8` (`npx playwright test tests/npub-search.spec.js`):

```
8 failed
  › toggle renders after the Telegram banner; community default; indicators say Les Femmes Orange
  › ready member: My view enabled; probe request contract pinned
  › not ready — empty, all-zero, or probe failure → disabled segment + verbatim copy; page intact
  › readiness probe fires on every Members-page visit
  › switching to My view re-ranks both grids, swaps chips, and flips the indicators
  › switch dismisses an open panel; searches then run from the member POV
  › switching back restores the house view; composite cache keeps house scores warm
  › the view choice does not survive a reload — community default every session
37 passed (2.0m)
```

Failures behavioral (no `.pov-toggle` in the DOM, no probe traffic recorded, order
unchanged). T1–T34 green, including amended T28.

## Amendment — decrowding pass (PO, 2026-08-06, post-implementation preview)

The PO's visual decrowding pass re-pinned four cases in the same standalone change:
**T35** now asserts the single inline indicator (`— searching as …`, header-level,
exact-match with the em dash), the **absence** of any grid-side indicator, and the
toggle's horizontal centering; **T39/T42** drop the grid-indicator assertions and pin
the inline copy; **T43** (retitled) pins the final asymmetric header spec — typographic
siblings, 1px underline on the verified AND pending header rows, `0px` on the search
header row. Suite green post-pass (45/45 spec, 165/165 full).

**T43 finding + gate resolution:** the original font/size/weight/alignment check passed
against the current build — those properties already matched (story-#1 styling per the
PO's 2026-07-31 directive). Flagged at the gate; **PO clarified determination 4: the
search header gets the same bordered-row treatment** (`.members-section-header` row) as
the "Verified Members" heading. T43 amended accordingly — it now pins the search label
inside a `.members-section-header` row with computed border/padding/margin equal to the
members header's, plus the original typographic parity. Re-verified red (9th failure).
