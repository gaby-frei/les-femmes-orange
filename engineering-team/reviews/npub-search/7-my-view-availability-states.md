# Review: Story 7 — My view availability states

**Story:** `engineering-team/stories/npub-search/7-my-view-availability-states.md`
**ADR:** `engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md`
**Test plan:** `engineering-team/stories/npub-search/7-my-view-availability-states.test-plan.md`
**Book:** `engineering-team/audits/pov-availability/book.md` (Open, PRD-backed)
**Diff:** `c7765e5..846d8e7` on `feat/npub-search` — `39839b8` (tests), `846d8e7` (implementation)
**Date:** 2026-08-25

## Verdict: **CHANGES REQUESTED** → **resolved 2026-08-25** (`ddc91d5`)

> **Resolution.** R1 fixed by re-keying the rule to `[aria-disabled="true"]`. R2 fixed by pinning
> computed `opacity` and `cursor` in T50, in both directions. The new assertion was verified to
> catch the original defect: with R1 reverted, T50 fails `a dimmed segment is visibly dimmed`,
> expected `"0.55"`, received `"1"`. Gates re-run: 52/52 e2e, 106/107 unit. N1 (pointer-events)
> deliberately left as an ADR question. **Story #7 passes; the live-preview checks below are
> still owed.**

One blocking defect, verified in a browser. The work is otherwise faithful to the ADR, well-scoped, and the test corrections made mid-phase were legitimate. The fix is one CSS selector plus a test that would have caught it.

---

## Blocking

### R1 — The dimmed segment is no longer dimmed

`public/index.html:916`

```css
.pov-segment:disabled { opacity: 0.55; cursor: not-allowed; }
```

The implementation replaced the `disabled` property with `aria-disabled="true"` (`:1713`, `:3070`). The `:disabled` pseudo-class matches only the disabled *property* on a form control. It does not match the `aria-disabled` *attribute*, so this rule no longer applies to anything.

**Verified in Chromium**, same stylesheet, both markups:

| Segment | `opacity` | `cursor` |
|---|---|---|
| `disabled` (before) | `0.55` | `not-allowed` |
| `aria-disabled="true"` (after) | **`1`** | **`pointer`** |

**Failure scenario.** A member whose account isn't registered opens Members. The My view segment renders at full opacity with a pointer cursor — visually indistinguishable from the live Community view segment. She clicks it. Nothing happens, with no visual explanation of why. `aria-disabled` does not block pointer events and no `pointer-events: none` was added, so the click genuinely reaches the handler and is silently discarded by the early return at `:3097`. The status line beneath does explain the state, but the control itself now contradicts it.

**This breaks acceptance criteria 1 and 2 literally.** Both say the segment is *dimmed*. It is not. It also departs from the design guide's component spec, which pins `opacity: 0.55` with `cursor: not-allowed` on any disabled segment.

**Ask:** make the rule match the new attribute, e.g. `.pov-segment[aria-disabled="true"]`, keeping `:disabled` only if some other control still needs it (nothing in this file does — `:916` was its only use). Consider whether `cursor: not-allowed` alone is enough feedback given the click now reaches the handler.

### R2 — No test asserts the visual treatment, which is why R1 shipped

`tests/npub-search.spec.js` — T46, T47, T49, T50

Every disabled assertion in the suite is `toBeDisabled()`, and Playwright resolves that **semantically**: it honors `aria-disabled` and reports the segment as disabled even while it renders at full opacity. The suite is 52/52 green with a visibly broken control.

The test plan's coverage map traces AC-1 and AC-2 to T46/T47, but both criteria say "dimmed" and neither test looks at a computed style. The gap is in the plan, not just the code.

**Ask:** add a computed-style assertion (`opacity`, `cursor`) to T50 alongside the existing `aria-disabled` checks. One test, and it pins the design guide's own numbers.

---

## Non-blocking observations

**N1 — `pointer-events` is worth a decision, not an accident.** With the `disabled` property gone, a real user's click reaches `setActiveView` and is dropped at `:3097`. That early return is correct and necessary. But the ADR chose `aria-disabled` for tab-order reasons and did not consider that it also re-enables pointer interaction. Fixing R1 restores the *cursor* signal; whether the click should be swallowed silently or the control should be inert is a design question worth one line in the ADR either way.

**N2 — A signed-in member sees no note until the probe resolves.** `updatePovUi:3078` reads `_povState`, which is empty before the first probe returns, so the note is hidden during that window where the old build showed its causeless line. This matches the design guide ("the toggle renders in its resting shape with no status line") and is an improvement, but it is a behavior change no test pins.

**N3 — `_povState` has one writer, as designed.** `:3186`, `:3194`, `:3197` write; `:3078` reads. The ADR flagged the generality as a scope judgment for this review: it is contained, adds no behavior, and story #8 will add the community perspective as a second key. Accepted.

---

## Scrutiny items from the brief

**(a) Were the two mid-phase fixture corrections legitimate?** **Yes, both — and both moved toward production fidelity rather than away from it.**

- **`Access-Control-Expose-Headers` on the 202 fixture.** The live provider sends `access-control-expose-headers: X-Reason, Retry-After`; without it a browser hides the header from script entirely. The original fixture described a response no server sends, and the implementation was *correctly* refusing to read a non-exposed header. Adding it made the test faithful. Had the implementation been the broken party, this change would have masked it — it did not, because the header exposure is independently verified on the live host.
- **`dispatchEvent('click')` instead of `.click()`.** Playwright refuses `.click()` on an `aria-disabled` element as unactionable, which would have proven nothing about the handler. `dispatchEvent` is in fact *closer* to real user behavior here than Playwright's refusal, because — see R1 — a real browser lets a real click through to an `aria-disabled` button. Legitimate, and the finding it brushed against is now R1.

**(b) Can provider text still reach the DOM?** **No.** `logPovRefusal:3137` returns `Promise<void>`; the extracted string is a local never returned, and its only sink is `console.warn:3146`. Both call sites (`:3195`, `:3197`) discard it by construction. Nothing else in the diff reads `X-Reason`, `body.error`, or `body.detail`. The ADR's structural argument holds in the shipped code. T46 asserts the absence against a fixture carrying the real production reason in both channels, so the assertion bites. Minor credit: `resp.clone()` avoids consuming the body.

**(c) Did the implementation stay inside story #7?** **Yes.** `runFreetextSearch`, `fetchTrustScores`, `_scoreCache`, and the search panel are untouched — the only diff line matching those names is a comment rewrite. No preference order, no community-perspective handling, no `global:` namespace, no session stickiness. The contrast fix was deliberately left out (`:932` still `var(--grey-text)`), correctly leaving story #10 its own diff. **Note this now interacts with R1:** fixing R1 touches `:916`, adjacent to #10's `:932`, so the two stories will edit neighboring rules. Keep them separate anyway.

**(d) Did removing the `disabled` property break anything?** **Yes — that is R1**, and it was the only dependent. `grep` finds `:disabled` at `:916` alone; the removed `mine.disabled =` assignment has no other readers. No JS reads `.disabled` on the segment.

---

## Quality gates (run by the Reviewer)

| Gate | Result |
|---|---|
| `npx playwright test tests/npub-search.spec.js` | **52 passed** |
| `npm run test:unit` | **106 / 107** |

The single unit failure is `test/builder-parity.test.js`, pre-existing `tapestry/` checkout drift, dispositioned in reviews #2/#4/#6. **Confirmed unchanged:** the test file is byte-identical to its state at `c7765e5`, before this story began. Not a regression.

Green gates did not catch R1 — see R2.

---

## Acceptance criteria

| AC | State |
|---|---|
| 1 — 422 → dimmed + registration cause | **Copy correct, "dimmed" fails (R1)** |
| 2 — 202 + estimate → dimmed + interval | **Copy correct, "dimmed" fails (R1)** |
| 3 — no usable estimate → fallback copy | Met — T49 covers absent, unparseable, negative, elapsed |
| 4 — served → selectable, re-ranks, indicator | Met — T36, and T44/T45 pin the retired inference |
| 5 — no provider text anywhere | Met — see (b) |
| 6 — dimmed segment reachable + described | Met semantically (T50); the visual half is R1 |
| 7 — Community view unchanged | Met — T15–T35, T39–T43 pass unmodified |
| D1 — interval buckets | Met — T48 walks both sides of every boundary and the five-minute floor |

Copy checked verbatim against the design guide and style guide. All three strings match character for character, including the sentence split in the preparing line. No banned vocabulary, no emoji, no em-dash join.

---

## Book completion check

The book is **PRD-backed**, so completion is computed against `product-team/prd/pov-availability.md` §8.1.

| §8.1 bullet | Story | State |
|---|---|---|
| Independent resolution + preference order | #8 | Not started |
| Five status-line messages | #7 | Two of five (the member's own); three belong to #8 |
| Three indicator phrasings | #8 | Not started |
| Search-panel line | #8 | Not started |
| Suppressing provider strings | #7 | Done |
| Never render a refusal as an absence | #8 | Not started |
| Re-check on return | #9 | Not started |
| Contrast + touch targets | #10 | Not started |

**The book is not complete and no close is offered.** Stories #8, #9, and #10 remain.

---

## Live-preview checks

**Status 2026-08-26:** checks **1 (202)** and **2 (422)** confirmed by the PO against real Nostr
accounts on a live preview. The 202 branch shipped tested only against an unobserved fixture, so
this closes the largest known gap in the story. Checks 3–6 not reported as run.

Per CLAUDE.md "How to operate" item 6. Verify on a deployed preview with a real browser and a real provider — the suite proves behavior against stubs only.

1. **The 202 "being set up" path — CARRIED FROM TEST DESIGN, still outstanding.** This is the one the PO asked to be reminded of. The entire preparing branch ships tested only against a fixture nobody has ever observed: no perspective we control sits in the scheduled-but-not-computed window, so neither the status nor the `Retry-After` shape has been seen from this provider. **What to do:** register a perspective and load Members during the window before its scores land. **What to look for:** the note reads `My view is being set up. Check back in about {interval}.` with a plausible interval, and the console shows a `202` rather than a swallowed error. **If the window cannot be caught, say so explicitly rather than marking this passed** — an unverified branch recorded as verified is worse than one recorded as open.
2. **A real 422 for a real unregistered member.** Sign in as a member with no computed scores against the live provider. **Look for:** the registration sentence verbatim, the segment dimmed *(re-check after R1 is fixed)*, and the provider's reason in the console but nowhere on the page. Search the rendered page for "graperank" and "nosfabrica" to confirm.
3. **CORS from the deployed origin.** The interval depends on `Retry-After` surviving `Access-Control-Expose-Headers` from the Vercel origin, not from curl. **Look for:** an interval rather than the "a few minutes" fallback — that fallback is exactly what a CORS failure would look like, so a silent degrade here is easy to miss.
4. **A provisioned member whose ranks come back zero.** The false-negative this story fixes. **Look for:** My view enabled where the current production build disables it.
5. **Keyboard and screen reader.** Tab to the dimmed segment. **Look for:** it takes focus, and the reason is announced with the control rather than as a stray line.
6. **Real relay and provider latency.** Load Members repeatedly on a cold cache. **Look for:** the segment never appears live and then goes dim, or vice versa, as the probe resolves.

---

## Summary

The design is sound and the implementation follows it closely. Retiring the value-based inference is a genuine correctness win, and routing the provider's reason through a function that returns nothing makes the leak structurally impossible rather than merely forbidden — that is the strongest thing in this diff.

R1 is a small fix with a real user-facing cost: the control most members will meet now looks enabled while doing nothing. R2 is why a green suite did not notice, and is worth fixing in the same pass so the next attribute change cannot repeat it.

**Kick back to `/implement-feature` with R1 and R2.**
