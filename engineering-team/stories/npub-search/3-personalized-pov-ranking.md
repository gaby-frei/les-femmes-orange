# Story 3: Personalized ranking — "Community view" / "My view" toggle

**Status:** Approved (PO, 2026-08-06 — determinations 1–4 + O1–O3 resolved)
**Created:** 2026-08-06
**Type:** Feature
**Epic:** `npub-search` · **Book:** `npub-search`
**Builds on:** #2/#6 (ORE-backed free-text search, POV as a parameter), #4 (trust chips +
batch score fetch), #5 (trust-ordered grids, POV-agnostic ordering). Every trust surface
already computes from a POV parameter defaulting to the house account — this story lets a
ready member point that parameter at *themselves*.

## Background

Search rows, member-card chips, and grid ordering all rank from the **community (house)
point of view** today. The protocol's core idea is that there is no "the view" — trust is
always *someone's* view. This story surfaces that: a member can switch the Members page to
rank everything from **their own** point of view.

Product direction settled in the 2026-08-06 advisory discussion (Product Advisor session):

- Most members do not yet have personalized scores computed on the ranking backend — and
  for them a personal view would be **empty, not degraded** (the backend answers a
  well-formed "zero results" for unprovisioned perspectives; verified by live probe). The
  UX must make this state impossible to stumble into.
- Plain language only: **"Community view" / "My view"** — never "POV," "WoT," or
  "personalized."

## PO determinations (2026-08-06)

1. **Visible but disabled.** The view toggle is always present on the Members page, but
   **disabled** for members without available personal trust scores. Readiness is
   determined by asking the ranking backend for the member's own perspective (non-empty
   answer = ready; the probe shape is recorded in the advisory discussion and left to
   Architecture to pin). A disabled toggle carries a short plain-language explanation of
   why it's off.
2. **Community view is the default, every session.** The choice does not persist across
   sessions: each visit starts in Community view; "My view" lasts until the session ends
   or the member switches back.
3. **Perspective indicator copy (PO UI spec, 2026-08-06).** Small **orange** copy under
   two existing headers, switching with the active view:
   - under **"Find someone on Nostr"**: "searching as **you**" / "searching as
     **Les Femmes Orange**";
   - under **"Verified Members"**: "viewing as **you**" / "viewing as
     **Les Femmes Orange**".
   The community label reads "Les Femmes Orange" regardless of which pubkey currently
   backs the house designation (the placeholder swap never changes this copy). These two
   lines are the mechanism satisfying the "active view is always evident" criterion.
4. **Header typography parity (PO UI spec, 2026-08-06).** In this story, the
   "Find someone on Nostr" and "Verified Members" headers are amended to render in the
   **same font, text size, and alignment**.

## User-facing description

As a **signed-in verified member** with personal trust scores available, I want to switch
the Members page to "My view" so that search results, trust scores, and the member grids
are ranked by who *I* trust — and switch back to the community's view at any time.

## Acceptance criteria

Testable from the outside. "Toggle" = the Community view / My view control.

- [ ] **Toggle present, correctly gated.** The toggle renders on the Members page for
      signed-in members. For a member whose personal perspective returns no scores, it is
      visibly disabled with a plain-language explanation; for a ready member it is
      enabled. The readiness check never delays or blocks page rendering.
- [ ] **Session default.** Every session starts in Community view — including for members
      who used My view in a prior session.
- [ ] **Switching re-ranks everything, coherently.** Activating My view re-ranks **all
      three trust surfaces from the member's own perspective**: free-text search results
      (order), the numeric trust chips (search rows and member cards), and the grid
      ordering (verified and pending, highest first). No surface on the page may show one
      view's numbers while another shows the other's — including mid-switch.
- [ ] **Numbers are never stale across a switch.** After switching (either direction),
      every displayed score reflects the active view — a score computed under the
      previous view is never shown under the new one.
- [ ] **Switching back restores.** Returning to Community view restores exactly the
      house-ranked experience shipped by #2/#4/#5/#6 (byte-equivalent behavior, same
      fallback states).
- [ ] **Active view is always evident.** Small orange indicator copy renders under the
      "Find someone on Nostr" header ("searching as you" / "searching as Les Femmes
      Orange") and under the "Verified Members" header ("viewing as you" / "viewing as
      Les Femmes Orange"), switching immediately with the active view (determination 3).
- [ ] **Header parity.** The "Find someone on Nostr" and "Verified Members" headers
      render with identical font, text size, and alignment (determination 4).
- [ ] **My-view search behaves.** Free-text search in My view uses the member's
      perspective end-to-end (ranking and chips). Sparse results are acceptable; the
      story-#2/#6 empty and unavailable states apply unchanged. The identity fast path
      is view-independent and untouched.
- [ ] **Vouch flows unaffected.** Vouching works identically in both views; a vouched
      member's card slots into the *active* view's order (story-#5 amendment behavior,
      under whichever view is on).
- [ ] **Enhancement-only failure.** If the readiness check cannot complete (backend
      unreachable), the toggle renders disabled with its explanation — the page otherwise
      behaves exactly as today. No error states, no blocked rendering.

## Constraints for Architecture (carried forward from reviews #4/#6)

- The shared score cache is keyed by pubkey with the perspective implicit; after #6 it
  feeds all three surfaces. A view switch must not serve the previous perspective's
  numbers (reviews #4 and #6 both flag this). **PO preference (2026-08-06): re-key the
  cache by (perspective, pubkey)** — keeping both views warm so switching back is
  instant — rather than clearing on switch. Final mechanism remains the Architect's
  call if re-keying proves problematic.
- The search request's POV travels in a JSON body (post-#6); no URL-encoding concern.
- **Server-side reference (PO, 2026-08-06):** the ORE backend's implementation is public —
  `https://github.com/NosFabrica/brainstorm_server/tree/main/app/routers/open_ranking`
  (`search.py` = `/search/pubkeys`, `rank.py` = `/rank/pubkeys`, `common.py` = shared
  POV handling — likely where unprovisioned-POV/empty-result semantics live,
  `capabilities.py`/`well_known.py` = discovery doc, `schemas.py` = request/response
  models). Consult it before re-probing live hosts — especially for pinning the
  readiness-probe semantics and the disabled-toggle gating.

## Out of scope

- Cross-session persistence of the view choice (explicitly rejected — determination 2).
- Any in-app provisioning journey ("set up my view") — future story, once self-serve
  provisioning exists upstream.
- Changes to the community/house POV configuration or the LFO swap runbook.
- Personalizing any surface outside the Members page (e.g. the feed).

## Open questions

- **O1 — Disabled-state copy.** ~~Open~~ **Resolved (PO, 2026-08-06):** the disabled
  toggle's explanation is, verbatim: **"My view isn't available for your account yet."**
  Minimal register — no mechanism talk, no promise of timing. Tester pins the string.
- **O2 — Readiness re-check cadence.** ~~Open~~ **Resolved (PO, 2026-08-06):** probe on
  **every Members-page visit** — non-blocking, alongside the score batch that already
  fires on page load. A member who becomes ready mid-session sees the toggle enable on
  their next visit to the page, no reload required.
- **O3 — Toggle placement & form.** ~~Open~~ **Resolved (PO, 2026-08-06):**
  - **Form:** modeled on the current Brainstorm UI's perspective control (PO-supplied
    screenshot, 2026-08-06; UI served from `github.com/NosFabrica/brainstorm_server`) —
    a **pill-style segmented control**: two segments on a soft grey rounded track, the
    active segment a raised white pill, each segment carrying a small leading icon
    (community mark for Community View; the member's own avatar for My View, with a
    neutral fallback when no profile picture exists). LFO palette, not Brainstorm's
    purple.
  - **Copy:** exactly **"Community view"** and **"My view"** (sentence case — PO
    revision 2026-08-06, aligning with the O1 disabled-state string). Community view is
    the left segment and the session-default active state (determination 2). The
    reference screenshot's "What is this?" explainer link is **not** part of this story.
  - **Placement:** after the Telegram banner, before the search bar and members grids.
  - Disabled state (determination 1 + O1 copy) applies to the "My view" segment.

## Linked artifacts

- ADR: (Architecture phase)
- Test plan: (Test Design phase)
- Review: (Review phase)
