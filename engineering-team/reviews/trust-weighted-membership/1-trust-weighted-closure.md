# Review: Story 1 — Trust-weighted closure and sign-in gate

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-11-17
**Diff:** `git diff main...HEAD` (head `3ff8ad2`, branch `feat/trust-weighted-membership`)
**Story:** `engineering-team/stories/trust-weighted-membership/1-trust-weighted-closure.md`
**ADR:** `engineering-team/decisions/0048-trust-weighted-closure.md`
**Test plan:** `engineering-team/stories/trust-weighted-membership/1-trust-weighted-closure.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **125 / 126 pass**. The one failure is `test/builder-parity.test.js`:
  `Cannot find module '../tapestry/src/lib/event-tagging/builders.js'`. The file is unchanged
  from `main` and fails there too, because the `tapestry/` checkout is out of date (CLAUDE.md
  staleness warning). Not caused by this story. All 19 of `test/membership-policy.test.js`
  (U1–U19) pass.
- [x] `PORT=3127 npx playwright test` — **198 / 198 pass** (1.2 min), including all 19 of
  `tests/trust-weighted-signin.spec.js` (T1–T19) and the re-pinned older suites.
- [x] _Lint not configured — skipped._
- [x] _Typecheck not configured — skipped._
- [x] _Build not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test. The test plan's coverage map is accurate:
  bucketed requirement (U4–U6), boundary (U2/U3/U7, T2), counting vouches (U8–U11), roots
  (U12/U13), single point of change (U14), memoryless (U15/U16, T14/T15), the three sign-in
  outcomes (T1, T3–T7), provider unavailable over transport/422/202/unreadable-200 plus Try
  again (T8–T12), house POV regardless of view (T13), after a vouch (T17–T19), grids (T16).
- [x] No criterion is silently dropped.
- [x] No behavior added that isn't in the story. The Implementer logged two small additions
  under Deviations, and both follow from the story: the search panel's `Pending` badge after
  a short vouch, and the D3 copy on the Members page and search panel when the cache was
  invalidated while ORE is down.

## ADR adherence
- [x] Files match the implementation notes. `public/lib/membership.js` exports
  `MEMBERSHIP_POLICY` (frozen), `scoreInteger`, `requiredVouches`,
  `buildTrustWeightedMemberSets`, and the legacy `buildMemberSets`, all with browser globals
  (`membership.js:12-22`, `:166-172`). It throws a `TypeError` when `scores` is missing
  (`:77-79`).
- [x] `index.html` splits the score fetch as specified. `oreRankBatch` is strict: it requires
  `status === 200` and rejects 202, and it uses chunks of 100 with a 10 s timeout
  (`index.html:3148-3178`). `fetchTrustScores` stays lenient and keeps the chips-only global
  fallback (`:3184-3198`). `getMembershipScores` always uses `HOUSE_POV.pubkey` and shares
  the `_scoreCache` namespace (`:3205-3216`), so a member's chip and verdict use the same
  number.
- [x] `getMemberSets` scores every target, every voucher, and `currentPubkey`
  (`:2237-2260`). `currentPubkey` is assigned at `:4069`, before the first `getMemberSets()`
  at `:4082`, so the signing-in user always gets a requirement row.
- [x] Sign-in error state uses the exact D3 copy and keeps the existing Try again
  (`:4081-4089`). Relay failures keep their old message.
- [x] Both chip sites go through `scoreInteger` (`:3117`, `:3444`). No inline
  `Math.round(rank * 100)` remains.
- [x] `publishVouch` returns `remaining` and gives `remaining: null` when scores are
  unreachable after publishing (`:2476-2490`). Both feedback sites render
  `vouchedFeedbackCopy` via `textContent`, which replaces the old `innerHTML` writes.
- [x] `api/feed.js` is untouched and the legacy export is kept (U19).
- [x] CLAUDE.md is amended: Verification Algorithm, Authentication Flow steps 3–4, and Key
  Decisions.
- [x] No new dependencies, hosts, or persistence.
- [ ] **Deviation, accepted:** the ADR said to promote `scripts/membership-policy-dry-run.mjs`.
  It exists locally, but `scripts/` is gitignored by convention, so it is not in git. The
  Implementer logged this. It's non-blocking; see finding N1.

## Concept-graph integrity
- [x] Handles unchanged. No concept definitions are touched, and the attestation format and
  relay set are unchanged.
- [x] Firmware reinstall: not needed (no concept definition changed). Consistent with the
  ADR.
- [x] N/A. No new concept orientation.

## Things tests can't catch
- [x] No secrets in committed files.
- [x] No leftover debug logging.
- [x] No commented-out code.
- [x] Error paths: every `getMemberSets()` caller handles a rejection. That covers sign-in,
  the Members page, both search-panel sites, and `publishVouch`. Error copy never includes
  provider-authored text: `escHtml` is applied to a constant, and the provider body is
  discarded in `oreRankBatch`.
- [x] Termination: the closure is monotone and its requirements are fixed per run, so the
  `while (changed)` loop terminates (`membership.js:98-108`).
- [x] Concurrency: `_memberSetsCache` is assigned only after the score fetch succeeds, so a
  failed attempt leaves nothing behind and Try again recomputes cleanly. Two concurrent
  callers with a cold cache could each fire a membership batch. That costs a duplicate
  request but cannot produce a wrong verdict (non-blocking, N3).
- [x] Security: the new DOM writes use `textContent` or `escHtml`. No new injection surface.

## House rules check
- [x] Concept Graph API authority respected (not exercised).
- [x] No new lint, typecheck, or build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **N1 — `scripts/membership-policy-dry-run.mjs` is not in git.** ADR 0048 asked for it to
   be promoted, and the book relies on it for the day-one rollback numbers, but it lives
   only on the PO's machine. Optional: force-add this one script (`git add -f`), or record
   in the ADR that `scripts/` stays untracked by convention.
2. **N2 — The rollback count differs between documents.** The story and ADR say 11 members
   roll back. The Implementer's live run on 2026-09-09 found 12: 11 neutral plus one
   unscored member, `16ea2a43…`. Optional: the PO should confirm the unscored member is on
   the list for operational second and third vouches before merge. An unscored member needs
   3 vouches, not 2.
3. **N3 — Concurrent cold-cache calls can duplicate the ORE request.** If `getMemberSets()`
   is called again while a first call is still in flight, both fire a membership batch.
   Today the sign-in path is effectively single-flight, so this is harmless. Optional:
   cache the in-flight promise when story #3 brings the same closure to the server.
4. **N4 — `vouchRequirementCopy` silently defaults to 3 / 3 when there is no requirement
   row** (`index.html:2266`). This is unreachable today because `extraPubkeys` always
   carries `currentPubkey`, but the default would hide a future wiring bug. Optional: treat
   a missing row as an error, not a low-trust verdict.
5. **N5 — The search panel's ORE-unavailable branch has no test** (`index.html:2982`,
   `:3087`). The Members-page equivalent is covered by T29. The path is low-risk and uses
   the same constant.
6. **N6 — PO note, carried from Deviations:** the story-#8 behavior "community declined →
   open on My view" (`product-team/prd/pov-availability.md` §5.1) can no longer happen at
   first paint, because a refused house perspective now blocks sign-in. This is worth
   recording in the book's close-out as a behavior change.

## Live-preview checks (Vercel preview of `feat/trust-weighted-membership`)

The stubbed suite cannot prove the following. Check each on the live preview before treating
the story as closed:

1. **ORE from the deployed origin.** Sign in on the preview. In DevTools → Network, the
   `POST https://api.brainstorm.world/rank/pubkeys` with `algorithm: graperank-pov` and
   `pov: <HOUSE_POV>` should return 200 with no CORS or preflight error. The body should
   list every pubkey from the vouch events (about 57 or more) in one request.
2. **Sign-in latency.** The added ORE round trip should keep sign-in close to today's time
   (sub-second extra). The `Checking membership across Nostr relays and Brainstorm…` line
   should not hang.
3. **Real verdicts match the dry run.** Run `node scripts/membership-policy-dry-run.mjs` the
   same day. The preview's verified and pending grid counts should equal its output. The
   curator should be verified with a chip of about 96, and every rolled-back member should
   appear in Pending.
4. **A rolled-back or short account.** Sign in as, or with, a pending neutral account. You
   should see `Your trust level in the community requires 2 vouches from other members.`
   and the correct `N more vouch(es) needed`.
5. **Provider unavailable, for real.** In DevTools, block the `api.brainstorm.world` request
   URL and sign in. You should see exactly the D3 sentence plus Try again, and no gated
   view. Unblock it, press Try again, sign in again, and it should succeed.
6. **End-to-end vouch.** As a verified member, vouch for a pending neutral applicant with
   one counting vouch. The card should move to Verified. Vouch for someone who stays short:
   you should see `Vouched — N more vouch(es) needed`. The event should land on
   `wss://tags.brainstorm.world/relay` in the unchanged format.
7. **My view does not change the verdict.** Switch to My view, reload, and sign in. The
   membership batch should still carry the house POV.

## Verdict
**PASS**

The diff matches the story's acceptance criteria and ADR 0048's design. Every criterion has a
passing test, which I ran myself. The deviations are logged and justified, and none of them
weakens a guarantee. The non-blocking items are housekeeping and notes for the PO.
