# Story 8: Community refusal and the preference order

**Status:** Done (review CHANGES REQUESTED → resolved 2026-08-26) — live-preview checks 2, 3, 5, 6 run and verified by the PO 2026-08-27; the community-declined states (checks 1 and 4) verified against a **console stub only**, still NEVER observed against a live provider
**Created:** 2026-08-26
**Type:** Feature
**Epic:** `npub-search` (continues story #7)
**Book:** `engineering-team/audits/pov-availability/book.md` — Open, PRD-backed
**Branch:** `feat/npub-search`

## Background

Story #7 taught the page to read the provider's answer for **one** perspective — the member's own. This story does it for **both**, and decides what the page shows when they disagree.

The community's perspective is the page default and cannot be opted out of. If it cannot be served, every trust surface loses its ordering at once: the search panel, both member grids, and every score chip. Unlike the member's own perspective, there is no control to dim and walk away from — the page has to show *something*, and it has to say what that something is.

The rule the PRD settles on is a preference order: **show the most community-specific perspective that can actually be served.** The community's first, the member's own second, unpersonalized last. The two are resolved independently — a refusal of one says nothing about the other — so a member whose own scores exist keeps a personalized page even when the community's ranking is down. That is strictly better than falling to a stranger's default, and it is why the two cases are not symmetric.

One consequence needs care. In that middle case the page puts a member somewhere she did not ask to be. **That is the only unrequested perspective change in the product, and it is the only one the page announces.** Elsewhere a change is something she did, so it needs no words.

**Who is affected:** every signed-in member, in the rare case. In the common case — both perspectives serving — nothing on the page changes at all, and that is a requirement, not a side effect.

## User-facing description

As a member using the Members page when the community's trust ranking cannot be served, I want the page to rank by the best perspective it still has and tell me which one that is, so that I can keep finding and vouching people without ever misreading whose judgment ordered them.

## Acceptance criteria

- [ ] Given the provider declines the community's perspective but serves the member's own, when she opens the Members page, then it opens on My view, the Community side of the control is dimmed, the line beneath reads exactly `Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.`, and the indicator reads `— searching as you`.
- [ ] Given the provider declines both perspectives, when she opens the Members page, then both sides of the control are dimmed, the line beneath reads exactly `Results aren't personalized to the community right now. Neither view is available.`, and the indicator reads `— not personalized to the community`.
- [ ] Given both perspectives are declined, when she searches, then result rows still render, with one line above them reading exactly `These results aren't personalized to the community.`; the no-matches and search-unavailable messages never appear for a declined perspective.
- [ ] Given the community's perspective is declined but she is on her own, when she searches, then **no** line appears above the rows — those results are personalized, to her.
- [ ] Given any combination of perspective states, when the Members page loads, then the control never displays one side selected and then switches to the other; both perspectives are resolved before the control becomes usable.
- [ ] Given she has selected a perspective herself during this session, when the page later re-resolves, then her choice is kept for as long as it can be served, even if a more-preferred perspective becomes available.
- [ ] Given a single visit to the Members page, when perspective states change during it, then the page changes her perspective without being asked **at most once — unless the perspective she is on stops being servable**, in which case it moves her again rather than stranding her on a perspective whose scores cannot arrive.

## Concepts touched

**None.** No concept definition is added, changed, or removed; no firmware reinstall. Membership stays the kind-39999 vouch closure, untouched. Concept Graph API at `http://localhost:8877` unreachable at planning time, as for every story in this epic; the Architect should re-check but nothing here is expected to need a handle.

## Decisions and assumptions

**A1 — An explicit choice outranks the preference order.** *(**Ratified by the PO, 2026-08-26.** Was carried as an assumption; now a settled requirement.)*

AC-6 states that a perspective the member picked herself survives a re-resolution. This is the reading the PRD adopted at §5.1 rule 6, and the story queue flagged it as *a reading rather than a decision the PO made*. It is built that way here because the alternative — re-choosing for her whenever a more-preferred perspective returns — would undo a deliberate action without asking.

**Settled 2026-08-26 — keep as built.** A view the member picks is remembered for the session and overridden only when her own perspective stops being servable, in which case she is moved and told. This also preserves shipped behavior: `_activeView` is already session-scoped, so a chosen view survives in-app navigation today; the alternative would have been a behavior change that started overriding a choice which currently sticks.

**D2 — The middle case announces itself; nothing else does.** AC-1 is the product's single announced perspective change. Recovery stays silent: when a perspective becomes servable again the control simply re-enables (PRD §5.1 rule 3, design principle 6).

**D4 — The single-move rule yields to stranding.** *(Amended 2026-08-26 after review R1; the original AC said "at most once" unconditionally.)* Being moved twice in one visit is worse than being moved once, but both are better than being left on a perspective the provider has stopped serving — that page would show ordering that can never load. The guard therefore protects against the page changing its mind, not against a forced move. Every move still announces itself.

**D3 — The indicator does not distinguish a substituted My view from a chosen one.** Both read `— searching as you`. The results are identical, so the label is identical; the *why* lives in the status line. Making them differ would imply the substituted numbers are somehow lesser.

## Out of scope

- **Re-checking a declined perspective on return to the Members page** — story #9. This story defines the states; #9 defines when they are re-resolved.
- **Contrast and touch-target corrections** on the control — story #10, kept in its own diff.
- **Naming the perspective that replaced the community's.** The page cannot verify whose ranking the provider substituted, so it claims only the negative: not personalized to the community. Never "the whole Nostr network."
- Letting a member register with the provider from inside the Hub — the next phase, separate branch.
- Any change to how membership is decided. Any provider-side change.

## Open questions

None blocking. A1 is recorded as an assumption rather than a question, and is not on the critical path.

## Notes for the Architect

- **Story #7 built the seam for this deliberately.** `_povState` is a general per-perspective map with a single writer; this story adds the community perspective as a second key. The ADR recorded that generality as a scope judgment specifically so this story would not need a refactor.
- **ADR 0047 is amended again, not superseded.** Its Deferred section already names what this story adds. The reference implementation on branch `pr-1` carries the search and rank-batch refusal machinery, including the explicit global re-request and a separate cache namespace so perspectives cannot mix — that structure is sound. Its copy is reversed by the design guide, and it has no concept of substituting the member's own perspective, which is the heart of this story.
- **Seven criteria is the ceiling.** If this strains during Architecture, the clean split is the both-declined row (AC-2 and AC-3) into its own story. **Do not split by surface** — the toggle, the indicator, and the panel must move together or the perspective label is a lie.
- Copy is verbatim from the design guide. The style guide is binding on every string.

## Sources

- PRD: `product-team/prd/pov-availability.md` — §5.1 rows 4–5 and rules 1–4/6, §5.2, §5.4, Journeys D and E
- Design guide / style guide: `product-team/guides/pov-availability-{design,style}-guide.md`
- Story brief: `product-team/stories-queue.md` → Story 8

## Linked artifacts
- ADR: `engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md` — amended 2026-08-26 (Decisions 7–10)
- Test plan: `engineering-team/stories/npub-search/8-community-refusal-preference-order.test-plan.md` — T51–T57
- Review: `engineering-team/reviews/npub-search/8-community-refusal-preference-order.md` — CHANGES REQUESTED 2026-08-26, **resolved**; R1 reconciled to the stranding exception (T58), R2 fixed with a neutral resting state (T55 extended)
