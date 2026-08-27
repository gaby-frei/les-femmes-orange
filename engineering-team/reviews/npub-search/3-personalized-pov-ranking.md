# Review: npub-search #3 — Community view / My view toggle

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-08-06
**Story:** `engineering-team/stories/npub-search/3-personalized-pov-ranking.md` (determinations 1–4 as revised by the same-day decrowding amendments; O1–O3 resolved)
**ADR:** `engineering-team/decisions/0046-personalized-pov-toggle.md` (Accepted)
**Test plan:** `engineering-team/stories/npub-search/3-personalized-pov-ranking.test-plan.md` (T35–T43 as re-pinned by the decrowding amendment)
**Diff audited:** `6f48dfc..46948ea` — implementation (`49c8435`) + PO-directed decrowding pass (`46948ea`); `public/index.html` +193/−, spec re-pins, story/plan amendments.

## Quality gates (run by reviewer, not trusted)

- [x] `npx playwright test` — **165/165 pass** (1.3m): T35–T43 red→green (through both
      the implementation and the re-pinned decrowding forms), all 156 prior cases green
      including the probe-amended T28.
- [x] `node --test test/*.test.js` — **106/107**; sole failure remains the pre-existing
      `builder-parity` tapestry-checkout drift (dispositioned in reviews #2/#4/#6).
- [x] _Lint / typecheck / build: not configured — skipped._

## Spec adherence

- [x] **Determination 1** (visible-but-disabled + readiness): T36/T37 — enabled only when
      the probe finds `rank > 0`; disabled with the O1 copy **verbatim** for empty,
      all-zero, and failure shapes; probe never blocks rendering (fire-and-forget,
      `public/index.html` `loadMembersPage` tail).
- [x] **Determination 2** (community default, session-only): in-memory `_activeView`,
      never persisted; T42 proves reload resets. No storage writes anywhere in the diff.
- [x] **Determination 3 as revised** (single inline indicator): `— searching as you /
      Les Femmes Orange` after the search header, em dash pinned exactly (T35/T39);
      grid-side indicator asserted **absent** (T35).
- [x] **Determination 4 as revised** (header treatment): typographic siblings + underline
      on both grid headers only, `0px` on the search row (T43 final form).
- [x] **O2** (probe every visit): T38 — including the revisit path via the `showView`
      else-branch (see ADR-deviation note below).
- [x] **O3** (toggle form/placement): pill segmented control between the Telegram banner
      and search bar (T35 DOM-order + centering assertions); disabled treatment on the
      My-view segment; the reference screenshot's "What is this?" link correctly absent.
- [x] **Coherence + no stale numbers:** single `activePovPubkey()` accessor consumed by
      search, chips, and grid sort; switch = panel dismissal + full re-render (T39/T40);
      `(povPubkey, pubkey)`-keyed `_scoreCache` — T41 proves switch-back refetches
      nothing and restores house values exactly.
- [x] **Vouch flows:** untouched code paths; T21/T33/T34 regressions green.

## ADR adherence

- [x] Decisions 1–4 implemented as specified (state/accessor, cache re-key with PO's
      composite-key preference, probe predicate `any rank > 0`, switch behavior).
- [x] **Deviation, judged sound:** ADR Decision 3 assumed the probe rides "every
      `loadMembersPage()` run," but `showView` loads the Members page only once per
      session (`_membersLoaded` guard) — the tests caught the O2 gap and the Implementer
      added the `showView` else-branch re-probe. This *corrects* the ADR's stale
      assumption in favor of the PO's determination; noted here rather than kicked back.
- [x] **Documented drift:** ADR Decisions 5–6 (and part of 7) describe the
      pre-decrowding UI (two indicator lines, bordered search header, uncentered toggle,
      "community mark"). The story's Amendments section is the authority for the final
      form; the ADR was deliberately left as the accepted design-time record. No silent
      contradiction — the story amendment narrates the divergence.
- [x] No new dependencies; probe deliberately bypasses the score cache (per-visit
      freshness) — matches ADR intent.

## Concept-graph integrity

- [x] No concept definitions touched; no firmware reinstall required.

## Things tests can't catch

- [x] Indicator/note text set via `textContent`; avatar via `safePicUrl` + DOM building
      (no injection surface); segment handlers gate on `_myViewReady` server-side of the
      click (`setActiveView` re-checks, so a force-enabled button still no-ops).
- [x] `activePovPubkey()` falls back to the house pubkey when `currentPubkey` is unset —
      a signed-out state can never produce a `pov: undefined` request.
- [x] Race posture: switch → `hideMemberSearchPanel()` bumps `_searchSeq` and aborts
      in-flight search; grid re-render is the same serialized path vouching uses.

## Findings

### Blocking

None.

### Non-blocking

1. **ADR 0046 Decisions 5–7 vs final UI** — the drift is documented in the story's
   Amendments section (see ADR-adherence note); a future reader starting from the ADR
   should follow the story for the as-built UI. Consider a one-line ADR amendment note
   at book close.
2. **Story #3's own carried-forward item is discharged:** the pubkey-keyed-cache hazard
   (reviews #4/#6) is resolved by the composite key — no successor caveat.
3. **`_myViewReady` flip mid-session** (ready → probe-failure on a later visit) disables
   the segment while `_activeView` may still be `'mine'` — the view stays personal with
   the segment disabled. Unreachable in tests, cosmetic in practice (switching back
   always works; community re-enables). Listed for completeness.
4. **`builder-parity`** — unchanged pre-existing disposition (intake recommendation
   stands from review #2).

## Live-preview checklist (CLAUDE.md § How to operate #6)

Behaviors provable only against live hosts + a real browser — verify on the Vercel
preview before treating the story as closed:

1. **Probe CORS + enablement with a provisioned key.** Sign in with the PO account
   (`6db8a13f…`). DevTools → Network: the `POST /rank/pubkeys` probe (body
   `pov: <your hex>`, targets you + the curator) must succeed with no CORS error, and
   the **My view segment should enable** — you are currently the one member whose
   personal WoT is computed. With any unprovisioned key: segment disabled + the note.
2. **Real switch behavior.** Enable My view: grids re-rank and chips change to *your*
   perspective's numbers. Expect subtlety — your WoT largely mirrors the house view
   (probe-record finding), so small chip deltas and mostly-similar order are correct,
   not a bug.
3. **Avatar.** The My-view segment should show your real profile picture (relay-served
   metadata, initials fallback otherwise).
4. **Per-visit probe.** Navigate About → Members: a fresh probe POST each visit
   (Network tab), no reload needed.
5. **Session default.** After switching to My view, hard-reload: Community view active,
   indicator back to "— searching as Les Femmes Orange".
6. **My-view search sparsity.** Search a common name under My view: fewer results than
   Community view is expected (server-side trust floor drops profiles your WoT hasn't
   reached).

## Verdict

**PASS** — the diff implements all nine ACs under the story's final (amended)
determinations, ADR 0046's design with one sound, documented correction and one
PO-directed documented drift; reviewer-run gates green (one pre-existing environmental
unit failure, out of scope).
