# Story 1: Note-tagging demo UI — plus button + "Add a tag" popup (non-functional)

**Status:** Draft
**Created:** 2026-06-25
**Type:** Feature
**Epic:** `note-tagging` · **Book:** `note-tagging`

## Background
LFO will eventually let members apply **event-tags** to community notes (kind-1) — the note-level
counterpart to the npub-tagging that already runs on `tags.brainstorm.world`. The real capability needs
**Tapestry/nostr `nostr-event-tag` support that a teammate has not yet implemented**, so it can't be built
end-to-end yet.

This story stands up a **primitive, non-functional demo** of the eventual tagging interaction inside the
feed: a visible entry point and the shape of the "Add a tag" panel, so the team can react to the UX and so
the affordance has a familiar home once the protocol lands. It deliberately does **no** tagging — it shows
an honest "not yet" message. The UI/UX is provisional and will be revised when wired to real event-tag
logic.

The entry point lives on **feed note cards**, which are otherwise **read-only** (the `community-feed` epic
forbids in-app zap/like/repost/reply controls). This demo adds a *visual* control only; it must not
introduce real interaction/write behavior — see acceptance criteria.

## User-facing description
As a **signed-in verified member** browsing the feed, I want to see a tagging affordance on each note that
opens an "Add a tag" panel, so that I can **preview how note-tagging will work** — even though tagging
isn't functional yet.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given the feed view with one or more notes, then **each** feed note card displays a **circular "plus" button** anchored at its **bottom-right**.
- [ ] Given a note's plus button, when the user **clicks it**, then an **"Add a tag" popup** opens, and the popup shows the title **"Add a tag"**.
- [ ] Given the plus button is clicked, then the note is **not** opened in Primal — the plus is a distinct control and does **not** trigger the card's open-in-Primal behavior.
- [ ] Given the popup is open, then it presents **two toggle-able views** labeled **"Search existing"** and **"Apply new"**, with exactly **one active at a time**; clicking the inactive one switches the active view.
- [ ] Given either view ("Search existing" or "Apply new") is active, then its content is the message **"No support for event tags yet. Check back later."**
- [ ] Given the popup is open, when the user **dismisses it** (close control / clicking away), then the popup closes and the feed is shown again, with **no** tag applied.
- [ ] Given any interaction with the plus button or popup (open, toggle, close), then **nothing is published, signed, persisted, or sent over the network** — the feed remains read-only in effect.
- [ ] Given a **signed-out visitor or non-member**, then they do not see the plus button or popup (it lives inside the gated feed, which they cannot access) — same gating as the rest of the feed.

## Concepts touched
Concept Graph API (`http://localhost:8877`) was **not reachable** during planning — concepts named in
plain language; the Architect should resolve handles when the protocol lands.

- **Nostr kind-1 text note** — the would-be tag target (the note a plus button sits on).
- **Event-tag** *(future, not yet supported)* — a tag applied to a note/event, analogous to the npub
  `nostr-user-tag` but targeting an event id. No format exists in this app yet; this story only mocks the UI.
- **Verified LFO member set** — unchanged; still gates who sees the feed (and therefore the affordance).

## Out of scope
- **Any real event-tag behavior** — creating, signing, publishing, or querying `nostr-event-tag` events.
  (Pending the teammate's protocol work.)
- **Functional search or apply** — neither view searches existing tags nor applies a new one; both show the
  placeholder message only. Reproducing the screenshot's search box, tag list, or per-tag rows is **not**
  required.
- **Final visual / interaction design** — this is a primitive demo; styling and UX will be revised when
  real logic is wired in.
- **Mapping tags to feed channels** — a forward-looking concern in the `community-feed` epic, not built here.
- **Persisting** anything (no record that a note was "tagged").

## Open questions
- _(none open)_ — tab labels are **"Search existing"** and **"Apply new"** (the brainstorm screenshot reads
  "Create new"; the user has confirmed **"Apply new"** for LFO). Real event-tag format is an epic-level open
  question, not needed for this demo.

## Decided constraints (PO direction)
- **Non-functional demo**: no signing/publishing/querying/persistence; the feed stays read-only.
- **Placement**: circular plus button, bottom-right of every feed note card.
- **Popup**: title "Add a tag"; two toggle views "Search existing" / "Apply new"; both show
  "No support for event tags yet. Check back later."
- **Modeled on** `tags.brainstorm.world`'s npub-tagging modal (reference only; fidelity beyond title + two
  toggles + message is not required for the demo).

## Linked artifacts
- ADR: `engineering-team/decisions/0039-note-tagging-demo-ui.md` (**Accepted**)
- Test plan: `engineering-team/stories/note-tagging/1-note-tag-demo.test-plan.md` (8 e2e; 7 RED + AC-8 gating guard green)
- Review: `engineering-team/reviews/note-tagging/1-note-tag-demo.md` — **PASS** (2026-06-25)
