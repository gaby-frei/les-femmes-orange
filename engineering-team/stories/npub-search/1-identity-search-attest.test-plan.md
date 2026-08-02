# Test Plan — npub-search #1: identity search + vouch from the panel

**Story:** `engineering-team/stories/npub-search/1-identity-search-attest.md`
**ADR:** `engineering-team/decisions/0041-npub-identity-search.md`
**Date:** 2026-07-30
**Spec:** `tests/npub-search.spec.js` (Playwright; PORT-aware config unchanged). No unit layer:
the only pure new function (`decodeIdentity`) lives in the page's inline script, so its contract
is pinned via `page.evaluate` in the same spec.

## Approach

The Members page is fully client-side; every network seam resolves through global bindings
(`queryRelay` → also feeds `queryRelays`, `publishEventToRelay`) and session caches
(`_tagItemsCache`, `_metaCache`) that prior specs already assign from `page.evaluate`
(`apply-attestation.spec.js` precedent). Each test boots the real page, installs stubs
**before** `showView('members')`, and drives the real `buildMemberSets` closure with synthetic
kind-39999 tag items:

- `SEED → ME` (ME is a verified member; signed-in as ME, `_isVerifiedMember = true`, signer stub can sign)
- `PENDING → PENDING` (self-applied, pending)
- `OUTSIDER` (33…) — in no tag item; profile served on relays
- `GHOST` (44…) — valid identity, zero profile anywhere

The `queryRelay` stub records every call (relay URL + filter) and serves kind-0 fixtures per
pubkey with configurable per-relay versions and delays — that is what lets the spec observe
fan-out breadth, progressive resolve, loading states, and the no-negative-cache rule from
outside.

## Seam contract pinned by the spec (from ADR 0041)

- DOM: `.member-search` block between the Telegram row and `#verified-members-section`, inside `#page-members`; `#member-search-input`; `#member-search-panel` (hidden until a search, `position: absolute` overlay); `.member-search-hint` for non-identity input; `.member-search-loading` while relays are in flight; candidate = `#member-search-panel .member-card.candidate` reusing `.member-name` / `.member-nip05` / `.member-bio` / `.member-npub-text` / `.member-badge` / `.attest-btn` ("Vouch").
- Badges: `✓ Member` / `Pending` / `Not yet a member`.
- `window.decodeIdentity(raw)` → `{ hex, hints[] } | null`; hints `wss://` only, deduped, ≤ 3.
- Profile lookup: parallel `queryRelay` fan-out over membership pair + `wss://purplepag.es` + `wss://relay.damus.io` (+ sanitized nprofile hints); first hit renders, strictly newer `created_at` upgrades; full miss is not negative-cached.
- Vouch wire shape (unchanged): kind 39999, `d` = `profile-tag-lfo-<tagged8>-<tagger8>`, `e` = LFO concept id, `z` = nostr-user-tag addr, `p` = target, `polarity` = 1; published via `publishEventToRelay` with brainstorm as confirmation relay.

## Cases

| # | Case | Story AC / ADR point |
|---|---|---|
| T1 | Search bar renders inside `#page-members`, above the verified grid, below the Telegram row; panel absent/hidden until a search | Placement & gating |
| T2 | `decodeIdentity` contract: hex/npub/nprofile → same hex; corrupted-checksum npub, 63-char hex, `nsec1…`, and prose → null; nprofile hints sanitized (wss-only, deduped, max 3) | Identity resolution; ADR decode seam |
| T3 | npub, hex, and nprofile of the same identity each render the same single candidate | Identity resolution — all three forms |
| T4 | Candidate card shows display name, NIP-05, truncated bio, short npub, `Not yet a member` badge, Vouch button (member-card parity) | Candidate presentation |
| T5 | With slow relays, the panel opens immediately in a loading state, then swaps to the candidate | Loading feedback (PO amendment) |
| T6 | Fan-out: one `queryRelay` call per relay — membership pair + both profile relays + both clean nprofile hints; a strictly newer profile from a slower relay upgrades the rendered name | ADR Option B: flat parallel + progressive resolve |
| T7 | Pending candidate: `Pending` badge + Vouch offered | Candidate presentation / vouch |
| T8 | Verified candidate: `✓ Member` badge, **no** vouch action | Already-verified → status only |
| T9 | Ghost (no profile on any relay): view-only card — npub shown, "no profile found" + outreach copy, no Vouch; clearing and re-searching re-queries the relays (no negative cache) | No profile found → view-only; ADR cache rule |
| T10 | Vouch from panel: exact wire shape signed by ME, published (brainstorm among targets); badge flips to `✓ Member`; verified grid gains the candidate and its count increments | Attest from panel; post-attest coherence |
| T11 | Signer declined → nothing published, Vouch button restored; relay rejection → non-broken inline state, page intact | Attest error paths (grid-equivalent behavior) |
| T12 | Non-identity input ("gigi") → inline hint, zero profile fan-out, grids untouched | Non-identity input |
| T13 | Dismissal: `Escape` hides the panel; verified-grid DOM byte-identical before/after; panel is an absolute overlay (never reflows the grid) | Page integrity |
| T14 | **Regression:** pending-grid Vouch still works end-to-end (publish fires, card moves pending → verified, counts update) — pins `applyLFOTag` behavior across the `publishVouch` extraction | ADR consequence: refactor touches live code |

## Amendments
- **2026-07-31 (PO row-format directive):** T4 re-pinned to the reduced-detail row contract — photo + name + verification address only, badge right-justified (geometric assertion), explicit absence of `.member-bio`/`.member-npub-row` on candidates. T3 dropped its npub-row assertion; T9 asserts the short-npub fallback via `.member-name`. All other cases unchanged.

- **2026-07-31 (PO option-b, NIP-05 verification):** new **T4b** — routes `/.well-known/nostr.json` and pins ✓-on-confirm / no-✓-on-mismatch; T4 additionally asserts no ✓ for an unreachable domain. 15 cases total.

- **2026-07-31 (PO O3 rollback):** T9 re-pinned — profile-less candidate = npub-only row, **vouchable**, no "no profile found" copy; no-negative-cache assertions unchanged.

- **2026-08-02 (story #2 test design):** T12 re-pinned — story #2 removes the non-identity
  dead end by design (≥2 chars becomes free-text search), so T12's dead-end-hint assertion is
  obsolete. Now asserts **below-minimum integrity**: a 1-char input fires zero relay fan-out
  and zero search-backend requests, renders no candidates, and leaves the grids untouched.
  Green before and after story #2. Free-text behavior is covered by T15–T27 in
  `2-freetext-search-house-pov.test-plan.md`.

## Expected initial state

T1–T13 FAIL against the current build — `#member-search-input` doesn't exist, `decodeIdentity`
is undefined, and no panel DOM renders. **T14 must PASS today** (it exercises only the existing
pending-grid flow) — it is the regression tripwire that must stay green while the Implementer
extracts `publishVouch` out of `applyLFOTag`. The full existing suite must stay green —
especially `apply-attestation.spec.js` and `v1-shell.spec.js`.
