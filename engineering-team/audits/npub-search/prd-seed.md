# PRD Seed: Member discovery & web-of-trust ranking ("npub search")

**Mode:** reconstructed from as-built *(no prior PRD)*
**Build audit:** `engineering-team/audits/npub-search/audit.md`
**Anchor:** acceptance frame in `book.md`
**Confidence:** high *(frame captured at kickoff; every deviation PO-ratified in-phase)*
**Date:** 2026-08-14

> Reverse-engineered baseline in the product-team PRD shape. A strawman for `/discover` on
> the next phase, not a ratified spec. Tags: `[FROM FRAME]` / `[INFERRED]` / `[UNKNOWN]`.

## 1. Product vision

`[FROM FRAME]` Members can find **anyone on Nostr** — by exact identity or by name — and
vouch them into the community directly from the search surface, removing the "self-tag
first" prerequisite for membership candidacy.
`[INFERRED]` The deeper move the book made: the Members page became a **web-of-trust
lens**. Every person shown — search result or member card — carries a numeric trust score
and ranks by it, from an explicit, switchable perspective (the community's, or your own).
Trust is never presented as a global fact, only as *someone's view* — the protocol's
POV-first principle surfaced as UX.
`[UNKNOWN — product input needed]` Whether discovery-and-vouch or trust-legibility is the
primary product value going forward; the next phase should pick, since it steers whether
investment goes to search reach (NIP-05 input, pagination) or to trust surfaces (feed
personalization, richer score explanations).

## 2. Personas

`[INFERRED]` from story "As a…" lines:
- **The connector** (verified member): knows someone who belongs here — has their npub or
  just their name — and wants to find and vouch them in one motion. Primary actor of
  stories #1/#2.
- **The evaluator** (signed-in member): scans the community and candidates through trust
  scores; may switch to their own perspective to sanity-check the community's. Primary
  actor of #3/#4/#5.
- `[UNKNOWN]` The **searched-for outsider** was never modeled (what do they experience
  after being vouched? onboarding was out of every story's scope).

## 3. Scope (as-built)

`[FROM FRAME]` Identity search (npub/hex/nprofile) → single candidate → vouch from panel;
free-text search → ≤6 trust-ranked candidates with visible scores (house POV); opt-in
personal-POV ranking on search and both member grids.
`[INFERRED]` (PO-added during the book): trust chips on every member card; grids
trust-ordered in *both* views; vouched members slot into rank position; readiness-gated
opt-in (disabled toggle + explanation for unprovisioned members); session-scoped view
choice defaulting to the community; production-ORE backend with client-side profile joins.
**Explicitly out (deferred, not rejected):** NIP-05 identifier input; pagination/full
results; feed personalization; in-app provisioning journey; cross-session view
persistence *(rejected, PO determination)*.

## 4. Domain model

`[INFERRED]` from ADRs 0041–0046 and the as-built inventory:
- **Identity** — npub / 64-hex / nprofile, one pubkey. **Profile** — kind-0 metadata,
  relay-sourced, newest-wins, cache-shared across surfaces.
- **Membership status** — verified / pending / none, derived from the kind-39999 LFO tag
  graph (unchanged by this book). **Vouch** — member-signed kind-39999 attestation; one
  write path (`publishVouch`) for all surfaces.
- **Trust score** — GrapeRank influence (0–1, displayed ×100), computed by the ORE
  provider from FOLLOWS/MUTES/REPORTS (**not** from taggings — settled policy), always
  relative to a **perspective**.
- **Perspective (POV)** — a pubkey; two roles: *house* (community default; config
  constant, LFO-account swap pending) and *mine* (the signed-in member, gated on
  **provisioning** — whether the provider has computed that pubkey's WoT).
- **Ranked result** — search relevance = text-match × perspective-trust (server-fused,
  ordering only); display score always from the rank endpoint (single source with cards).

## 5. Design rules (as-built)

`[INFERRED]` from shipped UI + review notes; no formal guide exists (`[UNKNOWN]` whether
product wants one):
- Plain language for trust concepts — "Community view / My view," never POV/WoT jargon;
  score chips 🏅 0–100, identical form everywhere a score appears.
- Trust surfaces are **enhancement-only**: score/backend failures degrade to chipless,
  unordered, or disabled states — never errors, never blocked rendering.
- One perspective per page: all trust surfaces switch together; the active view is
  always visible (toggle state + inline "— searching as …" indicator).
- Every search state is designed (loading / empty / unavailable / below-minimum), each
  with copy steering the member to what still works (identity search).
- Unproven claims are visually silent (NIP-05 ✓ only when domain-proven; no chip without
  a score; ⚠️ warning on metadata-less profiles).

## 6. Carry-forward & open questions

Promoted from audit §6: LFO house-account swap (config-only, externally blocked);
ORE personalization-status message adoption (retires the readiness probe heuristic);
`builder-parity` test drift; NIP-05 identifier input; pagination; feed personalization;
operator asks (observer echo / LFO-POV verification).

## 7. What product must validate

- [ ] Primary value going forward: discovery-and-vouch vs trust-legibility (§1).
- [ ] The searched-for outsider's journey — vouched, then what? (§2)
- [ ] Whether grids being trust-ordered in the *community* view (beyond the frame's
      opt-in-only wording) matches product intent, or ordering should be opt-in too (§3;
      audit §4 #6).
- [ ] My-view sparsity UX: is "fewer results under your own view" acceptable long-term,
      or does it need explanatory copy/backfill once more members are provisioned?
- [ ] Whether/when to invest in the provisioning journey ("set up my view") — currently
      no in-app path exists and the toggle is invisible-when-useless by design.
- [ ] Score display semantics: 🏅 chips show *relationship-to-perspective*, not
      reputation — is that legible enough, or does it need a "what is this?" explainer
      (deliberately excluded from story #3)?
