# Epic: local-signing

**Status:** Active
**Created:** 2026-06-09
**Book:** `engineering-team/audits/local-signing/book.md`

## Goal
Let people participate in Les Femmes Orange's peer-verification (self-applying for membership and
attesting others) **without requiring a NIP-07 browser extension**, while keeping the extension
path for those who have one. Signing happens in the browser; the user's secret key is held on
their own device, encrypted, never handed to any server.

## Why
Today all tagging events are signed via `window.nostr.signEvent()` (NIP-07 only). Users without
an extension can sign in to browse but cannot apply or attest — the attest button is disabled
with an "install an extension" tooltip. This excludes a large share of less-technical members,
which is at odds with a community whose whole purpose is peer attestation.

## Stories
- #1 — `1-local-signer-nip49` — In-browser local signer with required NIP-49 passphrase, alongside NIP-07.
