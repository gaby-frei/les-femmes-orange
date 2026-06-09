# Test Plan: Story 1 — In-browser local signing for users without a NIP-07 extension

**Story:** `engineering-team/stories/local-signing/1-local-signer-nip49.md`
**ADR:** `engineering-team/decisions/0028-local-signer-nip49.md`
**Date:** 2026-06-09

## Approach
Playwright e2e (user-chosen). A fresh headless browser has no `window.nostr`, so it *is* the
non-extension user under test. Tests drive the real `public/index.html` (served by `server.js`,
auto-started by Playwright) and load `nostr-tools` from esm.sh. The Node side of each test uses
the `nostr-tools` dev dependency to mint throwaway keys, pre-compute `ncryptsec` values, and
independently `verifyEvent()` what the app signs.

**No live relays or live publishing.** Membership is controlled per-test by overriding
`window.getTagItems` (and `window.fetchMetadata`); signing is observed by overriding
`window.publishEventToRelay` to capture the event instead of broadcasting it. This keeps tests
deterministic and avoids writing to production relays.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 set-passphrase prompt on key entry | `entering a secret key prompts the user to set a passphrase (not immediate sign-in)` | `tests/local-signer.spec.js` | e2e |
| AC-2 only encrypted key persisted, never raw nsec | `after setting a passphrase, localStorage holds only an ncryptsec — never the raw nsec or secret hex` | `tests/local-signer.spec.js` | e2e |
| AC-3 returning user unlocks (no nsec re-entry) | `a returning user is asked to unlock with a passphrase, not to re-enter their nsec` + `the correct passphrase unlocks and leaves the unlock screen` | `tests/local-signer.spec.js` | e2e |
| AC-4 wrong passphrase → error, no sign-in | `a wrong passphrase shows an error and does not sign the user in` | `tests/local-signer.spec.js` | e2e |
| AC-5 attest enabled for unlocked local member | `an unlocked local-key verified member sees an enabled attest button and can sign an attestation` | `tests/local-signer.spec.js` | e2e |
| AC-6 local non-member applies → valid signed event | `a local-key non-member can apply, producing a validly signed application event` | `tests/local-signer.spec.js` | e2e |
| AC-7 sign-out keeps login / forget wipes | *(deferred — see Gaps)* | — | — |
| AC-8 extension path unchanged | `a NIP-07 extension user signs in without the app storing any key locally` (regression **guard**) | `tests/local-signer.spec.js` | e2e |
| AC-9 unrecoverable-passphrase / backup warning | `passphrase setup warns that the passphrase is unrecoverable and the nsec must be backed up` | `tests/local-signer.spec.js` | e2e |

## Selector / behavior contract (the implementation must satisfy these)
- New sign-in states `#state-set-passphrase` and `#state-unlock`, toggled by `showState()`.
- Set-passphrase state contains **two** `input[type="password"]` (passphrase + confirm) and warns
  the passphrase can't be recovered + to back up the nsec.
- Unlock state contains **one** `input[type="password"]` and renders an error matching
  `/incorrect|wrong|invalid/` on a bad passphrase.
- Each new state's primary action uses the existing `.signin-full-btn` button convention.
- Persisted account: localStorage key `lfo_account`, containing an `ncryptsec1…` and **never** a
  raw `nsec`/secret-key hex.
- On load with a stored account, the unlock state is shown and `#manual-key-input` is hidden.
- Attest path no longer gates on `window.nostr`; the "Install a Nostr extension to attest"
  tooltip is removed for users who can sign.

## ADR correction surfaced during test design
ADR 0028's import note shows `nip49` imported from the `nostr-tools@2` **root**. Verified that is
wrong: `nip49` is only available via the **subpath**. The Implementer must use:
```js
import { nip19, getPublicKey, generateSecretKey, finalizeEvent } from 'https://esm.sh/nostr-tools@2';
import * as nip49 from 'https://esm.sh/nostr-tools@2/nip49';   // root does NOT export nip49
```
(Confirmed: `https://esm.sh/nostr-tools@2/nip49` → 200, re-exports `encrypt`/`decrypt`.)

## Edge cases covered
- [x] Wrong passphrase rejected (AC-4).
- [x] Raw nsec / secret-hex never written to any localStorage key (AC-2, full-storage scan).
- [x] Signature validity of the produced events checked independently (`verifyEvent`) for both
      self-application and attestation.
- [x] Extension users get no passphrase prompt and no local storage (AC-8 guard).

## Gaps / deferred (flagged to PO/Reviewer)
- **AC-7 (sign-out keeps encrypted login; "forget this device" wipes it):** not yet automated.
  It depends on the final nav-menu wiring (the ADR adds a "Forget this device" action whose exact
  control isn't pinned by the spec). Recommend the Reviewer verify AC-7 manually, or add a
  follow-up test once the control exists. Manual check: sign in locally → Sign out → reload shows
  unlock (storage retained); Forget this device → reload shows idle (storage cleared).
- AC-5/AC-6 use synthetic membership + publish interception rather than live relays — they prove
  the app *produces* a valid signed event, not that relays accept it (out of scope per the story).

## Test infrastructure
- Framework: `@playwright/test` (added to `package.json` devDeps — first test setup in this repo).
- Key utilities: `nostr-tools` dev dependency for key minting / `nip49` encryption / `verifyEvent`.
- Web server: Playwright auto-starts `node server.js` at `http://127.0.0.1:3000`.
- Network: the page fetches `nostr-tools` from esm.sh at runtime (must be reachable).
- Browser: Chromium (`npx playwright install chromium`, one-time).

## How to run
```
npm test
```

## Verification
New tests fail with current (pre-implementation) code. Confirmed 2026-06-09 against the ADR
commit (`629c07c`):

```
8 failed
  ... › entering a secret key prompts the user to set a passphrase (not immediate sign-in)
  ... › after setting a passphrase, localStorage holds only an ncryptsec — never the raw nsec or secret hex
  ... › passphrase setup warns that the passphrase is unrecoverable and the nsec must be backed up
  ... › a returning user is asked to unlock with a passphrase, not to re-enter their nsec
  ... › the correct passphrase unlocks and leaves the unlock screen
  ... › a wrong passphrase shows an error and does not sign the user in
  ... › a local-key non-member can apply, producing a validly signed application event
  ... › an unlocked local-key verified member sees an enabled attest button and can sign an attestation
1 passed (extension-unchanged guard)
```
All 8 failures are because the `#state-set-passphrase` / `#state-unlock` states don't exist yet —
i.e. failing for the right reason (missing feature), not setup/import errors.
