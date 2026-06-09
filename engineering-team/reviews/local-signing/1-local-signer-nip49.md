# Review: Story 1 — In-browser local signing for users without a NIP-07 extension

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-09
**Diff:** `git diff main...HEAD` (commit `b8d4edb`)

## Quality gates (run by reviewer, not trusted)

- [x] `npm test` (Playwright) — **FAIL: 1 failed, 8 passed.** The failure is
  `after setting a passphrase, localStorage holds only an ncryptsec — never the raw nsec or
  secret hex` (`tests/local-signer.spec.js:63`): `localStorage.getItem('lfo_account')` returned
  `null`. Intermittent — the same suite passed under a prior `npx playwright test` run. Root cause
  is a real ordering race in the implementation (see Blocking #1), not a bad test.
- [ ] _Lint not configured — skipped._
- [ ] _Typecheck not configured — skipped._
- [ ] _Build not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion maps to a test (AC-1..AC-6, AC-8, AC-9 automated; AC-7 manual).
- [~] **Not every mapped test passes** — AC-2 fails intermittently due to Blocking #1.
- [x] No behavior added beyond the story.
- AC-9 (flagged): the unrecoverable-passphrase + back-up-your-nsec warning lives on
  `#state-set-passphrase`, which **both** the paste flow and the generate flow route through
  (`proceedAfterGenerate` → `showState('set-passphrase')`, `public/index.html:1938`). The
  automated AC-9 test only drives the paste flow; the generate→warning path is covered by
  inspection, not by a test (non-blocking).

## ADR adherence
- [x] Changes are confined to `public/index.html` per ADR 0028; `LFOSigner`, NIP-49 `ncryptsec`
  persistence in `localStorage` (`lfo_account`), new `set-passphrase`/`unlock` states, and the
  attest un-gating all match the implementation notes.
- [x] nip49 imported from the `/nip49` subpath — the correction the Tester surfaced; logged as a
  deviation in the story. Good.
- [x] No new **app/runtime** dependency (still esm.sh at runtime). The added `@playwright/test`
  and `nostr-tools` are **dev-only**, introduced by the user-approved Test Design decision and
  documented in the test plan — not an unauthorized dependency.

## Concept-graph integrity
- [x] N/A — no concept definitions changed; ADR correctly records no firmware reinstall. LFO tag
  handle referenced in `kind:pubkey:slug` form only.

## Things tests can't catch
- [x] No secrets committed; the raw nsec is never persisted (the whole design intent). Once
  Blocking #1 is fixed, AC-2 enforces this invariant.
- [x] No leftover `console.log` / debug code added.
- [x] No commented-out code.
- [~] **Dead leftovers** (logged as deviations): `_hasExtension` is now set-only
  (`public/index.html:1907,2233`); `.attest-btn-wrap`/`.attest-tooltip` CSS rules
  (`public/index.html:785-798`) are unused now that the disabled-attest path is gone. Non-blocking.
- [x] Wrong-passphrase path returns early without changing state (`submitUnlock`) — correct.

## House rules check
- [x] Concept Graph API authority respected (not applicable here).
- [x] No new lint/typecheck/build tooling added; the test framework was an explicit, approved
  Test Design decision.

## Findings

### Blocking
1. **`public/index.html:1967-1977` (`submitPassphrase`)** — Persistence race. `showState('loading')`
   (line 1967) hides `#state-set-passphrase` **before** the `await new Promise(setTimeout)` +
   scrypt encryption + `saveAccount(...)` that follow. Any observer (the AC-2 test, or a fast
   user) can see the passphrase screen dismissed before `lfo_account` is written, so the
   "key is persisted once setup completes" guarantee isn't actually upheld at the moment the UI
   signals completion. **Asked change:** write the account before leaving the set-passphrase
   state — e.g. compute `ncryptsec` + `saveAccount(...)` + `unlockLocal(sk)` first, then
   `showState('loading')` and `proceedWithPubkey(...)`. (The scrypt cost will keep the
   passphrase screen up briefly during encryption, which is fine; a spinner/disabled button on
   the submit control is optional polish.) Re-run `npm test` until green across repeated runs.

### Non-blocking
1. **AC-9 generate path** — covered by inspection only; consider a follow-up test that drives
   "generate key → set passphrase → warning shown."
2. **AC-7** (sign-out keeps login / forget wipes) — not automated (documented in the test plan).
   Verified by inspection: `disconnect()` does not call `forgetAccount()` and `initSignInState()`
   shows `#state-unlock` when `lfo_account` exists; `pillForgetDevice()` calls `forgetAccount()`.
   Consider a follow-up e2e.
3. **Dead leftovers** — see above; safe to remove in a later cleanup.

## Verdict
**CHANGES_REQUESTED** — one blocking issue (the `submitPassphrase` persistence race) makes the
test gate fail intermittently. Everything else conforms to the story and ADR. Fix the ordering,
get `npm test` green across repeated runs, and this is a PASS.
