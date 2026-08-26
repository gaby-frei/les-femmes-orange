# Review: Story 8 — Community refusal and the preference order

**Story:** `engineering-team/stories/npub-search/8-community-refusal-preference-order.md`
**ADR:** `engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md` (amended 2026-08-26, Decisions 7–10)
**Test plan:** `engineering-team/stories/npub-search/8-community-refusal-preference-order.test-plan.md`
**Book:** `engineering-team/audits/pov-availability/book.md` (Open, PRD-backed)
**Diff:** `30a5dd9..d5d5ffe` on `feat/npub-search`
**Date:** 2026-08-26

## Verdict: **CHANGES REQUESTED** → **resolved 2026-08-26**

> **Resolution.**
> - **R1** reconciled in favour of the safer behavior, per PO: AC-7 and ADR Decision 8 now state the
>   stranding exception explicitly, and **T58** pins the second-move branch that had no coverage.
> - **R2** fixed: the toggle markup ships with no side selected and both sides inert, and
>   `_perspectivesResolved` makes a click before resolution a no-op. **T55 extended** to hold the
>   probes open and assert the pre-resolution window — verified to catch the original defect
>   (`pov-segment-community must not be selected before resolution`, expected `"false"`, received
>   `"true"`).
> - **Live checks 1 and 4** accepted as **UNVERIFIED** by PO decision, 2026-08-26 — see below.
> - **A1 ratified** by the PO the same day; AC-6 is a settled requirement, not an assumption.
>
> Gates re-run: **60/60** e2e, 106/107 unit. **Story #8 passes.**

Two deviations from stated contracts, both in edge cases the tests cannot see. The core work is good — the preference order is correct, the transport-error fix is a genuine catch, and the copy is exact. Neither finding is a redesign; R1 is most likely a documentation reconciliation and R2 is a few lines.

---

## Blocking

### R1 — The page can move a member twice in one visit; AC-7 and the ADR both say once

`public/index.html:3277–3287`

```js
const currentStillWorks =
  (_activeView === 'community' && houseUsable) ||
  (_activeView === 'mine' && mineServed);
if (!_movedThisVisit || !currentStillWorks) { … _activeView = want; }
```

**Failure scenario.** One visit. The community perspective is declined, so the page moves her to My view and announces it — move one, `_movedThisVisit = true`. Still in that visit, the community perspective recovers *and* her own is declined. `currentStillWorks` is now false, so the guard is bypassed and she is moved back to Community — **move two**, in the same visit, unannounced by anything the story specifies.

AC-7 reads *"the page changes her perspective without being asked **at most once**."* ADR Decision 8 is more explicit: *"Once the page has moved her, a later re-resolution re-enables controls but does not move her again."* The code does move her again.

**The behavior is probably right and the contract is probably wrong.** The escape hatch exists so she is not stranded on a perspective the provider has stopped serving — leaving her there would render a page ordered by scores that cannot arrive. That is the safer choice. But it is not what either document says, and **no test covers this branch**: T57 exercises only the recover-while-hers-still-works path.

**Ask:** reconcile them, don't just pick one. Either restrict the code to a hard single move, or amend AC-7 and ADR Decision 8 to state the stranding exception explicitly — and in either case add the test for the second-move path. My recommendation is to amend the documents, since stranding is the worse outcome.

### R2 — The selection *is* visible on the wrong side before resolution; T55 cannot see it

`public/index.html:1713` (markup) vs `:3291` (the only paint)

The toggle's static markup ships with `aria-checked="true"` on `#pov-segment-community`. `resolvePerspectives()` is `async` and awaits two network probes before painting. So in the declined-community case the member sees **Community selected** for the duration of those probes, then the selection jumps to My view.

That is the exact motion AC-5 forbids: *"the control never displays one side selected and then switches to the other."*

**T55 cannot detect this.** It patches `setAttribute` and inspects the *write* sequence, and the initial state is markup, not a write — so the sample begins after the misleading paint has already happened. The test passes, correctly, on the question it asks; it is asking a narrower question than AC-5 poses.

This is the same defect shape as story #7's R1: the instrument measures a proxy, and the proxy is clean while the thing itself is not. Worth noting the Implementer already replaced one instrument here (a MutationObserver that silently recorded nothing) — the third attempt still stops one step short.

**Ask:** give the toggle a genuinely neutral resting state until resolution completes — no side `aria-checked="true"` in the markup, or the control marked unresolved and both sides inert — and extend T55 to assert the state at first paint, not only the writes after it.

---

## Non-blocking

**N1 — The extra request is now invisible to every test.** See scrutiny item (a): the two modified counters were the only places that would have noticed the community probe, and both now filter it out. ADR Decision 7 accepted the cost deliberately, so this is not a hidden regression, but nothing now pins *how many* probes a visit fires. A single assertion — resolution fires exactly two probes per Members-page visit — would close it, and would catch a future double-resolution bug that the current suite would sail past.

**N2 — The house/mine asymmetry has a mild cost worth knowing.** When the community probe fails on transport, `houseUsable` stays true, so the page keeps Community view even when her own perspective is servable and would produce a fully personalized page. This is consistent with the optimistic rule and with shipped behavior, and it is the right default. Just recording that "the network blipped" and "the provider is healthy" are indistinguishable here by design.

**N3 — The My view avatar now paints later.** `updatePovUi:3137` is the only thing that fills `#pov-my-avatar`, and it now runs only after both probes settle rather than synchronously on entry. The placeholder dot shows for roughly a round trip longer. Cosmetic, no test covers it either way.

**N4 — The `chipCalls` filter is fixture-dependent.** `(pubkeys.length === 2 && includes(CURATOR))` would also exclude a genuine two-member chip batch that happened to contain the curator. Not reachable with current fixtures; worth knowing if grid fixtures ever shrink.

---

## Scrutiny items from the brief

**(a) Are the two modified counters honest?** **Yes — honest, and correctly scoped.** T30's `chipCalls` and T41's `houseCalls` were written when the chip batch was the only `pov`-keyed request. Story #8 adds a second kind, so a counter that says "chip batch" must now say which it means or it stops measuring what it claims. Both assertions are unchanged — `toBe(1)`, `toBe(baseline)` — and only the population is narrowed, by request *shape* rather than by count. That is a clarification, not a weakening. The residual gap is N1: nothing else picked up the coverage they dropped.

**(b) Can a transport failure be mislabeled "not registered"?** **No, and this was a real catch.** The Implementer's first resolver recorded every failure as a refusal, which would have rendered the registration sentence whenever the network dropped — a false and unfixable instruction to a member. `probePerspective:3243` now writes `_povState` only on `422` and `202`; every other outcome deletes the entry and returns `false`. Traced all three paths: a `500` returns false with no state, so `_myViewReady` is false and `updatePovUi:3120` finds no `povInfo` and shows nothing; an abort is caught at `:3268` and behaves identically; a transport failure on the house leaves `houseUsable` true. T37 covers the last of these. **The asymmetry is deliberate and safe** — see N2.

**(c) Does AC-7's guard hold?** **No — that is R1.** It cannot strand her, which was the other half of the question, and that is exactly why it can move her twice.

**(d) Did removing both `updatePovUi()` entry calls leave anything unpainted?** **No unpainted state, but one delayed.** `updatePovUi` remains reachable from `setActiveView:3168` and `resolvePerspectives:3291`, and the latter runs on every Members-page entry from both `showView` and `loadMembersPage`, including when the probes reject. Everything it paints still gets painted. The avatar is merely later — N3. The indicator is a special case of R2.

**(e) Copy.** Checked character for character against the design guide. All three new strings match, including the two-sentence split in the community-declined line and the absence of any trailing period issue. Style guide clean: no emoji, no em-dash sentence join, no banned vocabulary, and — importantly — nothing claims "the whole Nostr network". T52 sweeps `PROVIDER_LEAKS` and asserts that phrase never appears.

**(f) Scope.** No story #9 behavior: no re-check discipline, no visit-scoped suppression of repeat requests. No story #10 behavior: `--grey-text-strong` absent, segment padding untouched, contrast still at the shipped value. `git diff` confirms neither slug's markers appear.

---

## Quality gates (run by the Reviewer)

| Gate | Result |
|---|---|
| `npx playwright test tests/npub-search.spec.js` | **59 passed** |
| `npm run test:unit` | **106 / 107** |

`test/builder-parity.test.js` is byte-identical to its state at `30a5dd9`. Pre-existing drift, not a regression.

Green gates did not catch R1 (untested branch) or R2 (instrument narrower than the criterion).

---

## Acceptance criteria

| AC | State |
|---|---|
| 1 — substitution + announcement | Met — T51 |
| 2 — neither served → both dimmed | Met — T52, plus the leak sweep |
| 3 — unpersonalized search still returns rows | Met — T53; never the empty or unavailable states |
| 4 — substituted My view carries no notice | Met — T54 |
| 5 — selection never moves | **Fails at first paint (R2)**; met for every write thereafter |
| 6 — explicit choice outranks the order | Met — T56. **Rests on assumption A1, not a PO ruling** |
| 7 — at most one unrequested move | **Deviates (R1)** |

**A1 remains an assumption.** The story records it as the PRD's reading rather than a PO decision, and AC-6 is built on it. If the PO would rather the preference order always win, AC-6 inverts and `_viewChosenByMember` (`:3255`) becomes dead. Nothing else depends on it. **This should be settled before the book closes**, since the addendum will otherwise report a shipped behavior nobody ratified.

---

## Book completion check

Computed against `product-team/prd/pov-availability.md` §8.1:

| §8.1 bullet | Story | State |
|---|---|---|
| Independent resolution + preference order | #8 | **Done** |
| Five status-line messages | #7 + #8 | **Done** (all five now shipped) |
| Three indicator phrasings | #8 | **Done** |
| Search-panel line | #8 | **Done** |
| Suppressing provider strings | #7 | Done |
| Never render a refusal as an absence | #8 | **Done** |
| Re-check on return | #9 | Not started |
| Contrast + touch targets | #10 | Not started |

**Six of eight bullets complete. The book is not complete and no close is offered** — stories #9 and #10 remain.

---

## Live-preview checks

> **PO DECISION 2026-08-26 — accepted as unverified.** The states requiring a declining community
> perspective (checks 1 and 4) are **recorded as not verified against a live provider**, and are not
> to be reported as passed. They ship on stub coverage alone. Checks 2, 3, 5 and 6 remain runnable
> and outstanding.

**State this plainly: unlike story #7, every state in this story is stub-only.** The community perspective is provisioned and healthy on the live provider, and there is no way to make it decline on demand. Story #7's 422 was verifiable because the PO could sign in as an unregistered account; there is no equivalent lever here. **Nothing below has been observed against a real provider, and the checks that require a declining community perspective may not be runnable at all without deliberately pointing a preview at an unprovisioned key.**

1. **Point a preview at a deliberately unprovisioned community key.** The only way to reach AC-1 and AC-2 live. **Look for:** the substitution to My view with its announcement, then — with a member who is also unregistered — both sides dimmed and the unpersonalized copy. **If this cannot be arranged, record the states as unverified rather than passed.**
2. **The regression that matters most: both perspectives healthy.** The overwhelmingly common case, and the one real users will hit. **Look for:** Community view selected, no status line, chips and grid ordering exactly as before this story. Any change here is a regression, not a feature.
3. **Toggle settle on a real round trip** *(after R2 is fixed)*. Real provider latency is ~250–450ms, far longer than a stub. **Look for:** the selection never resting on Community and then jumping. This is the check that would have caught R2, and a stub cannot substitute for it.
4. **Unpersonalized search returns rows.** With no perspective servable, confirm results still render under the single notice, and that neither "No profiles matched" nor "Search is temporarily unavailable" appears.
5. **Console hygiene across all states.** **Look for:** refusal reasons in the console only, nothing on the page. Search the rendered page for "graperank", "nosfabrica", and "point of view".
6. **Cold cache, real latency.** Load Members repeatedly. **Look for:** the avatar placeholder resolving (N3), and chips arriving without the perspective label ever disagreeing with the numbers beneath it.

---

## Summary

The preference order is implemented correctly and the hard part — two perspectives resolved independently, with the substitution announced exactly once — works. The transport-error fix is the strongest thing in the diff: it caught a bug that would have told members their account wasn't registered every time the network hiccuped, and it was found by chasing a story #7 regression rather than by luck.

Both findings live where the tests cannot look. R1 is an untested branch that contradicts two documents; the likely fix is to correct the documents, but it needs a decision rather than a default. R2 is the third instrument in this story to stop one step short of the criterion it serves, and it is worth fixing properly rather than measuring the same proxy a fourth way.

**Kick back to `/implement-feature` with R1 and R2.**
