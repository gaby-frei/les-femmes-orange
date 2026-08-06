# ADR 0046: Community view / My view — session view state, composite-keyed score cache, rank-probe readiness

**Status:** Accepted (PO, 2026-08-06)
**Date:** 2026-08-06
**Story:** `engineering-team/stories/npub-search/3-personalized-pov-ranking.md`
**Builds on:** ADR 0042 (POV-as-parameter seam), 0043 (batch scores + cache), 0044
(POV-agnostic grid ordering), 0045 (ORE pipeline; one host).

## Context

The story is fully determined (PO determinations 1–4, O1–O3). Every trust surface already
takes a POV parameter defaulting to `HOUSE_POV.pubkey`; this story adds a session-scoped
view switch pointing that parameter at the signed-in member, a readiness gate, indicator
copy, and header parity.

**Concept graph:** `localhost:8877` unreachable at design time (as for ADRs 0041–0045); no
concept definitions change; no firmware impact.

**Server-source findings (`NosFabrica/brainstorm_server`, `app/routers/open_ranking/`,
read 2026-08-06 per the story's reference note)** — three load-bearing facts:

1. **The "empty = unprovisioned" heuristic is not deployment-stable.** On `main`,
   `rank.py` builds **one result per requested pubkey with `rank: 0.0` for unknown /
   missing influence** — it cannot return an empty array for a non-empty request. The
   deployed host's observed silent-empty for unprovisioned POVs is therefore an older
   server generation; after the next deploy the same probe will return all-zero entries
   instead of `[]`. A readiness check keyed on "non-empty" would go permanently green for
   everyone. **The robust predicate is: ready ⟺ any returned `rank > 0`** — correct under
   both server generations.
2. **Search's silent empty is explained and stable:** `search.py` passes
   `include_zero_score_results=False` and a `min_rank` floor (observer-influence×100 < 2
   is dropped) — under an unprovisioned observer every profile has zero trust, so all
   matches are filtered out. Corollary: a *thin but real* personal WoT will return
   **sparse** My-view search results (matches below the floor drop out). The story
   accepts this ("sparse results are acceptable").
3. **Chips-from-`/rank/pubkeys` is confirmed as the intended client pattern:** `search.py`
   comments that its returned rank is the Vespa relevance (text × trust) and explicitly
   "NOT the 0–100 Trusted-Assertions GrapeRank value (clients get that from
   /rank/pubkeys)" — validating story #6's O4 split.

**Existing seams** (`public/index.html`, line refs at `45057e9`): `HOUSE_POV.pubkey`
(~1953); `runFreetextSearch(query, seq, povPubkey = HOUSE_POV.pubkey)` (~2860);
`fetchHouseTrustScores(pubkeys, povPubkey = HOUSE_POV.pubkey)` + pubkey-keyed
`_houseScoreCache` (~2955); `patchGridTrustScores` (chip patch + POV-agnostic grid sort,
~2985); `loadMembersPage` (~2700); UI anchors: `.telegram-row` (~1650),
`.member-search` block with `.member-search-label` "Find someone on Nostr" (~1652),
`#verified-members-section` header h2 "Verified Members"; `currentPubkey` (signed-in hex).

## Options considered

### Option A — Session view state + composite-keyed cache + full-page re-render on switch *(chosen)*

One in-memory `_activeView` ('community' | 'mine', default 'community'); one accessor
resolves the active POV pubkey; a switch dismisses the search panel and re-runs
`loadMembersPage()`; the score cache re-keys to `(povPubkey, pubkey)`.

Pros: coherence by construction — every surface reads the same accessor, and the page
repaints as one unit (the exact mechanism vouch flows already use), so no mixed-POV
frame is reachable; in-memory state = session-default-community for free (determination
2); composite keying keeps both views warm (PO preference — switch-back is instant and
byte-equivalent, satisfying the restore AC); re-render is cache-warm except one batch
POST the first time My view is entered.
Cons: switching visibly repaints the grids (brief loading state on first switch);
an open search panel is dismissed rather than re-queried (accepted: retyping re-runs
under the new view; never shows stale-POV rows).

### Option B — Surgical per-surface re-skin on switch (no full re-render)

Re-sort cards and swap chips in place under the new POV; re-run the open search query.
Pros: no repaint flicker. Cons: three surfaces × in-flight states = exactly the
mixed-perspective frames the coherence AC forbids, each needing its own guard; duplicates
the re-render path that already exists and is regression-tested. Rejected.

### Option C — Readiness via relay lookup (kind-10040 exists?)

Pros: no ORE dependency for the gate. Cons: proves a delegation event was published, not
that scores are computed and serviceable end-to-end — and it cannot see the `min_rank`
floor reality. The `/rank/pubkeys` probe **is** the end-to-end truth, on the endpoint the
page already calls. Rejected.

## Decision

**Option A**, with these specifics:

1. **View state:** module-level `_activeView = 'community'`; `activePovPubkey()` returns
   `HOUSE_POV.pubkey` for community, `currentPubkey` for mine. Per-tab, in-memory, never
   persisted (determination 2). Every POV default in the trust pipeline
   (`runFreetextSearch`, score fetch, grid patch) moves from `HOUSE_POV.pubkey` to
   `activePovPubkey()`.
2. **Cache re-key (PO preference):** `_houseScoreCache` → `_scoreCache`, key
   `` `${povPubkey}:${pubkey}` ``; `fetchHouseTrustScores` → `fetchTrustScores(pubkeys,
   povPubkey)` (same miss-only batch, same swallow-all-failures posture). Both views'
   scores coexist; no clearing on switch.
3. **Readiness probe:** `probeMyViewReadiness()` — fire-and-forget on every
   `loadMembersPage()` run (O2), no await by the render path. One
   `POST ORE_RANK_API {pubkeys: [currentPubkey, CURATOR_HEX], algorithm:
   'graperank-pov', pov: currentPubkey}`. **Ready ⟺ any `result.rank > 0`**
   (source-informed predicate, robust across server generations — empty array, all-zero
   array, and error all mean not-ready). Result updates the toggle's disabled state in
   place; probe failure leaves it disabled with the O1 copy (enhancement-only AC).
   `CURATOR_HEX = b8a9df82…` (primary curator — the pubkey every member's trust chain
   reaches; the member's own pubkey is included as the second target).
4. **Switch behavior:** segment click (enabled only) → `_activeView` set →
   `hideMemberSearchPanel()` (no stale-POV rows can remain) → `loadMembersPage()`
   (grids re-render; sort + chips resolve through `_scoreCache` under the new POV) →
   indicator copy updates. First entry into My view costs one rank-batch POST; all
   subsequent switches are warm.
5. **Toggle UI:** `.pov-toggle` segmented control between `.telegram-row` and
   `.member-search` — two `role="radio"` buttons on a rounded track, active = raised
   white pill (LFO palette): "Community view" (left, leading community mark) and
   "My view" (leading avatar from `_metaCache.get(currentPubkey)`, initials fallback).
   Disabled My-view segment: `disabled` attribute + the O1 string rendered as small copy
   directly below the control (visible, not hover-only — testable and touch-friendly):
   "My view isn't available for your account yet."
6. **Indicator copy (determination 3):** small orange lines — `.pov-indicator` — under
   the "Find someone on Nostr" label: "searching as **you** / **Les Femmes Orange**",
   and under the "Verified Members" h2: "viewing as **you** / **Les Femmes Orange**";
   text switches with `_activeView`. Rendered by the same code path that applies the
   view (no drift between state and label).
7. **Header parity (determination 4):** `.member-search-label` and
   `.members-section-header h2` unified to identical font family, size, weight, and
   alignment — one shared rule (implementation picks the target scale; visual intent:
   the two headers read as siblings).
8. **Vouch flows:** untouched — they re-render/patch through the same pipeline, which now
   resolves the active POV; the story-#5 sorted-placement behavior operates under
   whichever view is on.

## Consequences

- Coherence is structural: one accessor, one repaint path — the mixed-POV frame the AC
  forbids has no code path that could produce it.
- Switch-back is instant and byte-equivalent (warm composite cache) — restore-parity AC
  satisfied by construction.
- The readiness gate survives the pending server-generation change (empty → zero-filled
  responses) without a client update — the probe predicate was designed against `main`,
  not against the currently deployed behavior.
- My-view search can be sparse (server-side trust floor) — accepted by the story; the
  #2/#6 empty state covers the zero-result case.
- `_houseScoreCache`/`fetchHouseTrustScores` names retire; reviews #4/#6 references are
  historical.
- One new external fact baked in: `CURATOR_HEX` as a probe target (stable — the trust
  chain's root tagger; revisit only if the community re-roots).
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html`; line refs at `45057e9`.

- **Constants** (~1953): add `CURATOR_HEX`; `HOUSE_POV` unchanged (community accessor
  reads it).
- **State + accessor** (near the search controller): `_activeView`,
  `activePovPubkey()`, `_myViewReady` (bool, default false), `setActiveView(view)`
  implementing Decision 4.
- **`fetchTrustScores(pubkeys, povPubkey)`** (rename/re-key of ~2955): cache key
  `` `${povPubkey}:${pk}` ``; callers pass `activePovPubkey()` (grid patch,
  `runFreetextSearch` chips leg).
- **`runFreetextSearch`** (~2860): default `povPubkey = activePovPubkey()`.
- **`probeMyViewReadiness()`** (new, near `fetchTrustScores`): per Decision 3; updates
  `_myViewReady` + toggle DOM; called (not awaited) from `loadMembersPage`.
- **Markup** (~1650): `.pov-toggle` block per Decision 5; indicator elements per
  Decision 6 (one under the search label, one in the verified-members header).
- **CSS:** `.pov-toggle` track/pill/disabled styles (LFO palette); `.pov-indicator`
  (small, orange — `var(--orange)` family); header-parity rule per Decision 7.
- **Tests** (Test Design): the readiness probe and chip batches share the
  `**/rank/pubkeys` glob — fixtures discriminate by POSTed `pov` (probe/My-view calls
  carry `pov: <member>`; community calls carry `pov: <house>`). Cases to pin: ready
  (some rank > 0) enables; all-zero, empty, and probe-failure each leave disabled +
  O1 copy verbatim; session default (fresh load → community); switch → grids re-ranked
  under member-POV fixtures ≠ house order, chips swap, indicator copy swaps, search
  POST carries member pov; switch-back restores house order; panel dismissed on switch;
  header-parity via computed styles; probe fires per Members-page visit (call count).

## Out of scope

- Any provisioning journey; cross-session persistence (story Out of scope).
- Personalizing non-Members surfaces (feed).
- ORE authenticated mode (`forced_observer`/NWT) — the server can override `pov` for
  authenticated callers; we send unauthenticated requests and ignore this path.
- Reacting live to the server-generation change beyond the robust predicate (no
  version sniffing).
