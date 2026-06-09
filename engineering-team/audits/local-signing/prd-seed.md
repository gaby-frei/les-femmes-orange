# PRD Seed: Les Femmes Orange — local (extension-free) signing

**Mode:** reconstructed from as-built *(no prior PRD)*
**Build audit:** `engineering-team/audits/local-signing/audit.md`
**Anchor:** acceptance frame in `book.md`
**Confidence:** high
**Date:** 2026-06-09

> Reverse-engineered baseline in PRD shape, built from what shipped — a **strawman for the
> product team**, not a ratified spec. Sections are tagged `[FROM FRAME]` (grounded in the
> kickoff acceptance frame), `[INFERRED]` (read off the as-built system), or
> `[UNKNOWN — product input needed]`. Adopt as the starting point for `/discover` and validate.

## 1. Product vision
`[FROM FRAME]` Let people participate in Les Femmes Orange's peer-verification — self-applying for
membership and attesting others — **without needing a NIP-07 browser extension**, while keeping
the extension path for those who have one. `[INFERRED]` Signing happens in the browser; the
member's secret key stays on their own device, encrypted, and is never sent to any server.
`[UNKNOWN]` The target mix of extension vs. non-extension members, and how much this is expected
to grow participation.

## 2. Personas
`[INFERRED]` from the story's "As a member/applicant without a NIP-07 extension" framing:
- **Non-technical member/applicant** — has a Nostr key (nsec) but no browser extension; wants to
  apply and attest from the LFO site directly, guided and reassured about key safety.
- **Extension user** — already runs Alby/nos2x; expects the existing flow untouched.
`[UNKNOWN]` Mobile vs. desktop split; how members currently store/back up their nsec.

## 3. Scope (as-built)
`[FROM FRAME]` / `[INFERRED]` Currently in scope:
- Local sign-in by entering an nsec, gated behind setting a **required passphrase**; the key is
  stored on-device only as a NIP-49 `ncryptsec`.
- In-app key generation that flows into the same passphrase setup.
- Returning-user **unlock** by passphrase (wrong passphrase rejected); **Sign out** (keeps
  encrypted login) vs **Forget this device** (wipes it).
- Local signing of LFO self-application and attestation events; attest available to any verified
  member who can sign.
- Unchanged NIP-07 extension path.
Explicitly **out** (story `Out of scope`): server-side/remote signing (Keycast), NIP-46/bunker,
multi-account storage, password-strength metering, passphrase recovery, changes to the LFO tag
event structure or verification algorithm.

## 4. Domain model
`[INFERRED]` No new domain concepts. Touches the existing **LFO tag** concept
(`39999:e83fff7a…:lfo`) only as the event target — structure unchanged. New stored shape (local,
per-device): `lfo_account = { pubkey, npub, ncryptsec, createdAt }`.

## 5. Design rules (as-built)
`[INFERRED]` from the shipped UI: passphrase setup must warn that the passphrase is unrecoverable
and the nsec must be backed up; copy must not claim the key "never leaves this page" once an
encrypted copy is persisted; attest controls are enabled for any signer (no "install an
extension" dead-end). `[UNKNOWN]` Whether a minimum passphrase strength beyond 8 characters, or a
"reveal/export my nsec" affordance, is desired.

## 6. Carry-forward & open questions
Promoted from build audit §6:
- Automate AC-7 (sign-out/forget) and the AC-9 generate-path warning.
- Remove dead code (`_hasExtension`, orphaned CSS) and the unreachable `apply-no-ext-msg` markup.
- Decide whether not-member "Try a different key" should wipe the stored account.
- Merge `feat/local-signing` → `main`.

## 7. What product must validate
- [ ] Is **persistent** local login (vs. session-only) the intended default for this community's
      privacy posture? (This reverses the original "only within a session" ask — §4 #1 of the audit.)
- [ ] Should losing access be softened — e.g., an explicit "export your nsec" / backup nudge —
      given lost passphrase + no nsec backup = permanent loss of the LFO-attested identity?
- [ ] Multi-device / multi-account expectations (today: single account per browser).
- [ ] Whether to surface a security explainer about in-browser key handling (XSS residual risk).
