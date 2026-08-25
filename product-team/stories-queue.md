# Stories Queue: Perspective Availability

**Slug:** pov-availability
**Date:** 2026-08-25
**PRD:** `product-team/prd/pov-availability.md`
**Guides:** `product-team/guides/pov-availability-design-guide.md`, `product-team/guides/pov-availability-style-guide.md`

> Four stories in one block, in dependency order. Every criterion is verifiable from outside the code: give the page a condition, read what it shows.

## Placement

| | |
|---|---|
| **Block** | Perspective availability |
| **Suggested epic-slug** | `npub-search` — continues the existing epic (stories #1–#6 Done), not a new one |
| **Story numbers** | #7–#10, continuing that epic's sequence |
| **Book** | A **new** book `pov-availability`, **PRD-backed** — the repo's first. Its intent anchor is the PRD, so `/close-book` will write `prd-addendum.md` (deltas against the PRD) rather than another `prd-seed.md`. |
| **Branch** | `feat/npub-search` |

The book is new because the intent is new; the epic continues because the surfaces are the same ones stories #1–#6 built. Do not reopen the `npub-search` book — it is Closed, its audit records a satisfied frame, and its `prd-seed.md` is the return edge that produced this PRD.

## Sequence

| # | Story | Serves | Depends on |
|---|---|---|---|
| 7 | My view availability states | The Unprovisioned Member | — |
| 8 | Community refusal and the preference order | The Evaluator, The Connector | 7 |
| 9 | Recovery without a reload | All three | 7, 8 |
| 10 | Perspective control accessibility | All three | none |

Story 7 is demoable on its own and covers the majority case. Story 10 is unblocked and may be pulled forward at any point.

---

## Story 7: My view availability states

**PRD section(s):** §5.1 (rows 2–3), §5.3, §3.3, Journeys B and C
**Persona(s):** The Unprovisioned Member
**Block:** Perspective availability
**Suggested epic-slug:** `npub-search`

**Description:** When a member's own perspective cannot be served, the page tells her why — her account isn't registered, or her scores are being calculated and will take roughly this long.

**Acceptance criteria:**
- [ ] When the member's own perspective has no scores and none are scheduled, the My view side of the perspective control is dimmed and the line beneath reads exactly: `My view isn't available yet because your account isn't registered with Brainstorm.`
- [ ] When her scores are scheduled and being calculated, My view is dimmed and the line reads `My view is being set up. Check back in about {interval}.`, where `{interval}` is the provider's own estimate expressed as a plain spoken unit ("a minute", "about 5 minutes", "about an hour").
- [ ] When her scores are being calculated but the provider gives no estimate, the line reads `My view is being set up. Check back in a few minutes.`
- [ ] When her perspective serves scores, My view is live and selectable; selecting it re-ranks the search panel and both member grids to her perspective, and the indicator reads `— searching as you`.
- [ ] In every state above, no provider-authored text appears anywhere on the page — no reason string, algorithm name, status code, public key, or provisioning link.
- [ ] A dimmed My view side is still reachable by keyboard, and its explanation is announced together with the control rather than as a stray line.
- [ ] Community view is unaffected in all of the above: it remains the default, stays selected, and the rest of the page renders exactly as it does today.

**Dependencies:** None.

**Notes for engineering:**
- **This retires the `rank > 0` readiness heuristic.** Story #3 inferred readiness by asking whether any probed score came back above zero, because the provider gave no other signal. It now gives one directly. This is the follow-up logged in `_intake.md` on 2026-08-14 and updated 2026-08-17 — it was blocked on the contract reaching production, and it no longer is.
- **The interval is only possible because the provider now exposes its retry estimate to the browser.** ADR 0047 states the opposite; that constraint has lapsed. Confirm on the wire before designing around it either way.
- The three states here are the provider's three answers, one per perspective. Distinguishing them is the whole story; the copy is how they surface.
- "Brainstorm" is deliberately member-facing vocabulary — see the style guide. It names a service a member can be registered with. The provider's internal vocabulary is not, and never appears.
- The keyboard criterion is load-bearing for the copy: an unreachable control takes its explanation with it, hiding the reason from exactly the members who need it.

---

## Story 8: Community refusal and the preference order

**PRD section(s):** §5.1 (rows 4–5, rules 1–4 and 6), §5.2, §5.4, Journeys D and E
**Persona(s):** The Evaluator, The Connector
**Block:** Perspective availability
**Suggested epic-slug:** `npub-search`

**Description:** When the community's perspective cannot be served, the page falls to the best perspective it can serve — the member's own if that works, unpersonalized results if not — and names what she is looking at on every surface that shows it.

**Acceptance criteria:**
- [ ] When the community's perspective cannot be served but the member's own can, the page opens on My view, the Community side is dimmed, the line beneath reads `Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.`, and the indicator reads `— searching as you`.
- [ ] When neither perspective can be served, both sides are dimmed, the line reads `Results aren't personalized to the community right now. Neither view is available.`, and the indicator reads `— not personalized to the community`.
- [ ] When neither can be served and the member searches, results still render, with one line above the rows reading `These results aren't personalized to the community.` The no-matches and search-unavailable messages never appear for a perspective refusal.
- [ ] When the community's perspective is refused but the member is on her own, a search shows **no** line above the rows — those results are personalized, to her.
- [ ] The perspective control never displays one side selected and then switches to the other. Both perspectives are resolved before the control becomes usable.
- [ ] A perspective the member selected herself is kept for as long as it can be served, even when a more-preferred perspective becomes available during the same session.
- [ ] Within a single visit to the Members page, the page changes her perspective without being asked at most once.

**Dependencies:** Story 7 must ship first — it establishes how the page distinguishes the provider's three answers for a single perspective. This story applies that to two perspectives at once and adds the rule for choosing between them.

**Notes for engineering:**
- **The preference order is the heart of this story:** show the most community-specific perspective that can actually be served — the community's, then the member's own, then unpersonalized. The two perspectives are resolved independently; neither one's state is ever inferred from the other.
- **This is the only place in the product where a perspective change is announced.** Elsewhere a change is something the member did, so it needs no words. Here the page did it to her, so it says so.
- The indicator deliberately does **not** distinguish a substituted My view from a chosen one. The results are identical, and the reason belongs to the status line. Making them look different would imply the numbers are somehow lesser.
- The page must never claim results come from "the whole Nostr network." When a personalized ranking is refused the provider substitutes its own default, and the page cannot verify whose that is. It claims only the negative it knows.
- Criterion 6 (an explicit choice outranks the preference order) is the reading the PRD adopted rather than a decision the PO made independently — it is recorded as such in §5.1. If Architecture finds a reason it should behave otherwise, raise it before building.
- **If this story strains at seven criteria during Architecture, the clean split is the both-refused row** (criteria 2 and 3) into its own story. Do not split by surface — the surfaces have to move together or the perspective label lies.

---

## Story 9: Recovery without a reload

**PRD section(s):** §5.1 (rule 5), §6, §10 (metric 7)
**Persona(s):** All three
**Block:** Perspective availability
**Suggested epic-slug:** `npub-search`

**Description:** A perspective that was refused earlier is offered again when the member returns to the Members page, so recovering does not mean reloading the Hub.

**Acceptance criteria:**
- [ ] Once a perspective has been refused, the page does not ask for it again for the remainder of that visit to the Members page.
- [ ] Leaving the Members page and returning re-resolves both perspectives, and one that has since become servable is offered again.
- [ ] Recovery never requires reloading the Hub.
- [ ] On returning, the page applies the preference order afresh, subject to Story 8's rule that a perspective the member chose herself is kept while it can be served.

**Dependencies:** Stories 7 and 8 — they define the states being re-checked and the order they are resolved in.

**Notes for engineering:**
- The balance to hold: do not hammer a provider that has just declined, and do not strand a member behind a refusal that has since cleared. A visit is the unit that resolves both.
- This was Stretch scope until the PO promoted it on 2026-08-25 (PRD §11 Q5). ADR 0047 leaves recovery to a page reload and names the gap in its own consequences; this story closes it.

---

## Story 10: Perspective control accessibility

**PRD section(s):** §8.1, §10 (metric 8)
**Persona(s):** All three
**Block:** Perspective availability
**Suggested epic-slug:** `npub-search`

**Description:** The perspective control and the status line beneath it meet contrast and touch-target minimums.

**Acceptance criteria:**
- [ ] Status-line text and the search-panel line meet a 4.5:1 contrast ratio against their background.
- [ ] Both sides of the perspective control measure at least 44px in their smaller dimension.
- [ ] No copy, layout order, or behavior changes as a result.
- [ ] Both corrections hold at mobile, tablet, and desktop widths.

**Dependencies:** None. May be pulled forward ahead of Story 7.

**Notes for engineering:**
- **These are pre-existing defects in shipped code, not problems this feature area introduced.** They were surfaced by the design review and are carried as their own story so the record is clear. The grey used for small text measures 4.48:1 — marginally under — and the control's segments compute to roughly 34px tall.
- Kept separate from Story 7 so a copy change and a defect fix do not arrive in one diff.

---

## Notes carried to Architecture (all stories)

**ADR 0047 is edited in place.** It is currently *Proposed*, authored by an outside contributor for PR #1 on branch `pr-1`, and has never been accepted or landed. **Where its decisions conflict with the design guide, the design guide wins** — PO instruction, 2026-08-25. Two conflicts are known:

1. **Copy.** ADR 0047 surfaces the provider's reason string verbatim, prefixed with a warning symbol. The design guide reverses this: the reason is recorded where a developer can read it and never reaches the interface.
2. **The preference order is absent.** ADR 0047 contemplates only one fallback — the provider's global default — and has no notion of substituting the member's own perspective. Stories 8 and 9 are behavior it does not describe.

**PR #1 is a reference implementation, not a merge.** Rebase `pr-1` onto `feat/npub-search` before reading it — it is five commits behind and touches four files that have since changed. Its structural work is sound and worth keeping: refusal detection, the cache separation that stops perspectives mixing, and the never-substitute rule applied on the client side. Its tests T44–T49 cover the right shapes and should mostly survive re-pinning to the new copy.

**Two of its stated premises have expired.** It was written on 2026-08-15 to ship *ahead* of the provider change, so it describes its own branches as dormant. They are not: the production provider already refuses today, and those paths are live for any member with an unprovisioned perspective. It also states that the provider's reason header is unreadable by the browser; that header and the retry estimate are both exposed now, which is what makes Story 7's interval copy possible. Re-verify both on the wire before relying on either.

**Nothing here changes how membership is decided.** Trust scores are a lens for reading the community, never a gate on entering it. The vouch graph is untouched by all four stories.
