# ADR 0028: In-browser local signer with required NIP-49 passphrase

**Status:** Proposed
**Date:** 2026-06-09
**Story:** `engineering-team/stories/local-signing/1-local-signer-nip49.md`

## Context

The entire LFO app is a single static file, `public/index.html`, served by `server.js` (a bare
static file server; the `src/server/...` layout sketched in `CLAUDE.md` was never built). All
logic lives in two `<script>` blocks: a `type="module"` block (`:1235-1247`) that imports
`nostr-tools@2` from esm.sh and exposes a few helpers on `window` (`_nostrDecode`,
`_nostrGetPubkey`, `_nostrGenerate`, `_nostrNpubEncode`), and a classic `<script>` (`:1249+`)
holding the app logic and a `showState(name)` state machine that toggles `.active` on
`#state-<name>`.

Today signing is NIP-07–only:
- Two signing call sites, both calling `window.nostr.signEvent(...)`: `applyLFOTag` (attest
  others, `:1483`, guarded by `if (!window.nostr …) return` at `:1452`) and `confirmApply`
  (self-apply, `:1987`, guarded at `:1961`).
- Manual sign-in (`signInManually`, `:1813`) decodes a pasted nsec only to derive the pubkey
  and then **discards it** (`input.value = ''`), so a non-extension user can browse but not sign.
- The attest button is hard-gated on `_hasExtension`: `canAttest = _isVerifiedMember &&
  _hasExtension` (`:1719`); a verified member without an extension gets a disabled button with an
  "Install a Nostr extension to attest members" tooltip (`makeMemberCard`, `:1643-1647`).

**Constraints:**
- House rule: intentionally **JS-without-build** — no new tooling, no new package; reuse the
  already-loaded `nostr-tools@2`.
- Story requires: non-extension users can sign; **only an encrypted key may be persisted**
  (never raw nsec); returning users **unlock with a passphrase**; attest available to any signer;
  sign-out keeps the encrypted login, "forget this device" wipes it; extension path unchanged.
- No concept-graph schema change — this changes *who signs* the LFO tag events, not their
  structure. The concept graph API was not consulted (not running; not needed). **No firmware
  reinstall.**

## Options considered

### Option A — In-browser local signer (nostr-tools `finalizeEvent` + `nip49`), key persisted as `ncryptsec` in `localStorage`, behind a unified `LFOSigner` abstraction
Add `finalizeEvent` and `nip49` to the existing module import. Introduce an `LFOSigner` object
(secret bytes in a module-scope closure, never on `window`) with `extension` and `local` modes.
Local sign-in / key-generation requires a passphrase; the key is encrypted with `nip49.encrypt`
(NIP-49: scrypt + XChaCha20-Poly1305) and only the resulting `ncryptsec` is written to
`localStorage`. Returning users decrypt with `nip49.decrypt` on unlock. The two call sites and
the attest gate switch from `window.nostr`/`_hasExtension` to `LFOSigner.sign()`/
`LFOSigner.canSign()`.

- **Pros:** Meets every acceptance criterion. No raw key at rest. Persists across visits (the
  requested UX) while staying encrypted. Reuses the loaded library — zero new deps, no build.
  Self-contained in one file. Extension path is untouched (different mode).
- **Cons:** Decrypted key is in JS memory while unlocked (unavoidable for any in-browser signer).
  scrypt makes encrypt/unlock take ~0.3–1s (needs a spinner). XSS remains the residual risk for
  any in-browser key. Lost passphrase + no nsec backup = permanent lockout.

### Option B — Memory-only session signer (no persistence)
Hold the decrypted key in memory only; never touch storage; wipe on reload/close.
- **Pros:** Strongest secrecy; nothing at rest at all; no passphrase.
- **Cons:** **Rejected** — the user explicitly chose persistence ("stay signed in") over
  session-only; this would force re-pasting the nsec every visit and fails the "unlock with a
  passphrase on return" criterion.

### Option C — Keycast custodial / remote signer (NIP-46 or HTTP RPC)
Offload custody to a Keycast server (hosted or self-hosted); app holds only OAuth tokens.
- **Pros:** No key in the browser at all.
- **Cons:** **Rejected** earlier — key persists on a third-party/self-hosted server, BYOK
  transmits the nsec in plaintext through the PKCE verifier, and there is no clean self-service
  way to truly erase the key (revocation ≠ deletion). Wrong trust model for this community, and
  it requires standing up server infrastructure the project doesn't have.

## Decision

We chose **Option A**. It is the only option that satisfies the approved story (persistent login
+ never store the raw key + unlock-by-passphrase + non-extension signing) while honoring the
JS-without-build constraint by reusing the `nostr-tools@2` already loaded. NIP-49 (`ncryptsec`)
is a recognized standard, so the at-rest format is interoperable and battle-tested rather than
bespoke.

## Consequences
- **Enables:** non-extension members to self-apply and attest; persistent encrypted login; a
  single signing seam (`LFOSigner`) that future signing features can reuse.
- **Constrains:** the decrypted key lives in memory during an unlocked session; we accept this as
  inherent to in-browser signing and mitigate by wiping on sign-out and never persisting plaintext.
- **Follow-ups / debt:** a noticeable scrypt delay on encrypt/unlock (mitigated with a spinner);
  copy across several sign-in states must be corrected (the current "your key never leaves this
  page" text becomes false once we persist an encrypted form). Single stored account only.
- **Firmware reinstall required?** No — no concept definitions change.

## Implementation notes
All in `public/index.html`.

- **Module script (`:1236`):** extend import to
  `import { nip19, getPublicKey, generateSecretKey, finalizeEvent, nip49 } from 'https://esm.sh/nostr-tools@2';`
- **`LFOSigner` (new, in the module script; expose methods on `window`, keep key in closure):**
  - `mode` (`'extension'|'local'|null`); `initExtension()`; `unlockLocal(skBytes)` (hold bytes,
    set local mode); `sign(unsignedEvent)` (extension → `window.nostr.signEvent`; local →
    `finalizeEvent(evt, sk)`); `getPublicKey()`; `canSign()`; `clear()` (drop/zero key).
  - Crypto helpers: `encryptKey(sk, pass)` = `nip49.encrypt(sk, pass)`; `decryptKey(ncryptsec,
    pass)` = `nip49.decrypt(...)` (throws on wrong passphrase — caught by the unlock flow);
    `nsecToSk(nsec)` via `nip19.decode`.
- **Storage:** one key `lfo_account` in `localStorage` =
  `{ pubkey, npub, ncryptsec, createdAt }`. Never store raw nsec/hex. Helpers
  `loadAccount()/saveAccount()/forgetAccount()`.
- **Sign-in wiring:**
  - `startSignIn` (`:1789`): after `getPublicKey()`, call `LFOSigner.initExtension()`.
  - `signInManually` (`:1813`): validate nsec, stash derived sk transiently, route to a new
    `state-set-passphrase` (do not proceed directly).
  - `proceedAfterGenerate` (`:1942`): route generated key to `state-set-passphrase`.
  - New **set-passphrase** handler: validate passphrase (min length + confirm), `encryptKey`,
    `saveAccount`, `LFOSigner.unlockLocal(sk)`, then `proceedWithPubkey(pubkey)` (show spinner
    during scrypt).
  - On load: if `loadAccount()` exists, `showState('unlock')`. New **unlock** handler:
    `decryptKey` → on success `unlockLocal` + `proceedWithPubkey`; on throw → "incorrect
    passphrase".
- **New UI states** (same `showState` pattern): `state-set-passphrase` (passphrase + confirm +
  unrecoverable-passphrase / back-up-your-nsec warning) and `state-unlock` (short npub +
  passphrase + Unlock + "Use a different key" [→ `forgetAccount`] + "Use extension instead").
- **Copy fixes:** `state-idle` secret-key warning (`:1004`), `state-no-extension` body
  (`:1122-1124`) and warning (`:1134`) — replace "never leaves this page / used only to verify"
  with the encrypted-and-stored-locally reality. Remove the "extension required to sign" branch
  `apply-no-ext-msg` in `state-apply-confirm` (`:1069-1086`).
- **Call sites:** `applyLFOTag` (`:1452` guard, `:1483` sign) and `confirmApply` (`:1961` guard,
  `:1987` sign) → use `LFOSigner.canSign()` / `LFOSigner.sign(...)`.
- **Attest gate:** in the render path (`:1719-1737`) and `makeMemberCard` (`:1641-1648`), replace
  `_hasExtension` with `LFOSigner.canSign()`; drop the disabled "install an extension" tooltip
  path (signed-in users can always sign now).
- **Sign-out:** `disconnect()` (`:2042`) → `LFOSigner.clear()` and keep `lfo_account`; add a
  "Forget this device" action that also calls `forgetAccount()`.

## Out of scope
Server-side/remote signing (Options B/C), NIP-46, multi-account storage, password-strength
metering beyond min-length, and any change to the LFO tag event structure or verification
algorithm.
