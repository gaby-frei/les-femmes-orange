# ADR 0047: Unavailable-POV refusals — client-first handling of the ORE-01 contract

**Status:** Proposed (outside contribution — wds4 / NosFabrica rollout; awaiting PO)
**Date:** 2026-08-15
**Intake:** `engineering-team/stories/_intake.md` — 2026-08-14 entry ("Adopt the ORE
personalization-status message") and its 2026-08-15 follow-up
**Builds on:** ADR 0042 (POV-as-parameter seam), 0043 (batch scores + cache), 0045 (ORE
pipeline; one host), 0046 (view state, composite cache, rank-probe readiness)

## Context

Upstream, ORE-01 gains an "Unavailable pov" subsection (Open-Ranking/protocol PR #9,
maintainer-endorsed direction from issue #8): a provider that cannot serve a personalized
algorithm for the supplied `pov` MUST answer `422 Unprocessable Content`, MUST NOT silently
substitute another point of view, SHOULD say why in `X-Reason` (the reason is also mirrored
into `body.error`), and answers `202` + `Retry-After` when the pov is supported but scores are
still being computed. The NosFabrica provider (`api.brainstorm.world`, the app's primary ORE
host per the 2026-08-14 settled policy) is adopting this contract with an explicit
**client-first ordering**: LFO learns the error before the provider starts emitting it,
otherwise users get hard failures the day the provider flips.

Today's deployed provider answers a refused pov with silent zeros/empties: search returns `[]`
(zero-trust hits fall below the min-rank floor), rank batches return `rank: 0.0` rows. The app's
three personalized surfaces (`runFreetextSearch`, `fetchTrustScores`, `probeMyViewReadiness`)
were built against that behavior — ADR 0046's "any rank > 0" probe predicate is the
workaround-shaped readiness gate the new contract makes explicit.

Constraints:

- **Both server generations must work.** The change ships before the provider flips, so every
  new branch is dormant against today's 200s and must not alter any 200-path behavior
  (T15–T43 stay green unmodified).
- **`X-Reason` is not readable cross-origin yet** — the provider does not CORS-expose it
  (`Access-Control-Expose-Headers` absent). The body mirror is the reliable channel; older
  generations answer FastAPI `{"detail": …}`.
- **Never-substitute applies to the client too:** global numbers must never be rendered under a
  personalized label (ADR 0043/0046 cache honesty), and a refusal must never be rendered as
  "no matches".

## Options considered

### Option A — Catch 422/202 on all three surfaces; explicit global fallback; sticky-422 *(chosen)*

On `422`/`202` from a personalized call: extract the reason (`body.error` → `body.detail` →
`X-Reason`), surface it (search-panel note / pov-indicator wording / disabled-note suffix), and
re-request the endpoint's **global default** algorithm (`relevance` / `graperank`) with **no
`pov`**. A `422` marks the pov unavailable for the session (later calls skip straight to the
global algorithm; the readiness probe clears the member's own mark when scores land); a `202`
falls back for that call only, so the personalized retry happens naturally. Fallback scores
cache under a `global:` namespace, never under the refused pov's key.

- **Pros:** implements the spec's client duty verbatim (surface + explicit fallback); dormant
  against today's provider; degrades a refusal into the informative version of what users see
  today (network-default results, honestly labeled); no polling loops against a refusing host.
- **Cons:** session-sticky 422 for the house pov has no un-stick probe (page reload recovers);
  copy is developer-flavored where the server's reason is quoted verbatim (PO can re-word).

### Option B — Gate on contract status alone; retire the rank>0 probe now

- **Cons:** today's production provider emits no contract status — the toggle would never
  enable for anyone until the provider flips; the intake entry (2026-08-14) explicitly holds
  this until the contract reaches production. Deferred, not rejected — it is the planned
  follow-up once the provider is live.

### Option C — Treat 422 like today's generic failure (message only, no fallback)

- **Cons:** "Search is temporarily unavailable — keep typing to retry" is a lie for a
  definitive refusal, invites retry-hammering, and drops the spec's usable-alternative
  guidance on the floor. Rejected.

## Decision

**Option A.** Specifics:

1. **Shared state + helpers** (`public/index.html`, above the trust-score section):
   `_povUnavailable` (`povPubkey → reason`, 422-only, session-scoped),
   `notePovUnavailable(pov, status, reason)` (sticky only for 422; refreshes the pov UI),
   `oreRefusalReason(resp)` (generation-robust: `body.error` → `body.detail` → `X-Reason`).
2. **`runFreetextSearch`:** known-refused pov skips straight to the global request; a fresh
   `422`/`202` records/derives the reason and falls back; the panel renders a
   `.member-search-fallback-note` — `⚠️ <reason> — showing network-default results instead.` —
   above the fallback rows. A refusal never renders the empty state.
3. **`fetchTrustScores`:** same catch; fallback batch uses `algorithm: 'graperank'` (no pov);
   results cache under `global:<pubkey>` so perspectives never mix; chips render from the
   fallback values.
4. **`probeMyViewReadiness`:** `422` → definitive not-ready, reason into the disabled note
   (`My view isn't available for your account yet — <reason>`); `202` → not-ready with the
   still-computing reason (transient, `_myViewPendingNote`); `ready` still requires any
   rank > 0 on a 200 (interim heuristic per the 2026-08-14 intake), and readiness clears the
   member's sticky mark.
5. **Honest labeling:** while the active pov is marked unavailable, the search indicator reads
   `— <who>'s view is unavailable; searching network-wide` instead of `— searching as <who>`.

## Consequences

- The day production starts refusing, LFO degrades gracefully: reasons on screen, explicit
  global results, no hard failures — the client-first half of the NosFabrica rollout is done.
- Staging (`brainstormserver-staging.nosfabrica.com`) does not serve the current house pov
  (probe 2026-08-15: all-zero ranks), so once the provider change deploys there, staging
  exercises the 422 path with the real house pov — useful for verification, worth knowing.
- The rank>0 heuristic survives until the contract is live in production; retiring it
  (gating on contract status alone) is the standing intake follow-up and re-pins T36–T38.
- `HOUSE_POV` remains the PO-account placeholder; a refusal of the house pov is now visible
  instead of silent — the ADR 0042 swap runbook is unaffected.
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html` (line refs at this change): helpers + `_povUnavailable` above the
trust-score section; `runFreetextSearch` refusal branch + panel note; `fetchTrustScores`
namespace switch; `updatePovUi` indicator + disabled-note wording; `probeMyViewReadiness`
422/202 branches; `.member-search-fallback-note` CSS beside the panel-state styles.

**Test coverage** (`tests/npub-search.spec.js`, T44–T49): search 422 → reason verbatim +
explicit global re-request (no `pov`) + rows render + empty state never used; search 202 →
fallback this call, personalized retries next call; rank-batch 422 → global chips + indicator
drops the personalized claim; probe 422 → disabled note carries the reason, house view
untouched; probe 202 → still-computing note; 422 stickiness → exactly one personalized attempt
per session. T15–T43 pass unmodified (dormancy). Full suite: 171/171.
(`test/builder-parity.test.js` fails identically on the base branch — pre-existing, untouched.)

## Out of scope

- Retiring the rank>0 readiness heuristic / gating on contract status alone (blocked on the
  provider contract reaching production — 2026-08-14 intake entry).
- Provider-side work (`nosfabrica/brainstorm_server`): the 422/202 emission, X-Reason
  CORS exposure, and capability-doc-derived reasons live there.
- Copy polish of surfaced reasons (PO pass); house-pov un-stick without reload.
