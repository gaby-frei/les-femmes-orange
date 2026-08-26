# Epic: npub-search

**Status:** Active
**Created:** 2026-07-30
**Books:** `engineering-team/audits/npub-search/book.md` (Closed — stories #1–#6) · `engineering-team/audits/pov-availability/book.md` (Open — stories #7–#10)

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

## Continuation (stories #7–#10, book `pov-availability`)
The epic continues into a second book. Stories #1–#6 made the Members page a web-of-trust lens —
search, trust chips, trust-ordered grids, and a Community/My view perspective toggle. Stories
#7–#10 make that lens **honest when a perspective cannot be served**: the trust provider now
refuses a perspective it has no scores for instead of returning silent zeros, so the page must
say whose judgment it is actually showing, and pick the best perspective it can serve. Anchored
to a PRD (`product-team/prd/pov-availability.md` §8.1) rather than an acceptance frame — the
first PRD-backed work in this repo, arriving via the return edge that the `npub-search` book's
close opened.

## Stories
- #1 — `1-identity-search-attest` — **Single-match search:** identity-string search (npub / hex / nprofile) on the Members page: resolve to a single candidate rendered as a brainstorm-style row (photo, name, domain-verified NIP-05 ✓, right-justified status badge) in the dropdown panel; vouch from the panel via the extracted `publishVouch` core. Metadata-less keys vouchable with a trust warning (O3 reversed). *(Done — review PASS 2026-07-31, ADR 0041; on `feat/npub-search`, merge to main pending PO call)*
- #2 — `2-freetext-search-house-pov` — **Free-text search, house POV:** non-identity input (≥2 chars, live debounced) returns up to **6 ranked candidates** in the same panel, **highest trust first with numeric trust scores shown**, computed from the **designated house npub's** POV (placeholder: PO's provisioned pubkey `6db8a13f…`; target: official LFO account `5f0d66ba…` pending operator provisioning + LFO-signed 10040 — swap must need no re-engineering). Identity-search encouragement copy under results. Search backend decided in ADR 0042 (Accepted 2026-08-02): brainstorm meili proxy, client-side rank re-sort, house POV as config constant; ORE `/search/pubkeys` documented as probable successor. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/2-freetext-search-house-pov.md`)*
- #3 — `3-personalized-pov-ranking` — **Personalized POV — "Community view"/"My view" toggle:** pill segmented control (Brainstorm-UI reference) after the Telegram banner; visible-but-disabled when the member's own perspective has no scores (readiness probe each Members-page visit; disabled copy "My view isn't available for your account yet."); Community view default every session; switching re-ranks all three trust surfaces coherently (no stale cross-POV numbers — PO prefers cache re-key by (perspective, pubkey)); inline "— searching as" indicator (decrowding pass); grid-only header underlines. *(**Done** — review PASS 2026-08-06, `reviews/npub-search/3-personalized-pov-ranking.md`)*
- #4 — `4-member-card-trust-scores` — **Mini: house-POV scores on member cards:** every card in the verified + pending grids shows the same 0–100 trust chip as the #2 search rows, from one batch ORE `/rank/pubkeys` call (Route B — PO pick 2026-08-02, ADR 0043: search converges on ORE later, ending chip/card drift). Display-only; enhancement-only failure. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/4-member-card-trust-scores.md`)*
- #5 — `5-trust-ordered-grids` — **Mini: trust-ordered member grids:** each grid renders cards in descending trust-score order (upper-left first), score-less last, **POV-agnostic** — supersedes #4's display-only constraint and narrows #3's grid scope to a POV swap. *(**Done** — review PASS 2026-08-02, `reviews/npub-search/5-trust-ordered-grids.md`)*
- #6 — `6-search-ore-migration` — **Search → ORE migration:** free-text search moves from the meili proxy to ORE `/search/pubkeys` (`relevance-pov`, personalization probe-verified 2026-08-05 — ADR 0042 rewrite), completing ADR 0043's convergence: matching+order from ORE search, row chips from the shared `/rank/pubkeys` batch/cache, kind-0 metadata joined over the story-#1 wide relay set, both ORE calls on one shared host constant (originally `brainstormserver.nosfabrica.com`; **reversed to `api.brainstorm.world` by settled policy 2026-08-14** — story #6 amendments), unavailable-state-only fallback with identity-search prompt. *(**Done** — review PASS 2026-08-05, `reviews/npub-search/6-search-ore-migration.md`)*

- #7 — `7-my-view-availability-states` — **Why My view isn't available:** when the member's own perspective cannot be served, the page names the cause — `My view isn't available yet because your account isn't registered with Brainstorm.` — or, when her scores are being calculated, gives the wait as a spoken interval from the provider's own estimate. **Retires story #3's `rank > 0` readiness heuristic** in favor of the provider's explicit state (the `_intake.md` follow-up logged 2026-08-14, unblocked 2026-08-24). No provider-authored text reaches the page. Dimmed segment stays keyboard-reachable so its explanation travels with it. *(**Done** — review CHANGES REQUESTED → resolved `ddc91d5`, `reviews/npub-search/7-my-view-availability-states.md`; live-preview checks outstanding)*
- #8 — `8-community-refusal-preference-order` — **Preference order and the community refusal:** both perspectives resolve independently, and the page shows the most community-specific one that can actually be served — community, then the member's own, then unpersonalized. A refused community perspective with a working personal one **substitutes My view and says so** (the only announced perspective change in the product); neither servable renders unpersonalized results labelled as such on toggle, indicator, and panel. A refusal never renders as "no matches" or as a search failure. An explicit choice outranks the preference order. *(**Done** — review CHANGES REQUESTED → resolved 2026-08-26, `reviews/npub-search/8-community-refusal-preference-order.md`; community-declined states unverified live by PO decision)*
- #9 — `9-recovery-without-reload` — **Recovery on return:** a refused perspective holds for the rest of that Members-page visit and is re-checked on the next one, so recovering needs no reload. Promoted from Stretch by PO decision 2026-08-25 (PRD §11 Q5); ADR 0047 leaves recovery to a reload and names the gap itself. *(Queued — PRD §5.1 rule 5, §6. **Depends on #7, #8.**)*
- #10 — `10-perspective-control-accessibility` — **Mini: contrast and target minimums:** status-line and panel text to 4.5:1 (the shipped grey measures 4.48:1 for 12px text); both toggle segments to a 44px minimum (currently ~34px). **Pre-existing shipped defects surfaced by the design review**, kept as their own story so a copy change and a defect fix do not arrive in one diff. No copy, layout, or behavior change. *(**Done** 2026-08-26 — measured 44.0px and 6.39:1; Test Design and Review skipped at PO direction, see the story's Process note)*

**Execution order:** #1 → #2 → #4 (mini) → #5 (mini) → #6 → #3 → **#7 → #8 → #9**, with **#10** insertable
anywhere (unblocked). #8 applies #7's per-perspective state model to two perspectives at once and adds the
rule for choosing between them; #9 defines when those states are re-resolved, so it needs both. The candidate panel built in #1 must be reusable for #2's
multi-candidate ranked results; #3 layers a POV toggle over both #2's search ranking and the
existing members grid.
