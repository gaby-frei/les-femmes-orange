# Book of Work: Note tagging (event-tags on kind-1 notes)

**Slug:** note-tagging
**Status:** Open
**Opened:** 2026-06-25

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below.

### Acceptance frame

> **Scope note:** the full capability — applying real `nostr-event-tag`s to notes (search existing tags,
> create/apply new ones, sign + publish) — depends on Tapestry/nostr **event-tag protocol support that a
> teammate has not yet implemented**. This book opens with a deliberately small first slice (a
> non-functional demo UI) and will grow as the protocol lands. The frame below is the near-term demo bar;
> it will be extended when real tagging is in scope.

- [ ] A signed-in verified member sees a tagging affordance (a plus button) on each feed note and can open an "Add a tag" panel from it.
- [ ] The panel presents the two intended modes — "Search existing" and "Apply new" — as toggle-able views.
- [ ] Until protocol support lands, the panel honestly communicates that tagging is not yet available, applies nothing, and does not break the read-only feed.

## Epics in this book
- `note-tagging` — let members apply event-tags to community notes (kind-1) from within the feed. Begins as a primitive demo UI; wires to real `nostr-event-tag` signing/publishing once the protocol is supported.

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at open:** medium — the demo slice is well-understood; the full capability is gated on external protocol work whose shape isn't final.

## Decided constraints (carried into Architecture)
- This first story is a **non-functional demo**: no event-tag creation, signing, publishing, or querying.
- The tagging entry point lives on feed cards, which are otherwise **read-only** — the demo must not introduce real interaction/write behavior.
- UI/UX is **provisional** and will be revised when wired to real event-tag logic.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/note-tagging/audit.md`
- Product feedback: `engineering-team/audits/note-tagging/prd-seed.md` (or `prd-addendum.md`)
