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
- #2 — `2-freetext-search-house-pov` — **Free-text search, house POV:** non-identity input (≥2 chars, live debounced) returns up to **6 ranked candidates** in the same panel, **highest trust first with numeric trust scores shown**, computed from the **designated house npub's** POV (placeholder: PO's provisioned pubkey `6db8a13f…`; target: official LFO account `5f0d66ba…` pending operator provisioning + LFO-signed 10040 — swap must need no re-engineering). Identity-search encouragement copy under results. Search backend decided in ADR 0042 (Accepted 2026-08-02): brainstorm meili proxy, client-side rank re-sort, house POV as config constant; ORE `/search/pubkeys` documented as probable successor. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/2-freetext-search-house-pov.md`)*
- #3 — `3-personalized-pov-ranking` — **Personalized POV — "Community view"/"My view" toggle:** pill segmented control (Brainstorm-UI reference) after the Telegram banner; visible-but-disabled when the member's own perspective has no scores (readiness probe each Members-page visit; disabled copy "My view isn't available for your account yet."); Community view default every session; switching re-ranks all three trust surfaces coherently (no stale cross-POV numbers — PO prefers cache re-key by (perspective, pubkey)); inline "— searching as" indicator (decrowding pass); grid-only header underlines. *(**Done** — review PASS 2026-08-06, `reviews/npub-search/3-personalized-pov-ranking.md`)*
- #4 — `4-member-card-trust-scores` — **Mini: house-POV scores on member cards:** every card in the verified + pending grids shows the same 0–100 trust chip as the #2 search rows, from one batch ORE `/rank/pubkeys` call (Route B — PO pick 2026-08-02, ADR 0043: search converges on ORE later, ending chip/card drift). Display-only; enhancement-only failure. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/4-member-card-trust-scores.md`)*
- #5 — `5-trust-ordered-grids` — **Mini: trust-ordered member grids:** each grid renders cards in descending trust-score order (upper-left first), score-less last, **POV-agnostic** — supersedes #4's display-only constraint and narrows #3's grid scope to a POV swap. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/5-trust-ordered-grids.md`)*
- #6 — `6-search-ore-migration` — **Search → ORE migration:** free-text search moves from the meili proxy to ORE `/search/pubkeys` (`relevance-pov`, personalization probe-verified 2026-08-05 — ADR 0042 rewrite), completing ADR 0043's convergence: matching+order from ORE search, row chips from the shared `/rank/pubkeys` batch/cache, kind-0 metadata joined over the story-#1 wide relay set, both ORE calls on `brainstormserver.nosfabrica.com` (moves #4's shipped rank URL), unavailable-state-only fallback with identity-search prompt. *(**Done** — review PASS 2026-08-05, `reviews/npub-search/6-search-ore-migration.md`)*

**Execution order:** #1 → #2 → #4 (mini) → #5 (mini) → #6 → #3. The candidate panel built in #1 must be reusable for #2's
multi-candidate ranked results; #3 layers a POV toggle over both #2's search ranking and the
existing members grid.
