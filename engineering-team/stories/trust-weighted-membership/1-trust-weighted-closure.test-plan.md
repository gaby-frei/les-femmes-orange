# Test Plan: Story 1 — Trust-weighted closure and sign-in gate

**Story:** `engineering-team/stories/trust-weighted-membership/1-trust-weighted-closure.md`
**ADR:** `engineering-team/decisions/0048-trust-weighted-closure.md` (Accepted 2026-09-09)
**Date:** 2026-09-09

## Coverage map

Unit tests (`test/membership-policy.test.js`, Node runner, against the shared module) pin the
closure as a pure function. E2E tests (`tests/trust-weighted-signin.spec.js`, Playwright,
fully stubbed — no live relay or ORE host is ever reached) pin what a person sees.

| Criterion | Test | ID | Level |
|---|---|---|---|
| Policy table, defined once, frozen | `MEMBERSHIP_POLICY is the PO table…` | **U1** | unit |
| Boundary on the displayed integer | `scoreInteger is the chip integer…` / `requiredVouches buckets…` / `0.745 verifies with one vouch; 0.744 does not` | **U2, U3, U7** | unit |
| Boundary (in the real page) | `a pubkey at exactly 0.745 with one vouch is trusted and signs in` | **T2** | e2e |
| Bucketed requirement | `one verified vouch admits a trusted pubkey, but not a neutral or low one` / `…verifies on the second…; a low one on the third` | **U4, U5** | unit |
| Unscored → 0 → 3 vouches | `an unscored pubkey is treated as 0…` / `an untagged pubkey the provider has never scored needs 3 vouches` | **U6, T6** | unit + e2e |
| Counting vouches (self, duplicate, unverified voucher) | `self-vouch never counts…` / `self-vouch plus one verified vouch = one` / `two vouches from the same verified member count once` / `a vouch from a pending account counts zero…` | **U8–U11** | unit |
| Roots (seed only; curator governed, cascade) | `the seed is verified with no vouches and no score` / `the curator is governed…` | **U12, U13** | unit |
| Single point of change | `passing a different policy changes every verdict with no other change` | **U14** | unit |
| Memoryless | `the verdict follows the score handed in…` / `scores are mandatory — omitting them throws` / `same events, score rose between two page loads → pending → verified` / `nothing … written to browser storage` | **U15, U16, T14, T15** | unit + e2e |
| Sign-in, verified (+ request contract: house POV, every pubkey) | `a trusted pubkey with one verified vouch signs in as a member; scores requested from the house perspective…` | **T1** | e2e |
| Sign-in, tagged but short (D1 copy; singular/plural — D4; rolled-back state — D5) | `a neutral pubkey with one vouch lands on the pending state… "1 more vouch needed"` / `a low-trust self-applicant sees "requires 3 vouches"…` / `a trusted self-applicant reads "requires 1 vouch"…` | **T3, T4, T7** | e2e |
| Sign-in, untagged | `an untagged neutral pubkey keeps the apply prompt and reads "2 more vouches needed"` | **T5** | e2e |
| Provider unavailable — transport, 422, 202, unreadable 200; D3 copy; Try again; no fallback; no provider text | `…fails on the network → D3 copy with Try again and no verdict` / `a 422 refusal … no provider text and no global fallback` / `a 202 … unavailable` / `a 200 with an unreadable body … not a 3-vouch verdict` / `Try again after a provider failure leads to a successful sign-in once scores are back` | **T8–T12** | e2e |
| House POV regardless of the active view | `with My view active, membership is still evaluated from the house perspective` | **T13** | e2e |
| After a vouch (still short / now verified / never-tagged target scored first) | `vouching a neutral self-applicant reports "Vouched — 1 more vouch needed"…` / `vouching a trusted self-applicant verifies them…` / `vouching a never-tagged pubkey from the search panel fetches its score…` | **T17, T18, T19** | e2e |
| Grids follow the closure | `verified and pending grids contain exactly the closure's sets — a rolled-back neutral member sits in pending` | **T16** | e2e |
| Return shape for stories #2/#3; legacy export kept for the feed | `return shape: verifiedMap → first counting voucher…` / `a plain object works as the score map too` / `buildMemberSets (legacy) is still exported…` | **U17, U18, U19** | unit |

**Green today, must stay green:** T2 (today's 1-vouch closure also admits a 0.745 pubkey — the
test guards the rounding direction once buckets exist), T15, T18 (today's move-to-verified
behavior, re-pinned under the new rule), U19 (the feed's legacy closure).

## Edge cases

- [x] `0.745` / `0.744` and `0.495` / `0.494` — both sides of both boundaries, in the unit and (75) in the page. U2, U7, T2.
- [x] Score present but non-numeric (string, NaN) → 0. U2.
- [x] Duplicate vouch events from one voucher (replaceable-event re-publish). U10.
- [x] A vouch from a *pending* account: listed in `vouchersByTarget` (story #2 will dim it) but never counted. U11.
- [x] Cascade when the governed curator dips — everyone downstream goes pending. U13.
- [x] Score omitted entirely → `TypeError`, never a silent 3-vouch world. U16.
- [x] `extraPubkeys` (the untagged signing-in user) get a requirement row but never enter the sets. U17.
- [x] Provider answers with a realistic refusal in **both** channels (`x-reason` header and `body.error`, with the real provisioning host) so "no provider text in the DOM" is a meaningful assertion. T9.
- [x] Provider returns 200 with HTML — must not be read as "everyone unscored". T11.
- [x] No re-request with `algorithm: 'graperank'` after a refusal (the chips' fallback must not leak into membership). T8, T9.
- [x] The search-panel vouch of a pubkey present in **no** tag event — its score must be fetched before the post-vouch verdict. T19.
- [ ] ORE batch larger than one request (chunking) — not producible with the fixture sizes; the ADR's ≤100 chunking is an implementation note, not an AC. Reviewer live check.
- [ ] Concept Graph API unavailable — not applicable; the story touches no concept definition.

## Test infrastructure

- Node built-in runner: `node --test test/*.test.js` (`npm run test:unit`). The shared module is `require`d directly; the suite throws a named error per missing export so RED is legible.
- Playwright (`npm run test:playwright`; `PORT=<free> npx playwright test tests/trust-weighted-signin.spec.js` when 3000 is taken). Stubs: `window.getTagItems` (tag events), `window.nostr` (NIP-07), `window.queryRelay` (kind-0 profiles), `window.LFOSigner` / `window.publishEventToRelay` (vouch write path), and `page.route('**/rank/pubkeys')` (ORE; records every POST body).
- Concept Graph API: not required.
- Fixtures: synthetic kind-39999 vouch events with the real `d`/`p`/`polarity` shape; pubkeys `11…` (me), `aa…`–`ee…`; house POV `6ff68243…`; seed `e83fff7a…`.

## Notes for the Implementer

- **Sign-in seam:** the tests call `window.startSignIn()` with a stubbed `window.nostr`, so the real `proceedWithPubkey` runs. `window.getTagItems` is overridden (as `tests/local-signer.spec.js` already does); the same array instance is returned each call so `publishVouch`'s optimistic push is visible.
- **DOM hooks the tests locate:** `#vouch-requirement-line`, `#vouch-remaining-line` (inside `#state-not-member`, rendered in both the apply-prompt and already-pending sub-states), `#error-msg` inside `#state-error` (existing), the existing **Try again** button.
- **Feedback text:** the pending card / candidate row must *contain* `Vouched — 1 more vouch needed` (em dash, singular) or `Vouched — 2 more vouches needed`.
- **T12** presses Try again (→ idle) and then calls `startSignIn()` again; no automatic retry is expected or tested.
- **T13** sets `_activeView = 'mine'` before sign-in; the assertion is only on the request bodies.


## Re-pinned during Implementation (2026-09-09)

The trust-weighted closure changes what the older fixtures *mean*: a seed vouch alone no
longer admits an unscored pubkey. Forty-six tests in three older specs went RED on
"members grid rendered" for that reason only. Re-pins, all recorded inline with an
`RE-PINNED (ADR 0048)` comment:

| Spec | Change | Why |
|---|---|---|
| `tests/npub-search.spec.js` `openMembers` | default rank stub scores every asked pubkey 0.9 (was: empty results) | the default fixture world is a trusted one; tests about standing supply their own table |
| `bigGridSetup` | V4 gains vouches from V2 and V3 (three counting) | V4 is the fixture's score-less **verified** member |
| T28 | the one house batch is the membership batch: pubkeys = grid ∪ {seed} | membership and chips share one batch; chips read the warm cache |
| T29 | re-pinned: score backend down before any verdict → `#members-error` with the D3 copy, no grids | "page exactly as today" is superseded — scores now decide membership |
| T31, `AMEND_SCORES`, `povScores()` house table | ME 0.50→0.80, V3 0.73→0.83, Bea 0.80→0.84; V4 unchanged (unscored / 0.40) | verified members must be trusted; relative orders preserved so every ordering assertion is unchanged |
| T32 | retired | "no scores at all" now means no verdict (T29); score-less-last stays pinned by T31's V4 |
| three free-text tables (T16/T17/T19-old) | `ME: 0.9` added | the fixture member must be trusted |
| "rank-batch failure during search" | only the chip batch aborts; the membership batch (carries the seed) is served | there must be a page to search on |
| `stubPerspectives`, T55's stub | a declined house perspective still serves the membership batch | stands in for the warm sign-in cache: story #8's refusal is a **mid-session** case now |
| `tests/community-feed.spec.js` | `stubRankTrusted` (0.9 for all) alongside `stubMembership`; also for the non-member test | verdict needs a score answer; never reach the live host |
| `tests/local-signer.spec.js` | `stubRankOffline(page, scores)` helper; member scored 0.9 in the attest test, nobody scored in the non-member tests | same |

Also tightened in the new spec after the first run: T1/T13 assert the *membership* batches
(those carrying the seed) rather than every rank call — the My-view readiness probe and
the chip batches may legitimately use the member's own perspective; T9's fixture
provisioning URL is now a distinctive fake (the page already links the real host); T19
asserts the outsider was scored from the house perspective rather than that every call was.

**Gate after re-pin:** Playwright 198/198; unit 125/126 (`builder-parity` — pre-existing
`tapestry/` checkout drift, unrelated).

## How to run

```
npm run test:unit
PORT=3111 npx playwright test tests/trust-weighted-signin.spec.js
```

## Verification

The new tests fail with the current code. Confirmed 2026-09-09 at commit `abc3343`:

```
# node --test test/membership-policy.test.js
ℹ tests 19
ℹ pass 1        (U19 — legacy buildMemberSets still exported)
ℹ fail 18       every failure: "public/lib/membership.js does not export
                buildTrustWeightedMemberSets / scoreInteger / requiredVouches yet
                (story #1 unimplemented)" or MEMBERSHIP_POLICY undefined

# PORT=3112 npx playwright test tests/trust-weighted-signin.spec.js
16 failed, 3 passed (T2, T15, T18 — green today, see above)
  T1   Error: at least one rank batch fired during sign-in            (no ORE call at sign-in today)
  T3   expect(#state-not-member).toBeVisible() failed                  (1-vouch closure signs the neutral pubkey in)
  T4–T7 expect(#vouch-requirement-line).toHaveText() failed            (lines do not exist)
  T8–T12 expect(#state-error).toBeVisible() failed                     (no ORE dependency, so no failure state)
  T13  expect(calls.length).toBeGreaterThan(0)                         (no ORE call at sign-in today)
  T14  expect(#state-not-member).toBeVisible() failed                  (first load already verified under 1-vouch)
  T16  neutral + 1 vouch → pending (rolled back)                       (B renders in the verified grid today)
  T17  feedback carries the remaining count                            (card moves to verified; no count)
  T19  low trust: my vouch is 1 of 3                                   (candidate shows "✓ Member / Vouched by you")
```
