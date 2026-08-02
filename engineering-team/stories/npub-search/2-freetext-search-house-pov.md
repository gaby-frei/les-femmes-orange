# Story 2: Free-text profile search — ranked candidates from the Brainstorm house POV

**Status:** Approved
**Created:** 2026-07-31
**Type:** Feature
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** npub-search #1 (search bar, candidate-row panel, `publishVouch` flow, decode-else-fall-through fork point, ADR 0041) — story #1 deliberately left non-identity input as a dead end for this story to convert.
**Experience reference:** brainstorm.world's search popup (`tapestry/ui/src/pages/BrainstormSearch.jsx`): debounced suggestions in a dropdown (6 per query), ranked with the active point of view's web-of-trust scores.

## Background
Story #1 made anyone findable **if you hold their exact identity string**. In practice members
usually hold a *name* — "search for Liz" — not an npub. Today typing a name into the search bar
hits the story-#1 dead end ("not a recognized identity"), which the panel copy already hints
will become real search.

This story converts that dead end into free-text profile search: any input that is *not* an
exact identity resolves as a name/text query across Nostr profiles and fills the same candidate
panel with **multiple ranked rows** — ranked by trust standing **from the Brainstorm
house/network point of view**, so well-connected, community-adjacent profiles surface first and
impersonators sink. Every candidate row keeps its story-#1 anatomy: photo, name, domain-verified
address, membership status, and the vouch action under the same rules.

The identity fast path is untouched: an exact npub/hex/nprofile still short-circuits to the
single-match flow without any search backend involved.

## User-facing description
As a **signed-in verified member** on the Members page, I want to type a person's *name* into
the search bar and see the most trustworthy matching Nostr profiles — ordered by the Brainstorm
network's view of them — so that I can find and vouch for someone even when all I have is what
they're called.

## Acceptance criteria
Testable from the outside. "Panel" = the story-#1 dropdown; "row" = the story-#1 candidate row.

- [ ] **Fall-through, not replacement.** Given input that decodes as an exact identity, the story-#1 single-match flow runs unchanged (no search backend contacted). Given non-identity input at or above the minimum query length, the same debounced flow now runs a free-text profile search instead of showing the dead-end hint.
- [ ] **Ranked multi-candidate panel.** A free-text query fills the panel with up to **6** candidate rows, ordered **highest trust first**, where trust is computed **from the perspective of the designated "house" npub** (see the House POV section below). Each row renders like a story-#1 candidate — photo, name, verification address (✓ only when domain-proven), right-justified membership badge, vouch action per the story-#1 rules (incl. the metadata-less warning where applicable) — **plus its numeric trust score displayed on the row** (PO determination 2026-08-01).
- [ ] **Identity-search encouragement copy.** Beneath free-text results (and in the no-matches state), the panel carries copy encouraging the member to search by npub, hex pubkey, or nprofile if they don't see the person they're looking for.
- [ ] **Vouch parity.** Vouching any listed candidate behaves identically to story #1 (same signed event, feedback, retry, post-vouch coherence); other rows in the panel are unaffected by one row's vouch flow.
- [ ] **Loading and dismissal parity.** The story-#1 loading state shows while the search is in flight; Escape / clear / click-outside dismissal and the page-integrity guarantees hold with multiple rows.
- [ ] **No matches.** A query the search finds nothing for shows a clear empty state in the panel (not a blank panel, not the identity dead-end hint).
- [ ] **Search unavailable.** If the search backend can't be reached, the panel says search is temporarily unavailable (non-broken, retryable by retyping); the identity fast path keeps working regardless.
- [ ] **Below minimum length.** Input shorter than **2 characters** (and not an identity) shows the panel's gentle prompt or stays closed — it never fires a backend query below the threshold. At or above it, free-text fires on the same live debounced trigger as story #1 (no Enter/button required).
- [ ] **Page integrity.** As in story #1: the grids, feed, and session state are never mutated by searching; dismissing restores the page exactly.

## House POV (PO determination, 2026-08-01)
Ranking is computed from the perspective of a **designated "house" npub** — a configurable
designation, not a hardcoded account:

- **Placeholder (now):** the PO's own account, `npub1dku2z0…` (hex `6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597`) — chosen because it is already a fully provisioned POV on `tags.brainstorm.world`: kind-10040 published 2026-05-05 (event `04477de0ef58af2a9f737fa55902fdaf2f8c5062a0567834b8f37db2e8edf882`, delegating `30382:rank` + `30382:followers` to rank author `39945424…` on `wss://nip85.nosfabrica.com`), with that rank author's scores confirmed loaded in the deployment's search index.
- **Target (later):** the official Les Femmes Orange account, `npub1tuxkd…` (hex `5f0d66bacc2313d42688ed847304c2b756e8bcce14eee8122520f9c908e998bc`). Verified 2026-08-01: the account exists with a fresh 209-follow graph but has **no kind-10040 yet** and is not yet a provisioned customer.
- **Swap dependency (external, not this story's work):** (1) the LFO pubkey is registered as a brainstorm customer (score computation + kind-30382 publication) **This registration is triggered during self-serve sign-up. (corrected by Gaby)**; (2) a one-time kind-10040 signed by the LFO key delegates rank to that author. The PO is obtaining the LFO account's key to complete step 2. Swapping the house designation must require **no re-engineering** — that configurability is part of this story's intent.

## Concepts touched
- **Nostr profile metadata** (kind-0) — the objects being searched and rendered.
- **Brainstorm house/network POV trust scores** — the ranking signal; how they're obtained (Open Ranking API vs NIP-50 vs other) is the Architecture decision this story defers.
- **LFO membership tag / member sets** — unchanged; still label each row's status and gate vouching.

## Out of scope
- **Personalized-POV ranking** and the opt-in member-grid re-ordering — story #3.
- NIP-05 identifier input (`name@domain` lookup) — future; treated as ordinary free text here.
- A full results page, pagination / "load more", or matched-tag chips (brainstorm has these; our surface is the panel only).
- Any change to the identity fast path, attestation format, or the NIP-51 list.

## Open questions
- **O1 — Result cap.** ~~Open~~ **Resolved (PO, 2026-08-01):** **6 candidates** per free-text query, plus copy encouraging identity-string search (npub / hex / nprofile) when the person isn't among them.
- **O2 — Trust-score display & POV.** ~~Open~~ **Resolved (PO, 2026-08-01):** rows **display the numeric trust score** and appear **highest-trust first**, computed from the **designated house npub's** perspective — placeholder = the PO's pubkey (already provisioned), target = the official LFO account once provisioned. See "House POV" section.
- **O3 — Trigger & minimum length.** ~~Open~~ **Resolved (PO, 2026-08-01):** **live debounced trigger, minimum 2 characters** — same interaction as story #1, no Enter/button.

## Linked artifacts
- ADR: `engineering-team/decisions/0042-freetext-search-house-pov.md` (Accepted 2026-08-02) — supporting reference: `docs/meili-search-proxy-contract.md`, `docs/open-ranking-ore-algorithms.staging.json`
- Test plan: `engineering-team/stories/npub-search/2-freetext-search-house-pov.test-plan.md` (T15–T27 red at `7888d52`; story-#1 T12 amended)
- Review: (filled in after Review phase)
