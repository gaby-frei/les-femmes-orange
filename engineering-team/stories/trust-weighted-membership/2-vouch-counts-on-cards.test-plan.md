# Test Plan: Story 2 — Vouch counts and vouchers on member cards

**Story:** `engineering-team/stories/trust-weighted-membership/2-vouch-counts-on-cards.md`
**ADR:** `engineering-team/decisions/0049-vouch-counts-on-cards.md` (Accepted 2026-11-18)
**Date:** 2026-11-18

## Coverage map

Unit tests (`test/vouch-breakdown.test.js`, Node runner, against the shared module) pin
`voucherBreakdown` and `selfVouched` as pure functions. E2E tests
(`tests/vouch-counts-cards.spec.js`, Playwright, fully stubbed) pin what a member sees and
does on the Members page.

| Criterion | Test | ID | Level |
|---|---|---|---|
| Verified count (+ D1 by-line removed, singular) | `verified cards read "N vouches" (singular "1 vouch") and no longer show a "by …" / "Founding curator" line` | **C1** | e2e |
| Verified count: the seed's vouch for the curator counts | `the seed's vouch for the curator is listed and counted like any other` | **V7** | unit |
| Pending count (self-only, unverified-only, singular M) | `pending cards read "N of M vouches" — self-only and unverified-only applicants have 0` | **C2** | e2e |
| List opens from the count: pointer | `hovering the count opens the list of every voucher; moving away closes it` | **C3** | e2e |
| List opens from the count: keyboard | `keyboard: Enter opens the list, Escape closes it and returns focus to the count; Space toggles too` | **C4** | e2e |
| List opens from the count: touch (D2) | `tapping the count opens the voucher list; tapping elsewhere closes it` | **C12** | e2e (mobile + touch context) |
| Every distinct voucher, once | `a verified member: every voucher counts…` / `a voucher who vouched twice … is listed once` | **V2, V5** | unit |
| Non-counting vouchers dimmed, after counting, marked in text (+ D6 order) | `a pending pubkey: counting first, then unverified vouchers, then the self-vouch…` / `a self-only applicant lists just themselves…` / `non-counting vouchers are listed after counting ones, dimmed, and marked in text` | **V3, V4, C5** | unit + e2e |
| Self-vouches available to the card | `the closure also returns selfVouched…` | **V1** | unit |
| Count and list agree | `for every tagged pubkey: counting entries == the card number…` / `on every card the non-dimmed entries equal N…` | **V6, C6** | unit + e2e |
| Follows the live verdict (verified ⇒ N ≥ M, pending ⇒ N < M) | same as above | **V6, C6** | unit + e2e |
| Vouch on verified cards (+ D5 exclusions; pending rule unchanged) | `a Vouch button appears on other verified members I have not vouched for — never on my own card or one I already vouched` | **C7** | e2e |
| After vouching a verified member (count +1, listed, ack, no reload, no duplicate) | `vouching a verified member raises their count in place…` | **C8** | e2e |
| After vouching a pending member: still short | `vouching a still-short applicant updates "N of M" in place and lists me` | **C9** | e2e |
| After vouching a pending member: now verified | `a vouch that completes the requirement moves the card to the verified grid with its "N vouches" line` | **C10** | e2e |
| D3: search rows unchanged | `search-result rows do not get a vouch count` | **C11** | e2e (guard; green before and after) |
| ADR: breakdown is pure; untagged → empty | `voucherBreakdown is pure…` / `a pubkey nobody vouched for has an empty breakdown…` | **V9, V8** | unit |

## Edge cases

- [x] A profile-less voucher (the seed) is listed by short npub (`hexToNpubShort`). C3, C5.
- [x] Event order puts the counting vouch **last**, and the list still shows it first. V3, C5.
- [x] Duplicate events from one voucher, including a duplicate self-vouch. V5.
- [x] Pending with M = 1 uses the singular `0 of 1 vouch`. C2.
- [x] The open list is the topmost element at its own position, so it isn't drawn under the
      next card in the grid (the ADR's stacking note). C3.
- [x] Touch: tapping opens the list and it **stays open**. There is no hover-then-click
      double toggle. C12 waits 300 ms and re-asserts.
- [x] Vouching a verified card must not duplicate it (the ADR-identified bug in today's
      `res.verified` branch). C8 asserts exactly one card and an unchanged grid size.
- [ ] Long voucher lists (scroll inside the panel). Not producible meaningfully with
      fixtures. Reviewer live check.
- [ ] Scores unreachable right after a vouch (`remaining: null`). Story #1's behavior,
      unchanged here; not re-tested.
- [ ] Concept Graph API: not applicable. No concept definition is touched.

## Test infrastructure

- Node built-in runner: `node --test test/*.test.js` (`npm run test:unit`). The shared
  module is `require`d directly, and a named error per missing export keeps RED legible.
- Playwright: the same seams as `tests/trust-weighted-signin.spec.js`. Those are
  `window.getTagItems`, `window.queryRelay` (kind-0 profiles), `window.LFOSigner`,
  `window.publishEventToRelay`, and `page.route('**/rank/pubkeys')`. The Members page opens
  with `currentPubkey`/`_isVerifiedMember` set directly, as story #1's grid tests do. C12
  runs in a `{ isMobile: true, hasTouch: true }` 390×844 context, so `(hover: hover)` is
  false, as on a phone.
- Fixtures: one six-card world shared by both files, described in the header comment of
  each file.

## Notes for the Implementer

- DOM hooks the tests locate:
  - `button.vouch-count` (exact text `N vouches` / `N of M vouches`, with `aria-expanded`)
  - `.vouch-list` (hidden when closed)
  - `.vouch-list li`, and `li.not-counting` for non-counting entries
  - `.attest-btn` on verified grid cards
- Marker text is matched loosely (`/not verified/i`, `/self/i`). Dimming is asserted as a
  lower computed `opacity` than a counting entry.
- C8's acknowledgement only needs to **contain** `Vouched`. C9 keeps story #1's
  `Vouched — 2 more vouches needed`.
- Cards are located by `.member-copy-btn[data-hex]`, as in story #1's specs.
- `window.__noReload` is a sentinel set at page open. A reload would erase it.

## How to run

```
node --test test/vouch-breakdown.test.js
PORT=3131 npx playwright test tests/vouch-counts-cards.spec.js
```

## Verification

The new tests fail with the current code. Confirmed 2026-11-18 at commit `d956dc6`:

```
# node --test test/vouch-breakdown.test.js
ℹ tests 9   ℹ pass 0   ℹ fail 9
  V1  AssertionError: selfVouched is returned as a Set
  V2–V9  Error: public/lib/membership.js does not export voucherBreakdown yet (story #2 unimplemented)

# PORT=3131 npx playwright test tests/vouch-counts-cards.spec.js
11 failed, 1 passed
  C1, C2, C7, C9   expect(locator).toHaveText() — element(s) not found (.vouch-count / verified .attest-btn)
  C3–C6, C8, C12   hover / focus / click / tap timed out waiting for .vouch-count or verified .attest-btn
  C10              card moves to verified (today's behavior) but .vouch-count not found
  C11 ✓            guard — search rows have no count, green before and after
```
