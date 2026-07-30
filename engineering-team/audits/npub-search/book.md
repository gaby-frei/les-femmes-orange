# Book of Work: Npub search (find + attest any Nostr identity)

**Slug:** npub-search
**Status:** Open
**Opened:** 2026-07-30

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below.

### Acceptance frame

- [ ] A signed-in member on the Members page can enter a Nostr identity as a string — npub, hex pubkey, or nprofile — into a search bar situated above the verified-members grid, and see the resolved identity presented as a candidate in a horizontal dropdown panel, rendered like the existing member cards (display name, verification address, picture, shortened npub, truncated bio — where available) plus current membership status.
- [ ] A verified member can attest a candidate directly from that panel, with the same member-signed attestation semantics the pending grid already uses — removing the "self-tag first" prerequisite for being vouchable.
- [ ] Input that is not an exact identity resolves as a free-text query returning multiple ranked candidates in the same panel, ranked from the **Brainstorm house/network POV** (backend decided in story #2's Architecture: Open Ranking vs NIP-50).
- [ ] Users can **opt into personalized-POV trust ranking**: with the opt-in active, profiles with the highest trust scores from the user's own point of view appear first in the search panel and on the existing member grids (verified and pending).

## Epics in this book
- `npub-search` — identity search + attest-from-panel on the Members page, repurposing the brainstorm.world search UX (reference: `tapestry/ui/src/pages/BrainstormSearch.jsx`). Three stories: #1 single-match identity search, #2 free-text search (house POV), #3 opt-in personalized-POV ranking (search panel + verified and pending member grids).

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at open:** medium — the identity-resolution + attest slice (#1) is well-understood (the attestation write path is live-proven); #2's backend (Open Ranking vs NIP-50) and #3's personalized-POV sourcing are Architecture decisions still ahead.

## Decided constraints (carried into Architecture)
- Attestation from the panel **reuses the existing attestation semantics** (member-signed kind-39999 LFO tag event, existing feedback/error/idempotency behavior) — no new event formats, no changes to membership computation, and never any write to the NIP-51 list (we remain read-only consumers of it).
- The search UI/logic **repurposes the deployed brainstorm.world search page** (main branch, in `tapestry/`) rather than being designed from scratch.
- Search backend for non-identity input (Open Ranking vs NIP-50) is an **Architecture-phase decision**, not settled at intake.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/npub-search/audit.md`
- Product feedback: `engineering-team/audits/npub-search/prd-seed.md`
