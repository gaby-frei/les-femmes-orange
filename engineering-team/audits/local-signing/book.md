# Book of Work: Local in-browser signing

**Slug:** local-signing
**Status:** Closed
**Opened:** 2026-06-09
**Closed:** 2026-06-09

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below.

### Acceptance frame

- [x] A user without a NIP-07 extension can sign LFO tagging events (self-apply and attest others) from within the LFO app.
- [x] Such a user's key is persisted on their device only in encrypted (NIP-49) form — the raw nsec is never written to device storage.
- [x] Setting up local signing requires a passphrase; a returning user unlocks with the passphrase (without re-pasting their nsec).
- [x] The existing NIP-07 extension sign-in and signing path is preserved and unchanged for extension users.
- [x] The attest action is available to any signed-in verified member who can sign (extension or unlocked local key), not only extension users.
- [x] Users are clearly warned that the passphrase is unrecoverable and that they must back up their nsec.

## Epics in this book
- `local-signing` — give non-extension users an in-browser, passphrase-encrypted signing option alongside NIP-07.

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at close:** high

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/local-signing/audit.md`
- Product feedback: `engineering-team/audits/local-signing/prd-seed.md`
