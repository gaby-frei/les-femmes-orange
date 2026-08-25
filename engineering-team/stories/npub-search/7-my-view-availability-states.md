# Story 7: My view availability states

**Status:** Approved (PO, 2026-08-25)
**Created:** 2026-08-25
**Type:** Feature
**Epic:** `npub-search` (stories #1–#6 Done; this opens the epic's second book)
**Book:** `engineering-team/audits/pov-availability/book.md` — Open, PRD-backed
**Branch:** `feat/npub-search`

## Background

The Members page ranks people by trust from a chosen perspective, and offers a member her own perspective as an alternative to the community's. Most members cannot use that alternative: their scores have never been calculated, because their account is not registered with the trust provider. **This is the majority case, not an edge case.**

Story #3 shipped the control that surfaces this. It had no way to ask the provider whether a perspective was serviceable, so it inferred: it requested scores for two known pubkeys and treated "any score above zero" as proof the perspective worked. A perspective with no scores came back as zeros, which read as not-ready. The inference was sound but indirect, and it could say only *no* — never *why*, and never *not yet*.

The provider now answers directly. Asked for a perspective it cannot serve, it declines and says why. Asked for one whose scores are being calculated, it says so and estimates how long. **This story replaces the inference with the answer, and turns what the page learns into something a member can act on.**

What she reads today is *"My view isn't available for your account yet."* — a fact with no cause. It gives her nothing to do and no reason to return. The next phase of work will let her register from inside the Hub; this story writes the sentence that flow attaches to.

**Who is affected:** every signed-in member. Members without calculated scores see new copy; members with them see the control enable on a firmer basis than before.

## User-facing description

As a member whose own trust perspective isn't available, I want the page to tell me why it isn't and whether that will change, so that I know whether to act, wait, or ignore it.

## Acceptance criteria

- [ ] Given the provider declines to serve the member's own perspective because no scores exist for it, when she opens the Members page, then the My view side of the perspective control is dimmed and the line beneath it reads exactly: `My view isn't available yet because your account isn't registered with Brainstorm.`
- [ ] Given the provider reports that her scores are scheduled and still being calculated, and gives an estimated wait, when she opens the Members page, then My view is dimmed and the line reads `My view is being set up. Check back in about {interval}.`, where `{interval}` is that estimate rendered by the bucket table below.
- [ ] Given the provider reports her scores are still being calculated but gives no usable estimate, when she opens the Members page, then the line reads exactly: `My view is being set up. Check back in a few minutes.`
- [ ] Given the provider serves scores for her perspective, when she opens the Members page, then My view is selectable; and when she selects it, the search panel and both member grids re-rank to her perspective and the indicator beside the search label reads `— searching as you`.
- [ ] Given any of the above, when the page is inspected in any of those states, then no provider-authored text appears anywhere in it — no reason sentence, algorithm name, status code, public key, or provisioning link.
- [ ] Given My view is dimmed, when she navigates the page by keyboard, then the dimmed control is still reachable and its explanation is announced together with it rather than as a detached line.
- [ ] Given any of the above, when she uses Community view, then it behaves exactly as it does today: it is the default, it stays selected, and every other surface on the page is unchanged.

## Concepts touched

**None.** No concept definition is added, changed, or removed, and no firmware reinstall is implied. Membership continues to be decided solely by the kind-39999 LFO vouch graph; trust scores are a display lens and remain outside that decision entirely.

The Concept Graph API at `http://localhost:8877` was **unreachable at planning time**, as it has been for every story in this epic (see ADRs 0041–0046). The Architect should re-check and resolve handles if it has come up, but nothing in this story is expected to need one.

## Out of scope

Deferred deliberately, each already owned elsewhere:

- **The community perspective being refused**, and the preference order that follows from it — story #8. This story is only about the member's own perspective.
- **Re-checking a refused perspective without a reload** — story #9.
- **The contrast and touch-target corrections** on this same control — story #10. They are pre-existing defects and are kept in their own diff.
- **Letting a member register with the provider from inside the Hub.** Confirmed as the next phase on a separate branch (PRD §8.3). This story ends at the explanation.
- **Explaining what a trust score means.** Excluded when scores shipped, still excluded.
- Any change to how membership is decided. Any provider-side change.

## Decisions

**D1 — Interval buckets** *(PO, 2026-08-25; resolves the story's only open question)*

The PRD asks for the provider's estimate as "a plain unit a person would say out loud" and gives examples, not thresholds. These are the thresholds. They are binding on criterion 2 and are what the Tester pins.

| Provider estimate | `{interval}` renders as |
|---|---|
| under 90 seconds | `a minute` |
| 90 seconds to under 10 minutes | `about {n} minutes`, rounded to the nearest 5 |
| 10 to under 90 minutes | `about an hour` |
| 90 minutes and beyond | `about {n} hours`, rounded to the nearest hour |
| absent, unparseable, or already elapsed | *(no interval — criterion 3's wording applies)* |

An estimate that has already elapsed is treated as no estimate rather than rendered as zero or a negative. A wait that has passed tells the member nothing useful, and "check back in a few minutes" remains true.

Rounding to the nearest 5 minutes never rounds down to zero: anything in the second bucket renders as at least `about 5 minutes`.

## Open questions

None. D1 resolved the only one before approval.

## Notes for the Architect

Carried from the story brief in `product-team/stories-queue.md`, not re-derived.

- **This retires the readiness heuristic from story #3** (`probeMyViewReadiness`, ready ⟺ any rank > 0). It was the follow-up logged in `_intake.md` on 2026-08-14 and unblocked on 2026-08-24. The three states in the acceptance criteria are the provider's three answers for a single perspective; distinguishing them is the substance of the story, and the copy is how they surface.
- **The interval is only expressible because the provider's retry estimate is now readable by the browser.** ADR 0047 states the opposite — that constraint has lapsed. Re-verify on the wire rather than trusting either document.
- **"Brainstorm" is deliberately member-facing** (style guide). It names a service a member can be registered with. The provider's internal vocabulary is not, and never appears.
- **Criterion 6 is load-bearing for criterion 1.** A control removed from the tab order takes its explanation with it, hiding the reason from the members most likely to need it. The design guide proposes `aria-disabled` over the `disabled` attribute; the mechanism is the Architect's call, the behavior is not.
- **ADR 0047 is to be edited in place** during Architecture. It is *Proposed*, authored by W David Strayhorn for PR #1, never accepted, never landed. **Where it conflicts with the design guide, the design guide wins** (PO instruction, 2026-08-25). Its verbatim-provider-reason copy is reversed by this story.
- **Branch `pr-1` is a reference implementation, rebased onto `feat/npub-search` and green at 51/51** including its own T44–T49. It guides; it does not merge. Its refusal detection and its separation of cached scores by perspective are sound and worth keeping. Its copy is not.

## Sources

- PRD: `product-team/prd/pov-availability.md` — §5.1 rows 2–3, §5.3, §3.3, Journeys B and C
- Design guide: `product-team/guides/pov-availability-design-guide.md`
- Style guide: `product-team/guides/pov-availability-style-guide.md` — binding on every string in the acceptance criteria
- Story brief: `product-team/stories-queue.md` → Story 7

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
