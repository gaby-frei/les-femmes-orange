# Story 1: Npub search — find any Nostr identity from the Members page and attest from the panel

**Status:** Approved (PO, 2026-07-30)
**Created:** 2026-07-30
**Type:** Feature
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** the existing Members-page attestation flow (live-proven member-signed LFO attestations, with its feedback/retry/idempotency behavior) and the membership read pipeline (verified/pending sets).
**Experience reference:** the deployed brainstorm.world search page (`tapestry/ui/src/pages/BrainstormSearch.jsx` on main) — its identity-detection UX (npub / hex / nprofile → one resolved profile) is the pattern being repurposed.

## Background
A verified member's power to vouch currently stops at the **pending grid**: the only people they
can attest are people who already self-applied the LFO tag from their own account. The Members
page FAQ documents the resulting dead end verbatim — *"Why isn't the person I want to attest
showing up in the pending list?"* If the person you want to vouch for hasn't self-tagged (or
can't — no extension, no familiarity with the flow), you're stuck.

Npub search removes that prerequisite. A member who holds someone's Nostr identity — an npub
pasted from Telegram, a hex pubkey, an nprofile shared from another client — can look them up
directly on the Members page, confirm they've found the right person by profile, and attest them
on the spot. Vouching becomes "I know this person and here is their identity," matching how the
community actually operates.

Nothing about the trust model changes: the attestation published from the search panel is the
same member-signed event the pending grid publishes today, membership is still computed by
`tags.brainstorm.world`, and we still never write the NIP-51 list.

## User-facing description
As a **signed-in verified member** on the Members page, I want to paste any Nostr identity
(npub, hex pubkey, or nprofile) into a search bar above the verified-members grid and see who it
resolves to — their profile name and picture, their npub, and whether they're already a member —
in a horizontal dropdown panel, so that I can attest someone I trust **without waiting for them
to self-tag first**.

## Acceptance criteria
Testable from the outside. "Candidate panel" = the horizontal dropdown that opens beneath the
search bar.

- [ ] **Placement & gating.** Given a signed-in **verified member** viewing the Members page, the search bar renders above the verified-members grid (below the Telegram banner row). It introduces no new gating logic: the Members page is already reachable only by verified members (non-verified sign-ins are routed to the pending/apply state and never see the page), and the search bar simply inherits that gate.
- [ ] **Identity resolution — all three forms.** Given a valid `npub1…`, a 64-char hex pubkey, or an `nprofile1…` for the same identity, when entered, then all three resolve to the **same single candidate** in the panel.
- [ ] **Candidate presentation.** A resolved candidate renders **just like a profile on the existing member cards** (PO amendment 2026-07-30): display name, verification address (NIP-05), profile picture, shortened npub, and truncated bio — where available — plus a membership status the member can act on: **Verified**, **Pending**, or **Not yet a member**.
- [ ] **No profile found → still vouchable, with a warning.** *(Amended 2026-07-31 — PO rollback of the original O3 view-only rule + PO warning copy.)* Given a valid identity with no discoverable profile metadata, the candidate still appears — its short npub shown in the name slot — and can be vouched **like any other valid npub**, with this verbatim warning beneath: "⚠️ This profile is missing visible profile metadata. Double check that you know and trust the owner of this pubkey."
- [ ] **Attest from the panel.** Given a candidate who is not yet verified, when a verified member (able to sign — extension or unlocked local key, same rule as the pending grid) clicks the panel's attest action and completes signing, then an attestation identical in semantics to the pending-grid flow is published, with equivalent success feedback, error handling, and retry behavior.
- [ ] **Post-attest coherence.** After a successful attest from the panel, the candidate's shown status updates without a page reload, and the members grids reflect the new attestation the same way a pending-grid attest does today.
- [ ] **Already-verified candidate → status only.** Given a candidate who is already verified, the panel shows Verified status (and attester, where the grid would show it) and offers **no attest action** — search-attest is for vouching newcomers.
- [ ] **Loading feedback (PO amendment 2026-07-30).** Any lag between the member's search and the rendering of the candidate shows a loading/buffering indicator (icon or message) in the panel — the member is never left looking at a blank or frozen panel while relays are being queried.
- [ ] **Non-identity input.** Given a string that is not a valid identity, the member gets a clear, non-destructive inline indication that the input isn't a recognized identity — no broken panel, no failed-request noise, no change to the page beneath. (Story #2 will replace this dead end with fall-through to free-text search; the message may hint that name search is coming.)
- [ ] **Page integrity.** Opening, using, clearing, or abandoning the search never mutates the verified/pending grids, the feed, or session state. Dismissing the panel returns the page to its exact prior appearance.

## Concepts touched
Concept Graph API not reachable from this machine at planning time — named in plain language; the
Architect should resolve handles.

- **LFO membership tag** (the kind-39999 attestation concept) — the event the panel's attest action publishes; semantics unchanged.
- **Verified / pending member sets** — read to label candidate status and to gate who may attest.
- **Nostr profile metadata** (kind-0) — read to present candidates; sourcing is an Architecture decision.

## Out of scope
- **Free-text / name search** (multiple ranked candidates, house POV) and the Open Ranking vs NIP-50 backend decision — **story #2** (`2-freetext-search-house-pov`), per PO scope call 2026-07-30. The panel/UX built here must be reusable for #2's multi-candidate ranked results.
- **Personalized-POV trust ranking** (opt-in; search panel + members grid ordering) — **story #3** (`3-personalized-pov-ranking`).
- Any change to attestation event format, membership computation, or the NIP-51 list (read-only, always).
- Disputes, revocation, or un-attesting (note-tagging book's future territory).
- Search anywhere other than the Members page.

## Open questions
- **O1 — Free-text scope.** ~~Open~~ **Resolved (PO, 2026-07-30):** this story is **single-match identity-string search only**. Free-text search (multiple candidates, ranked from the Brainstorm house/network POV; Open Ranking vs NIP-50 decided in its Architecture) is **story #2**. Opt-in **personalized-POV** ranking of the search panel and the existing members grid is **story #3**.
- **O2 — Who can search.** ~~Open~~ **Resolved (PO, 2026-07-30):** the Members page is already gated to signed-in **verified** members (confirmed in code: the Members nav item is revealed only on the verified branch of sign-in; non-verified sign-ins are routed to the pending/apply state). The search bar inherits that gate — no new gating logic.
- **O3 — Attesting profile-less identities.** ~~Resolved 2026-07-30: blocked — view-only~~ **REVERSED (PO, 2026-07-31):** profile-less candidates are **vouchable like any other valid npub**; the "no profile found" copy is removed entirely. (The bech32 checksum remains the typo guard; identity confirmation is the vouching member's judgment.)
- **O4 — Already-verified candidates.** ~~Open~~ **Resolved (PO, 2026-07-30):** **status only, no action.**

## Amendments (post-implementation UI iteration)
- **2026-07-31 — Row-format candidates (PO directive, brainstorm.world screenshot reference).** The candidate panel renders full-width **rows** in a vertical dropdown list (not tiles): profile photo | display name with the verification address (✓-prefixed, orange) beneath | **status badge right-justified**. Reduced detail: no bio, no npub row — a profile-less candidate shows its short npub in the name slot. Spec T3/T4/T9 amended to the row contract (T4 adds a geometric right-justification check and asserts the absence of bio/npub-row); 14/14 green.

- **2026-07-31 — NIP-05 ✓ is earned, not decorative (PO option-b decision).** The candidate row's verification-address checkmark renders only after the app fetches the address's `/.well-known/nostr.json` and confirms the domain maps the name to this exact pubkey. Unreachable/CORS-blocked domains or mismatches simply show the address with no ✓ ("✓ when provable"). Session-cached per (address, pubkey). New spec case T4b pins both outcomes; T4 asserts no-✓ for unprovable claims. 15/15 green.

- **2026-07-31 — Badge copy:** "Not yet a member" → **"Not a member"** (PO). Spec regexes updated; 15/15 green.
- **2026-07-31 — O3 rollback (PO decision).** Profile-less search results are no longer view-only: the "no profile found" copy and the profile-metadata precondition on vouching are removed. A metadata-less candidate renders as an npub-only row and can be vouched like any other valid key. AC amended, O3 marked REVERSED, spec T9 re-pinned (vouch button present, copy absent); 15/15 green.
- **2026-07-31 — Metadata-less warning copy (PO, verbatim).** Under a metadata-less result: "This profile is missing visible profile metadata. Double check that you know and trust the owner of this pubkey." Amber `.candidate-warning` line in the row's identity column; T9 pins it verbatim; 15/15 green.

## Linked artifacts
- ADR: `engineering-team/decisions/0041-npub-identity-search.md` (Accepted 2026-07-30)
- Test plan: `engineering-team/stories/npub-search/1-identity-search-attest.test-plan.md` (spec: `tests/npub-search.spec.js` — T1–T13 red, T14 regression green, 2026-07-30)
- Review: (filled in after Review phase)
