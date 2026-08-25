# Book of Work: Perspective availability (honest trust perspectives on the Members page)

**Slug:** pov-availability
**Status:** Open
**Opened:** 2026-08-25
**Closed:** —

## Intent anchor

**PRD-backed** — `product-team/prd/pov-availability.md` **§8.1 In Scope (must ship)**.

Completion is **computed**: the book is complete when every story tracing to §8.1 is `Done` and its epic block is closed. §8.1 comprises:

- Resolving both perspectives independently, and choosing the page's perspective by the preference order in §5.1.
- All five status-line messages in §5.3, including the registration cause and the wait interval.
- The three indicator phrasings in §5.2.
- The search-panel line in §5.4, in its single situation.
- Suppressing every provider-authored string from the interface (§5.5).
- Never rendering a refused perspective as "no matches" or as a search failure.
- Re-checking a refused perspective on each return to the Members page (§5.1 rule 5).
- The two accessibility corrections: status text meeting contrast minimums, perspective-control targets meeting size minimums.

**Story coverage of §8.1:** #7 → messages, registration cause, interval, suppression. #8 → independent resolution, preference order, indicator phrasings, panel line, never-as-absence, suppression. #9 → re-checking. #10 → the two accessibility corrections.

**Explicitly not in this book** (PRD §8.3): the in-app registration flow (confirmed as the *next* phase, separate branch), feed personalization, a trust-score explainer, any change to how membership is decided, any provider-side change.

## Epics in this book
- `npub-search` — **continued**, not new. Stories #7–#10 extend the epic that stories #1–#6 built (`engineering-team/epics/npub-search.md`), because they modify the same Members-page surfaces: the perspective toggle, the search indicator, the search panel, and the member grids. The epic therefore spans two books — `npub-search` (Closed) and this one.

## Provenance
- **Mode:** PRD-backed — **the repo's first.** Every prior book here was acceptance-frame. Close will therefore write `prd-addendum.md` (deltas against the PRD), not another `prd-seed.md`.
- **Lineage:** this book exists because the `npub-search` book closed properly. Its `prd-seed.md` was the return edge; the product team read it and ran Experience Design → PRD Assembly → Story Decomposition on top of it. That loop is the thing this book is the second half of.
- **Confidence at close:** *(to be recorded)* — expected high: the anchor is a committed PRD with numbered sections, captured before any story was planned.

## Prior art consumed (not authored here)
- **ADR 0047** (`engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md`) — *Proposed*, authored by an outside contributor for PR #1, never accepted, never landed. **To be edited in place during Architecture; where it conflicts with the design guide, the design guide wins** (PO instruction, 2026-08-25). Two known conflicts: it surfaces the provider's reason verbatim, and it has no preference order.
- **PR #1 / branch `pr-1`** — reference implementation. Guides, does not merge. Rebase onto `feat/npub-search` before reading (five commits behind, four files since changed).
- **Live provider contract**, verified on `api.brainstorm.world` 2026-08-24: refusal carries a reason in a header and body, both CORS-readable; a scheduled perspective carries a retry estimate; the success shape is unchanged. Two of ADR 0047's premises have expired against this — re-verify on the wire.

## Product artifacts this book realizes
- PRD: `product-team/prd/pov-availability.md`
- Design guide: `product-team/guides/pov-availability-design-guide.md`
- Style guide: `product-team/guides/pov-availability-style-guide.md`
- Story queue: `product-team/stories-queue.md`

## Branch
`feat/npub-search` — the same unmerged branch carrying stories #1–#6. Per standing PO instruction, that branch is not merged to `main`.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/pov-availability/audit.md`
- Product feedback: `engineering-team/audits/pov-availability/prd-addendum.md`
