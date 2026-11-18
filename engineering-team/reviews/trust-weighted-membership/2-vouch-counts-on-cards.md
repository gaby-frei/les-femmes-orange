# Review: Story 2 — Vouch counts and vouchers on member cards

**Reviewer:** Claude (acting as Reviewer). The same session also implemented this story, so
this review re-ran every gate and re-read the diff instead of relying on the implementation
summary.
**Date:** 2026-11-18
**Diff:** `git diff 4b8e63d..HEAD` (head `47d59ad`, branch `feat/trust-weighted-membership`)
**Story:** `engineering-team/stories/trust-weighted-membership/2-vouch-counts-on-cards.md`
**ADR:** `engineering-team/decisions/0049-vouch-counts-on-cards.md`
**Test plan:** `engineering-team/stories/trust-weighted-membership/2-vouch-counts-on-cards.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **134 / 135 pass**. The one failure is the pre-existing
  `test/builder-parity.test.js` (`tapestry/` checkout drift, unchanged from `main`, same as
  story #1's review). All of V1–V9 and story #1's U1–U19 pass.
- [x] `PORT=3133 npx playwright test` — **210 / 210 pass** (1.2 min), including C1–C12.
- [x] _Lint not configured — skipped._
- [x] _Typecheck not configured — skipped._
- [x] _Build not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test. The coverage map in the test plan is
  accurate: the verified count (C1, V7), the pending count (C2), the list opening by pointer,
  keyboard and touch (C3/C4/C12), dimmed non-counting entries (V3/V4/C5), count and list
  agreeing with each other and with the grid (V6/C6), Vouch on verified cards (C7), and the
  three post-vouch paths (C8–C10). D3 is guarded by C11.
- [x] No criterion is silently dropped.
- [x] No behavior added beyond the story. The hover-pin rule is a deviation the Implementer
  logged, and it's needed to satisfy C3 and C6 together.

## ADR adherence
- [x] **Module:** `selfVouched` is added to the closure return, and `voucherBreakdown` is
  pure, ordered counting → unverified → self, with an empty result for an untagged pubkey.
  It's exported for Node and as a browser global (`public/lib/membership.js`). It is
  additive, and the legacy closure plus `api/feed.js` are untouched.
- [x] **Page:**
  - `loadMembersPage` fetches profiles for every voucher (`public/index.html:2995`) and uses
    a single `gridCardOptions` gate for both grids (`:2788`): never your own card, never one
    you already vouched for.
  - The count and list are built with `textContent` only (`:2722-2756`).
  - The disclosure behaviour is in `wireVouchCount` (`:2758`), with one document-level
    `pointerdown` closer (`:2779`) that keeps the detached-target guard.
  - The stacking fix is `.member-card.vouch-open`.
- [x] **Post-vouch:** `applyLFOTag` re-renders the one affected card from the fresh closure
  (`:2551-2596`). That removes the duplicate-card path the ADR flagged, as C8 confirms.
- [x] **By-line deleted:** the template, `taggerLabel`, and the `.member-attested-by` CSS are
  gone, with no remaining references.
- [x] No new dependencies.
- [x] **Logged deviation, accepted:** a click on a list opened by hover pins it open, where
  the ADR specified a plain toggle. It's needed so a mouse click doesn't close what the
  hover just opened, and touch and keyboard behave exactly as the ADR specified.

## Concept-graph integrity
- [x] No handles or concept definitions are touched. Vouches stay in the unchanged
  kind-39999 format.
- [x] Firmware reinstall: not needed.
- [x] N/A. The Concept Graph API was unreachable, which the ADR recorded.

## Things tests can't catch
- [x] No secrets, no debug logging, no commented-out code.
- [x] XSS: profile names (relay-controlled) enter the DOM only via `textContent`. The marker
  strings are constants.
- [x] Listener leaks: the document listener is registered once at script load, not per card.
  Per-card listeners die with their card on re-render.
- [x] Hybrid devices (a touch laptop that reports `(hover: hover)`): a tap fires a
  compatibility `mouseenter` (which opens the list) and then a click (which pins it), so the
  list stays open. That's correct, thanks to the pin rule.
- [ ] **Cascade staleness.** See N1.

## House rules check
- [x] Concept Graph API authority respected (not exercised).
- [x] No new lint, typecheck, or build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **N1 — Cascade: other cards go stale after a vouch that verifies someone**
   (`public/index.html:2551-2596`).
   - **Reproduced** with the shared module: X and Y are both pending and X has vouched for
     Y. When I vouch for X, the closure verifies X *and* Y. Only X's card is re-rendered, so
     Y's card stays in Pending reading `0 of 1 vouch` until the Members page is reloaded.
   - **Not an acceptance-criteria failure:** the card's count and grid still agree with each
     other, and the story's "After vouching" criteria cover only the target.
   - **Pre-existing:** before this story, Y was left in the wrong grid too. This story just
     makes it visible as a number.
   - **Recommended fix** (small, can land before merge): when the vouch moved the target to
     Verified (`nowVerified && !wasVerified`), call `loadMembersPage()` to re-render both
     grids from the cached closure, as the search-panel vouch already does (`:3633`).
     Pinned by one more e2e case.
2. **N2 — `makeMemberCard`'s `taggerHex` parameter is now unused** (`:2795`). The by-line
   was its only reader. Optional: drop it at the five call sites in a later cleanup.
3. **N3 — "Published — sync pending" is dropped on re-render.** This was logged by the
   Implementer. When the Brainstorm relay doesn't confirm, the amber note is replaced by the
   new card. The old move path lost it too. Optional: carry it into the acknowledgement
   note.

## Live-preview checks (Vercel preview of `feat/trust-weighted-membership`)

1. **Real counts.** Sign in as a verified member and open Members. The curator's card should
   read about `2 vouches`. Rolled-back members should read `1 of 2 vouches`. The counts
   should match `node scripts/membership-policy-dry-run.mjs` run the same day.
2. **Real names.** Open a few voucher lists. Vouchers with kind-0 profiles should show their
   names, and the seed should show as a short npub. Look out for any "npub1…" where a
   profile exists, which would mean profiles were fetched too late or not at all.
3. **Phone.** On a real phone (iOS Safari and Android Chrome), tapping the count should open
   the list and leave it open, and tapping elsewhere should close it. The list shouldn't be
   clipped at the screen edge (it is 280 px wide at most) or hidden under the next card.
4. **Long list.** On the most-vouched member, the list should scroll inside its panel.
5. **End-to-end vouch on a verified card.** Vouch for a verified member you haven't vouched
   for. Their count should go up by one with no duplicate card, and a reload should show the
   same number.
6. **Desktop hover.** Hover should open the list, and moving the pointer off should close
   it. A click while hovering should keep it open.

## Verdict
**PASS**

The diff matches the story's criteria and ADR 0049, and every criterion has a passing test,
which I re-ran myself. The one deviation is logged and justified. N1 is a real but
pre-existing staleness, not a criteria failure. Fixing it before merge is recommended and is
the PO's call.
