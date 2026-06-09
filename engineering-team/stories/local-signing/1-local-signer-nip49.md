# Story 1: In-browser local signing for users without a NIP-07 extension

**Status:** Draft
**Created:** 2026-06-09
**Type:** Feature

## Background
Les Femmes Orange membership is peer-verified: people self-apply by publishing an LFO tag event,
and verified members attest others by publishing an LFO tag event naming them. Today every one
of these events is signed by a NIP-07 browser extension (Alby, nos2x, …). A user without an
extension can sign in with their secret key to *browse* membership, but cannot self-apply or
attest — the attest button is shown disabled with an "install a Nostr extension" tooltip.

This excludes less-technical members, which undercuts a community built on peer attestation. We
want to let people sign these events directly in the browser, with their key held only on their
own device in encrypted form, while keeping the extension path for those who prefer it.

## User-facing description
As a member (or applicant) **without a NIP-07 extension**, I want to sign in with my secret key
and have the app sign my membership events for me — without my secret key ever being stored
unprotected or sent anywhere — so that I can self-apply and attest others just like extension
users can.

## Acceptance criteria
Testable from the outside.

- [ ] Given a user with no NIP-07 extension, when they sign in by entering their secret key and set a passphrase, then they reach the same membership/members experience as an extension user and are able to publish membership events.
- [ ] Given a user who has set up local signing, when their key is saved on the device, then only an encrypted form of the key is present in device storage — the raw secret key (nsec / hex) is never written to device storage at any point.
- [ ] Given a returning user on the same browser, when they revisit the site, then they are prompted to unlock with their passphrase (not to re-enter their secret key), and on the correct passphrase they regain signing ability.
- [ ] Given a returning user, when they enter an incorrect passphrase, then they see a clear "incorrect passphrase" message and are not signed in or able to sign.
- [ ] Given a verified member who signed in with a local key and unlocked it, when they view a pending member, then the "Attest as Member" action is available (enabled), and attesting publishes a valid signed LFO tag event.
- [ ] Given a non-member who signed in with a local key (entered or generated in-app), when they apply for membership, then a valid signed application event is published and they appear as pending.
- [ ] Given a signed-in local-key user, when they choose "Sign out," then their key is removed from memory but the encrypted login remains so they can unlock next visit; and when they choose "Forget this device," then the encrypted login is removed from device storage entirely.
- [ ] Given a user with a NIP-07 extension, when they sign in and sign events, then the experience is unchanged and no key is stored by the app on the device.
- [ ] Given any flow where a user sets a passphrase or generates a key, then they are clearly warned that the passphrase cannot be recovered and that they must keep a backup of their secret key (losing both means losing the identity).

## Concepts touched
- LFO tag concept — `39999:e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c:lfo` (the tag whose application/attestation events users publish). This story changes *who can sign* those events, not their structure.

## Out of scope
- Any server-side key custody or remote signer (Keycast and similar were considered and rejected).
- NIP-46 / bunker connections.
- Changing the LFO tag event structure, the membership/verification algorithm, or the relay set.
- Multiple stored identities per browser (single stored account; signing in with a different key replaces it).
- Password-strength meters beyond a simple minimum-length check.
- Recovering or resetting a lost passphrase (impossible by design; only warned about).

## Open questions
Resolved at intake (user-confirmed defaults):
- Persistence: key persists across visits (encrypted); "Sign out" keeps it, "Forget this device" wipes it. → confirmed
- Encryption: NIP-49 passphrase is **required** (no raw-key storage). → confirmed
- Passphrase policy: minimum length + confirmation field. → confirmed
- Single stored account (overwrite on new key). → confirmed

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
