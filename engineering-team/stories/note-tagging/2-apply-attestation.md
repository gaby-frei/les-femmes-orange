# Story 2: Apply a tagging attestation — "Search existing" over the four supported tags

**Status:** Draft
**Created:** 2026-07-12
**Type:** Feature
**Epic:** `note-tagging` · **Book:** `note-tagging`
**Builds on:** note-tagging #1 (demo UI, ADR 0039) · community-feed #8–#10 (read path, ADRs 0036–0038) · `local-signing` book (signer surface)
**Normative external reference:** `lfo-tagging-integration-guide.md` — **§0** (runtime TA), **§2** (wire shapes), **§3** (SDK, "don't hand-roll"), **§4** (write flow), **§5** (CORS boundary), **§9** (gotchas). Cited per section below.

## Background
This is the app's **first write surface**. Story #1 shipped the affordance as an inert demo (plus
button → "Add a tag" modal, two views, placeholder copy). The protocol has since shipped and the
app already *reads* event-tags end-to-end. This story wires the **"Search existing" view only** to
the real thing: a signed-in verified member selects one of the **four supported tags** (Bitcoin,
Nostr, LFO Community, Ask LFO — the `EVENT_TAGS` set from community-feed #9) and applies it to the
note, publishing a **tagging assertion** signed with **their own key**.

Per guide **§4**, the write flow is entirely client-side in nature: *build the unsigned event (SDK)
→ sign (the member's signer) → publish (to the relay)*. Because all four supported tags already
exist with honored tagging headers on the relay, a conforming apply publishes **exactly one
kind-39999 assertion event** — the guide's §3 orchestrator would mint a missing tag-element or
header first, but minting is **explicitly forbidden** in this story (see Decided constraints).

**Posture change, recorded for the book:** the app stops being a pure reader. What it writes is
narrow — member-signed *tagging attestations*, never social content, never the membership list —
and each write is an ordinary permissionless Nostr publish under the member's own key (guide §1:
"publishing is permissionless; *counting* is per-POV" — our own read path's member filter is what
makes these attestations count).

## User-facing description
As a **signed-in verified member** browsing the feed, when I see a note that belongs under one of
our community tags, I want to click the note's "+" button, pick the tag from **Search existing**,
and apply it — signed by me, visible on the note right away — so that my curation judgment feeds
the community feed the same way other members' tags already do.

## The apply flow (normative for this story)
1. **Entry.** The #1 demo affordance, unchanged in placement: plus button → "Add a tag" modal.
2. **Search existing** lists the **four supported tags** with their **runtime display names and
   descriptions** (the same live tag-element metadata the pills use — never hardcoded copy; slug
   fallback on metadata failure, matching #8's rule). No relay-wide tag search — the list *is* the
   supported set. Tags **this member already applied to this note** are marked as applied but stay
   clickable — re-applying is an idempotent overwrite and doubles as a retry (guide **§2**: the
   assertion `d` tag is deterministic per (tag, target, asserter); kind 39999 is replaceable).
3. **Apply.** On selection + confirmation, build the assertion **with the SDK's builders — never
   hand-rolled** (guide **§3**/**§9**): target `e` = the note id; the concept `z` and descriptor
   `z` composed against the **runtime TA** (guide **§0**) and the tag's **discovered tagging
   header**; `polarity` = apply. Sign with the member's own signer — **NIP-07 or the in-app local
   signer, both** (guide §4: "any Nostr signer works"); never any key but the member's. Publish to
   **`wss://tags.brainstorm.world/relay`** (guide §1 — the only relay tagging events live on).
4. **Feedback (PO decision 2026-07-12): optimistic pill + toast.** On relay acceptance the modal
   closes, a brief confirmation shows, and the note's card reflects the tag immediately
   (client-side state update — pill appears; derived header counts follow from the same state).
   The next feed load reconciles with relay truth.
5. **Errors.** Signer declined → modal stays open, neutral message, nothing published. Relay
   reject/timeout → inline error with retry (safe: idempotent). Failures never navigate, never
   corrupt the feed view.
6. **Apply new** stays non-functional: its placeholder copy updates to say authoring new tags
   isn't supported yet (the old "no support for event tags" line is now false).

## Responsibilities — who does what (amendment, 2026-07-13)
- **Our server:** resolves the runtime TA (guide §0; the app's ONLY Brainstorm REST touchpoint,
  server-side per §5's CORS rule) and arms the modal with data it already fetches per feed request:
  the four supported tags' live names/descriptions, each tag's discovered header coordinate, and
  per-tag applier identities (for applied-state marking). The server never signs, never holds keys,
  never proxies the publish.
- **The client:** everything interactive — list/select, build the unsigned assertion (vendored SDK
  builders, §2/§3), sign via the existing `LFOSigner` facade, publish over the relay WebSocket
  (the `applyLFOTag` membership-attestation precedent), optimistic pill + toast.
- **Brainstorm's side:** its **relay** receives an ordinary permissionless Nostr publish; its REST
  API is involved only as the server-side TA lookup. Reconciliation is our own read pipeline on the
  next feed load — the member filter admits the new assertion.

## The signing confirmation panel (amendment, 2026-07-13 — PO decisions)
Local-mode signing is silent (no extension popup), so an explicit consent step precedes it:

- **Local-signer mode only.** Extension users go from tag selection straight to their extension's
  own approval popup (that popup is their consent step). **Shown on every apply** — no
  don't-ask-again state.
- **Content swap, not a stacked modal:** selecting a tag swaps the "Add a tag" panel to the
  confirmation view; Cancel returns to the tag list with nothing signed or published.
- **Copy (fixed by PO, 2026-07-13):**
  > **Sign & publish this tag?**
  > Applying "«Tag Name»" will:
  > • create a public Nostr event signed with your key («npub1xx…xx»)
  > • publish the Nostr event to the community tagging relay
  >
  > [ Cancel ]   [ Sign & publish ]
  The npub shown is the member's own (short form). The copy deliberately says **public** and makes
  no promise of undo/revocation (out of scope).
- Confirm → brief signing/publishing state → toast + optimistic pill (the existing flow).

## Decided constraints
- **Assertion-only publishing. Never mint.** If a supported tag's tagging header cannot be
  discovered at apply time, the apply **fails gracefully** — the app must not create tag-elements
  or headers (that is authoring infrastructure, out of scope). Consequence of guide §3's
  orchestrator semantics, deliberately narrowed.
- **The four supported tags only** — the `EVENT_TAGS` config set. No other tag can be applied,
  searched, or listed.
- **The member's key signs. Always.** No TA signing, no server-held keys, no delegation.
- **Runtime TA everywhere** (guide §0); the browser must NOT call the tags.brainstorm.world REST
  API directly — it is same-origin only (guide **§5**); anything the client needs (TA, supported
  tags, header coordinates, applied-state data) arrives via our own server or via the relay
  WebSocket, which is CORS-free (§5). How is the Architect's decision.
- **Applied-state truthfulness.** "Applied by me" marking must come from real data (server-provided
  per-tag applier identities or a relay read) — not from local memory alone; local state may
  *augment* it for the optimistic window.
- **Write access assumed proven, verified in implementation** (guide **§9** checklist): members'
  own keys already publish tagging events to this relay via Brainstorm's UI (all live LFO
  assertions are member-signed), so acceptance is expected; the implementation phase must still
  verify an end-to-end publish from *our* app against the live relay.
- **Test supersession, scoped precisely:** #1's spec pins "nothing is ever published" for both
  modal views. This story supersedes that pin **for Search existing only**; it must remain true
  for **Apply new** and for every dismissal/cancel path.

## Acceptance criteria
- [ ] Given the modal's Search existing view, then it lists exactly the four supported tags with
  their live names and descriptions (slug fallback on metadata failure).
- [ ] Given a member selects a tag and confirms, then a single kind-39999 tagging assertion —
  correctly shaped per guide §2 (target `e`, concept `z`, descriptor `z` to the discovered header,
  apply polarity, deterministic `d`) — is signed by **the member's key** and published to the
  tagging relay; nothing else is published.
- [ ] Given the relay accepts, then the modal closes, a confirmation appears, and the note's card
  shows the tag immediately without a page reload; a subsequent feed load shows the same state
  from relay truth (tagger being a verified member, the read pipeline admits it).
- [ ] Given the member already applied that tag to that note, then the tag is marked applied yet
  re-applying succeeds idempotently (replaces, never duplicates).
- [ ] Given both sign-in methods (NIP-07; local signer), the apply flow works with each.
- [ ] Given **local-signer mode**, when a tag is selected, then the confirmation panel appears
  (every apply) showing the PO copy: the tag name, "create a public Nostr event signed with your
  key" with the member's own npub-short, and "publish the Nostr event to the community tagging
  relay"; **Cancel** returns to the tag list with nothing signed or published.
- [ ] Given **extension mode**, when a tag is selected, then no in-app confirmation panel appears —
  the extension's own approval popup is the consent step.
- [ ] Given the signer is declined/unavailable, then nothing is published and the modal recovers.
- [ ] Given the relay rejects or times out, then an inline error offers retry; no optimistic state
  is shown for an unaccepted publish.
- [ ] Given a supported tag whose header cannot be discovered at apply time, then the apply fails
  with an honest error and **no event of any kind is minted or published**.
- [ ] Given the Apply new view, then it remains non-functional with updated placeholder copy, and
  no interaction with it (or any cancel/dismiss path) publishes anything.
- [ ] Given a signed-out visitor or non-member, the affordance remains unreachable (gated feed).

## Concepts touched
Same concept set as community-feed #8/#9 (guide §2): the tag-elements
(`39999:6db8a13f…:<slug>`), their per-tag tagging headers (`tagging-with-specific-tag` under the
runtime TA), the `nostr-event-tag` concept, and the kind-1 targets. New here: the app **authors**
assertions joining those concepts rather than only reading them.

## Out of scope
- **Disputes** (negative polarity), **revocation/retraction** of an attestation, and any
  apply→dispute flip UI.
- **Authoring/minting**: new tag-elements, new tagging headers, "Apply new" functionality.
- Relay-wide tag search/discovery (guide §8 lists); the supported set is the universe.
- Publishing the member Trusted List / LFO House Assistant / Brainstorm-side POV (guide §7's
  future half).
- Batch tagging, tagging from anywhere but the feed card.
- Any change to the read pipeline's trust gates (the member filter stays the sole arbiter).

## Open questions
None blocking — UX decisions taken 2026-07-12 (optimistic pill + toast; applied-marked-retriable).

## Linked artifacts
- ADR: `engineering-team/decisions/0040-apply-attestation.md` (Accepted 2026-07-13)
- Test plan: `engineering-team/stories/note-tagging/2-apply-attestation.test-plan.md` (2026-07-13)
- Review: (after Review)
- note-tagging #1 (`1-note-tag-demo.md`, ADR 0039) — the UI shell this story wires
- Integration guide (external): `lfo-tagging-integration-guide.md` §0–§5, §9
- community-feed ADRs 0036–0038 — the read side these writes will surface through
