# Test Plan: note-tagging Story 2 — Apply a tagging attestation

**Story:** `engineering-team/stories/note-tagging/2-apply-attestation.md`
**ADR:** `engineering-team/decisions/0040-apply-attestation.md`
**Date:** 2026-07-13

Client contract is pinned e2e with in-page stubs (`getFeed`, `LFOSigner`, `publishEventToRelay`,
`currentPubkey`) — no live relays, no real keys, no network. Server arming is pinned at unit level
with the existing filter-faithful relay fakes. The strongest wire pin is e2e: the exact §2-shaped
unsigned event captured at the signer boundary.

## Coverage map

| Criterion (story AC) | Test | File | Level |
|---|---|---|---|
| Four tags listed, live names/descriptions | `Search existing lists exactly the four armed tags…` | `tests/apply-attestation.spec.js` | e2e |
| §2 wire shape, member-signed, single publish to tagging relay | `local mode: confirm signs a §2-shaped assertion and publishes it once…` (captures kind/`e`/concept-`z`/descriptor-`z`/`polarity`/deterministic-`d`); parity: `test/builder-parity.test.js` (browser builder ≡ upstream SDK, incl. validation throws) | e2e + unit | |
| Optimistic reflection on relay OK | `success reflects optimistically: pill on the card, modal closed…` | e2e | |
| Applied-marked, idempotent re-apply | `a tag this member already applied is marked applied yet still clickable…` | e2e | |
| Both signer modes | local-mode tests + `extension mode: no in-app consent — selection goes straight to the signer` | e2e | |
| Consent panel (local, every apply, PO copy, member npub); Cancel inert | `local mode: the consent panel appears with the PO copy…` | e2e | |
| Signer declined → recover, nothing published | `signer declined → modal recovers, nothing published` | e2e | |
| Relay reject → inline error, no optimistic state, retry | `relay rejection → inline error, no optimistic state, retry publishes again` | e2e | |
| Header undiscoverable → fail gracefully, never mint | Unit (arming): `a tag with NO discovered header is not armed…`, `a NONCONFORMING header d-tag arms nothing… but its assertions still COUNT` (the ADR's read/write asymmetry); e2e: `unarmed payload → unavailable message; nothing applies` | `test/write-config.test.js` + e2e | unit + e2e |
| Apply new placeholder (updated copy), no publish on any inert path | `Apply new remains a placeholder…`; narrowed demo AC-5 in `tests/note-tagging.spec.js`; demo AC-7 (no side effects on open/toggle/close) retained unchanged | e2e | |
| Gating (signed-out) | demo AC-8 retained unchanged | e2e | |
| Payload arming (`tagging` field; degradation → absent) | `writeConfig … surfaces as the additive top-level tagging field`; `no writeConfig … → no tagging field` (+ unit: degradation yields no writeConfig) | `test/feed-event-tag.test.js`, `test/write-config.test.js` | unit |
| Applied-state data (per-tag appliers) | `taggedWith entries carry per-(tag,note) appliers…`; merge: `taggedWith entries keyed by slug union their appliers…`; shape updates to the #8/#9 `taggedWith` pins (now `{slug, name, description, appliers}`) | `test/write-config.test.js`, `test/merge-pools.test.js`, `test/fetch-tagged.test.js`, `test/multi-tag.test.js` | unit |

## Supersession (per story + ADR)
`tests/note-tagging.spec.js` AC-5 ("both views show the placeholder") is **narrowed**: unarmed
Search existing shows the *unavailable* state; Apply new keeps a placeholder with the updated copy.
The demo's no-side-effects and gating pins are retained verbatim — "nothing published" now holds
for Apply-new and all cancel/dismiss paths only, which the new spec re-pins explicitly.

## How to run
```
npm run test:unit
npx playwright test tests/apply-attestation.spec.js tests/note-tagging.spec.js
```

## Verification
RED confirmed 2026-07-13 (base: ADR commit):
```
Unit:       109 tests — 96 pass / 13 fail  (writeConfig, conformance gate, appliers shape,
            slug-keyed merge union, builder parity + validation, payload `tagging` field,
            re-shaped taggedWith pins — all behavior failures, no import errors)
Playwright: apply-attestation.spec.js 10 fail (modal unwired) ·
            note-tagging.spec.js: narrowed AC-5 fails, 7 demo tests still green
```
Two green-by-design guards: provider degradation currently yields no `writeConfig` and the payload
currently has no `tagging` field — both pin behavior that must remain true through the change.
