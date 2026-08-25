# ADR 0047: Unavailable-POV refusals — client handling of the ORE-01 contract

**Status:** Accepted (PO, 2026-08-25) — revised in place for story #7
**Original:** Proposed 2026-08-15 — outside contribution, W David Strayhorn (NosFabrica), for PR #1 / branch `pr-1`. Never accepted, never landed.
**Revised:** 2026-08-25 — Architecture phase of `npub-search` #7, per PO instruction to edit in place rather than supersede. **Where this ADR conflicted with the approved design guide, the design guide won.**
**Story:** `engineering-team/stories/npub-search/7-my-view-availability-states.md`
**Book:** `engineering-team/audits/pov-availability/book.md` (PRD-backed)
**Builds on:** ADR 0042 (POV-as-parameter seam), 0043 (batch scores + cache), 0045 (ORE pipeline; one host), 0046 (view state, composite cache, rank-probe readiness — **this ADR retires its Decision 3**)
**Product sources:** `product-team/prd/pov-availability.md` §5.1 rows 2–3, §5.3; `product-team/guides/pov-availability-design-guide.md`; `product-team/guides/pov-availability-style-guide.md`

## Context

The provider (`api.brainstorm.world`, per the 2026-08-14 settled host policy) no longer answers a personalized request for a perspective it cannot serve with silent zeros. It refuses: `422` with a reason, or `202` with a retry estimate while scores are being computed. It never substitutes another point of view.

**Concept graph:** API at `localhost:8877` unreachable at design time, and `docker` is not installed on this host — the same condition recorded by ADRs 0041–0046. The story touches no concepts: no definition is added, changed, or removed, and no firmware reinstall is implied. Membership remains the kind-39999 vouch closure; trust scores stay a display lens outside it.

### Premises from the original draft that have since expired

Recorded because the original text argued from them, and both are now false. Re-probed on the live production host 2026-08-24 and again 2026-08-25:

| Original premise | Verified state |
|---|---|
| "LFO learns the contract FIRST… every new branch is dormant against today's 200s" | **Expired.** Production refuses today. These are live paths, not advance preparation. Any member with an unregistered perspective reaches them now. |
| "`X-Reason` is not readable cross-origin — the body mirror is the reliable channel" | **Expired.** `access-control-expose-headers: X-Reason, Retry-After` with `access-control-allow-origin: *`, present on the 422 itself. |

### Contract as measured, not as documented

```
POST /rank/pubkeys  {pubkeys, algorithm: 'graperank-pov', pov}
  200 → {results:[{pubkey,rank}], ttl}      the perspective was served
  422 → {error: "<reason>"} + x-reason      no scores, none scheduled
  202 → (unverified) + retry-after          scheduled, still computing
```

Three measured details the original draft did not have:

1. **The 422 body carries `error` only** — no `detail`. Older generations answered FastAPI's `{"detail": …}`, so a fallback chain is still worth keeping, but `error` is the live shape.
2. **`Retry-After` is absent from the 422.** It is advertised in `access-control-expose-headers` but only ever accompanies the 202. Reading it on a refusal is dead code.
3. **The 202 is not producible from outside.** It requires a perspective in the scheduled-but-not-computed window, and we hold no key in that state. Everything below concerning 202 is written from the contract, not from an observation — see Consequences.

### Why the readiness inference has to go

ADR 0046 Decision 3 gated My view on `any rank > 0` across two probe targets. It was the only signal available: an unservable perspective and a servable one both answered `200`, distinguishable only by their values. It carried two costs.

- **It could not say *why*, or *not yet*.** Both collapse into "not ready," which is why the shipped copy is a bare fact with no cause.
- **It produced false negatives.** A genuinely provisioned perspective that happens to score both probe targets at zero reads as unavailable. Rare, but wrong, and undetectable from the response.

The provider now distinguishes these itself.

## Options considered

### Option A — Read the provider's status; keep the reason out of scope entirely *(chosen)*

Readiness is the status code. `200` ⇒ served ⇒ ready, with no inspection of the values. `422` ⇒ unavailable. `202` ⇒ preparing, with an interval derived from `Retry-After`. The reason string is extracted inside a logging function that returns nothing, so no renderable copy of it ever exists in the UI layer.

- **Pros:** the acceptance criterion "no provider-authored text appears anywhere" becomes a structural property rather than a rule someone must remember; removes the false-negative class; the three states map one-to-one onto the three copy lines the design guide specifies.
- **Cons:** trusts the contract's never-substitute guarantee (accepted — PRD §11 Q6); the 202 branch ships unverified against a live provider.

### Option B — Keep `rank > 0` on the 200 path as a belt-and-braces check

- **Cons:** preserves the false-negative class for no benefit. Under the new contract a `200` already means the perspective was served; re-deriving that from the values can only disagree with the provider, and when it disagrees it is wrong. Rejected.

### Option C — Surface the provider's reason, as the original draft proposed

- **Cons:** reversed by the approved design guide. The reason names an algorithm, quotes a 64-character key, and links an operator to a provisioning console. The style guide bans each independently. Rejected on PO instruction, 2026-08-25.

## Decision

**Option A.** Scope is **the member's own perspective only** — the community-refusal path, the preference order, and the search/rank-batch fallbacks belong to stories #8 and #9 and are marked deferred below, not deleted.

1. **Readiness is the status, not the values** (`probeMyViewReadiness`, `public/index.html:3111`).

   | Response | State | Note shown |
   |---|---|---|
   | `2xx` | ready | none; clears any recorded state for that perspective |
   | `422` | unavailable | registration cause |
   | `202` | preparing | the wait, with an interval |
   | network error / other | not ready | none — enhancement-only, as today |

   The `rank > 0` test is deleted. **ADR 0046 Decision 3 is retired.**

   *The request shape is unchanged* (`[currentPubkey, CURATOR_HEX]`). The targets no longer bear any weight — nothing reads their values — so the choice is now arbitrary. Keeping it holds the diff small and avoids an unverifiable change to a live call. Reducing the probe to `[currentPubkey]` is a safe later simplification, deliberately not taken here.

2. **The reason string never enters the UI layer.** The original `oreRefusalReason(resp)` returned a string; it is replaced by

   ```
   logPovRefusal(povPubkey, status, resp) → Promise<void>
   ```

   which extracts (`body.error` → `body.detail` → `X-Reason`, generation-robust) and `console.warn`s, and **returns nothing**. There is no expression in the UI layer that evaluates to provider text, so the criterion cannot be violated by accident.

3. **Perspective state is a map, written by one caller in this story.**

   ```
   _povState: Map(povPubkey → { state: 'unavailable' | 'preparing', retryAfterSeconds: number|null })
   ```

   Only the member's own perspective reads or writes it here. The general shape is introduced now because story #8 adds the community perspective as a second key with no refactor. **No behavior is added by the generality** — a scope judgment recorded for the Reviewer.

   **Stickiness is not introduced.** The probe already runs on every Members-page visit (ADR 0046, PO O2), so a refusal is naturally re-asked each visit. The original draft's session-sticky `422` addressed the *other* surfaces re-hammering a declining provider within a visit; that concern is story #9's, and implementing it here would be scope creep.

4. **Interval derivation** (story D1). `Retry-After` is delta-seconds or an HTTP-date (RFC 9110); parse numeric first, then `Date.parse`, then give up. Convert to seconds ahead of now, then bucket:

   | seconds | renders |
   |---|---|
   | `< 90` | `a minute` |
   | `< 600` | `about {n} minutes`, `n = max(5, round(s/60 ÷ 5) × 5)` |
   | `< 5400` | `about an hour` |
   | otherwise | `about {n} hours`, `n = round(s/3600)` |
   | absent, unparseable, `≤ 0` | *no interval* — the story's criterion-3 wording |

   The `max(5, …)` floor is what keeps a 100-second wait from rendering as "about 0 minutes."

5. **The dimmed segment keeps its explanation.**
   - `aria-disabled="true"` replaces the `disabled` property, so the segment stays in the tab order; `setActiveView` returns early for a segment that is not ready, since `aria-disabled` does not block native activation.
   - `aria-describedby="pov-disabled-note"` on the My view segment while a note exists, so the reason arrives with the control rather than as a stray line.
   - The note element becomes **persistent** in the DOM with `role="status"` and `aria-live="polite"`, hidden by a class when there is nothing to say.

   **This last point departs from the design guide as originally written**, which specified that the element be removed rather than emptied. The guide's intent — no ghost gap — is preserved by `display: none`. The mechanism changes because a live region that is destroyed and recreated does not announce reliably, and announcing is what the guide's own accessibility baseline requires. **PO-ratified 2026-08-25; the design guide has been amended to match.**

6. **Copy** comes from the design guide verbatim and is not restated here. `updatePovUi` (`public/index.html:3070`) remains the single place view state reaches the UI, so state and labels still cannot drift.

## Consequences

- The day-one behavior change is real and immediate: production already refuses, so members with unregistered perspectives see the new cause the moment this ships. This is not advance preparation.
- **The false-negative class disappears.** A provisioned perspective that scores its probe targets at zero now reads as ready, correctly.
- **ADR 0046's curator-target rationale defect is mooted rather than corrected.** The build audit recorded it as a known documentation error the PO ruled could stand (it justified the curator target from the vouch graph, while GrapeRank actually runs on follows/mutes/reports). Once no value is read, the targets carry no rationale to be wrong about.
- **The 202 path ships unverified against a live provider.** It is written from the contract and tested against stubs. Treat the fixture as inferred, not captured, and re-verify if a scheduled perspective ever becomes observable.
- Trusting `200` ⇒ served rests on the contract's never-substitute guarantee. Accepted at PRD §11 Q6. An unannounced provider regression that resumed substituting silently would be invisible here; that is monitoring, not design.
- `_povState` is introduced with one writer. If stories #8 and #9 do not land, it is generality without a second consumer — a small, contained cost.
- **Firmware reinstall required?** No.

## Implementation notes

All in `public/index.html`; no new files, no dependencies, no build step (house rule).

- `probeMyViewReadiness` (`:3111`) — status branches replace the `rank > 0` test; writes `_povState`; clears on `2xx`.
- `updatePovUi` (`:3070`) — chooses among the three notes from `_povState`; sets `aria-disabled` / `aria-describedby`; the note element becomes persistent and class-toggled.
- `setActiveView` (`:3096`) — early return when My view is not ready.
- New helpers beside the trust-score section: `logPovRefusal`, `retryAfterSeconds(resp)`, `spokenInterval(seconds)`.
- Markup (`:1710–1715`) — `disabled` attribute off the My view segment; the note gains `role="status"` and `aria-live="polite"`.
- CSS — one class for the hidden state of the note.

**Reference implementation.** Branch `pr-1`, rebased onto `feat/npub-search`, green at 51/51 including its own T44–T49. Its refusal detection and its separation of cached scores by perspective are sound and worth reading before writing. Its copy decisions are reversed here, and its readiness function keeps the `rank > 0` test this ADR deletes. It guides; it does not merge.

**Test coverage** (Tester's to design; shape implied): the three status branches to their three copy lines; the interval bucket boundaries including the `max(5, …)` floor and the elapsed-estimate fall-through; absence of provider text in the DOM across all states; the dimmed segment reachable by keyboard and described by its note; Community view unchanged. `T36–T38` re-pin from the heuristic to the status. `T15–T35` and `T39–T43` should pass unmodified.

## Deferred to later stories in this book

Retained here so this ADR stays the single home for the area, and so stories #8 and #9 amend rather than supersede it.

- **The preference order** — resolving both perspectives independently and showing the most community-specific one that can be served. **Story #8.** The original draft has no notion of this: it falls back only to the provider's global default and never substitutes the member's own perspective.
- **The community-perspective refusal** and its copy across toggle, indicator, and panel. **Story #8.**
- **The search and rank-batch refusal paths**, including the explicit global re-request and the `global:` cache namespace from the original draft. **Story #8** — the machinery is right, its copy is not.
- **Re-check discipline for the non-probe surfaces** (not re-asking a declining provider within a visit; re-resolving on return). **Story #9.**
- **Contrast and touch-target corrections** on this same control. **Story #10** — pre-existing defects, kept in their own diff.

## Out of scope (this book entirely)

- Retiring anything else from ADR 0046 beyond Decision 3.
- Provider-side work: the 422/202 emission, header exposure, and the wording of provider reasons all live in `nosfabrica/brainstorm_server`.
- Letting a member register with the provider from inside the Hub — the next phase, separate branch (PRD §8.3).
- Any change to how membership is decided.
