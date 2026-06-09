# Build Audit: Local in-browser signing

**Book:** `engineering-team/audits/local-signing/book.md`
**Date:** 2026-06-09
**Branch / commit range:** `0ce1979..5d0c24b` (branch `feat/local-signing`, not yet merged to `main`)
**Provenance:** Acceptance-frame
**Confidence:** high

> As-built record — what the product *is* now, factual and source-linked. It does not propose
> changes; the `prd-seed.md` carries the product-facing framing and recommendations.

## 1. What shipped

- Users **without a NIP-07 extension** can sign in with their secret key and sign LFO tagging
  events (self-apply + attest) entirely in-browser — `stories/local-signing/1-local-signer-nip49.md`.
- The secret key is persisted on-device **only** as a NIP-49 `ncryptsec` (passphrase-encrypted);
  the raw nsec is never written to storage — same story.
- A **required passphrase** is set at first local sign-in; returning users **unlock** with the
  passphrase instead of re-entering their nsec — same story.
- The existing **NIP-07 extension** sign-in/signing path is unchanged and stores nothing on-device.
- **Attesting** is available to any signed-in verified member who can sign (extension *or*
  unlocked local key), not only extension users.
- **Sign out** keeps the encrypted login (unlock on return); **Forget this device** wipes it.

## 2. Epics & stories rolled up

### Epic: `local-signing`
| Story | Delivered | Status | Review |
|---|---|---|---|
| #1 local-signer-nip49 | In-browser local signer (NIP-49 required) alongside NIP-07 | Done | `reviews/local-signing/1-local-signer-nip49.md` |

## 3. As-built inventory
Derived from the diff (`public/index.html`, +232/−25; the only app file changed).
- **User-facing (sign-in state machine):** two new states `#state-set-passphrase` (passphrase +
  confirm, unrecoverable-passphrase/back-up-nsec warning) and `#state-unlock` (passphrase entry,
  "incorrect passphrase" error, "Use a different key"). On load, a returning user with a stored
  account is routed to unlock (`initSignInState`). Nav pill gains a **Forget this device** item
  alongside Sign Out. Corrected the now-inaccurate "your key never leaves this page" copy on the
  idle and no-extension sign-in screens. Attest button no longer disabled-with-tooltip for
  no-extension members.
- **Signing seam:** new `LFOSigner` (module script) with `extension` | `local` modes —
  `initExtension`, `unlockLocal`, `sign`, `getPublicKey`, `canSign`, `clear`, and NIP-49
  encrypt/decrypt helpers. Both call sites (`applyLFOTag`, `confirmApply`) and the attest gate
  now use `LFOSigner.sign()` / `LFOSigner.canSign()` instead of `window.nostr` / `_hasExtension`.
- **Domain:** none. No concept definitions changed; **no firmware reinstall** (ADR 0028).
- **Data & contracts:** localStorage key `lfo_account` = `{ pubkey, npub, ncryptsec, createdAt }`
  (NIP-49 ncryptsec only). LFO tag event structure unchanged (kind 39999, `d`/`e`/`z`/`p`/`polarity`).
- **Dependencies:** runtime unchanged (still `nostr-tools@2` via esm.sh; `nip49` added from the
  `/nip49` subpath, `finalizeEvent` from root). Dev-only test infra added: `@playwright/test`,
  `nostr-tools`, `playwright.config.js`, `tests/local-signer.spec.js`.

## 4. Deviations from intent
Harvested from ADR 0028 `Consequences`, story `## Deviations`, and both review passes; reconciled
against the diff. (Acceptance frame in `book.md`; no PRD §refs.)

| # | Specified (frame) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | "encrypted at all times … only within a session" (original ask) | Persistent encrypted login in localStorage (NIP-49), unlock-on-return | intentional-change | User dropped session-only in favor of persistence + mandatory encryption (`_intake.md`; ADR 0028 Options) | Stay-signed-in UX; encrypted at rest, decrypted only in-session | — |
| 2 | nip49 import (ADR note) | Imported from `/nip49` subpath, not package root | constraint-discovered | Root doesn't export nip49 (Tester; story Deviations) | none | — |
| 3 | Remove "extension required" branch (ADR) | `apply-no-ext-msg` element kept; guard changed to `!canSign()` (now unreachable) | interpretation | Lower-risk than deleting markup (story Deviations) | none (dead UI) | Remove element in a cleanup |
| 4 | Sign-out vs forget distinct (frame) | `disconnect()` shared by Sign Out and not-member "Try a different key"; both keep the account | interpretation | Single reset path (story Deviations) | Edge: "Try a different key" then reload shows unlock for the prior key | Consider a dedicated reset for that button |
| 5 | — | `_hasExtension` now set-only; `.attest-btn-wrap`/`.attest-tooltip` CSS unused | added-beyond-scope (leftover) | Minimal-diff implementation (story Deviations; review) | none | Delete dead var + CSS |

**Undocumented work:** none — every diff hunk traces to story #1 / ADR 0028. Dev test-infra
(package.json, Playwright) traces to the user-approved Test Design decision (test plan).

## 5. Quality state at close
- Test gate: `npm test` → **9/9 pass** at close (commit `5d0c24b`); previously-flaky AC-2 verified
  stable 6/6 under `--repeat-each` after the persistence-race fix (`a9548c8`).
- Known open issues / accepted bugs: none blocking.
- Debt (from ADR 0028 `Consequences` + reviews): decrypted key resides in JS memory while
  unlocked (inherent to in-browser signing; mitigated by wipe-on-sign-out); scrypt cost on
  encrypt/unlock (covered by a button "Encrypting…" state); single stored account only.

## 6. Carry-forward register
- [ ] Automate **AC-7** (sign-out keeps login / forget wipes) — currently manually confirmed by
  the user (2026-06-09) + verified by inspection, but no e2e test (§4 n/a; review notes).
- [ ] Add an automated test for the **AC-9 generate-key path** (warning is shown; today only the
  paste path is asserted, generate→warning is by inspection).
- [ ] Remove dead code: set-only `_hasExtension`; unused `.attest-btn-wrap`/`.attest-tooltip` CSS (§4 #5).
- [ ] Decide whether the not-member "Try a different key" button should wipe the stored account (§4 #4).
- [ ] Remove the unreachable `apply-no-ext-msg` markup (§4 #3).
- [ ] Merge `feat/local-signing` → `main` (book built on the branch).
