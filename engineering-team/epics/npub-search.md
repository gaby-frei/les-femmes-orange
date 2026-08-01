# Epic: npub-search

**Status:** Active
**Created:** 2026-07-30
**Book:** `engineering-team/audits/npub-search/book.md`

## Goal
Let members **find any Nostr identity from within the Members page** — by pasting an npub, hex
pubkey, or nprofile into a search bar above the verified-members grid — and let verified members
**attest a found candidate directly from the results panel**, using the same signed-attestation
mechanics the pending grid already runs.

## Why
Today a verified member's attestation reach stops at the pending grid: the only people they can
vouch for are people who already self-applied the LFO tag. The Members page FAQ documents the
resulting pain verbatim ("Why isn't the person I want to attest showing up in the pending list?").
Npub search removes the self-tag prerequisite — a member who knows someone's identity can vouch
for them directly, which is how vouching works in the physical world the Solution page describes.
The search UX repurposes the deployed brainstorm.world search page (reference in `tapestry/`).

## Stories
- #1 — `1-identity-search-attest` — **Single-match search:** identity-string search (npub / hex / nprofile) on the Members page: resolve to a single candidate rendered as a brainstorm-style row (photo, name, domain-verified NIP-05 ✓, right-justified status badge) in the dropdown panel; vouch from the panel via the extracted `publishVouch` core. Metadata-less keys vouchable with a trust warning (O3 reversed). *(Done — review PASS 2026-07-31, ADR 0041; on `feat/npub-search`, merge to main pending PO call)*
- #2 — `2-freetext-search-house-pov` — **Free-text search, house POV:** non-identity input (≥2 chars, live debounced) returns up to **6 ranked candidates** in the same panel, **highest trust first with numeric trust scores shown**, computed from the **designated house npub's** POV (placeholder: PO's provisioned pubkey `6db8a13f…`; target: official LFO account `5f0d66ba…` pending operator provisioning + LFO-signed 10040 — swap must need no re-engineering). Identity-search encouragement copy under results. Search backend (Open Ranking vs NIP-50) is this story's Architecture decision. *(Draft — determinations recorded 2026-08-01)*
- #3 — `3-personalized-pov-ranking` — **Personalized POV:** users can **opt into trust-ranked npub search and member views** — profiles with the highest trust scores *from that user's own point of view* appear first in the search panel **and** on the existing member grids (verified **and pending** — PO amendment 2026-07-30). *(Queued — PO scope call 2026-07-30)*

**Execution order:** #1 → #2 → #3. The candidate panel built in #1 must be reusable for #2's
multi-candidate ranked results; #3 layers a POV toggle over both #2's search ranking and the
existing members grid.
