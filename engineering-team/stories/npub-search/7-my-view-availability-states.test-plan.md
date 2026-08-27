# Test Plan: Story 7 — My view availability states

**Story:** `engineering-team/stories/npub-search/7-my-view-availability-states.md`
**ADR:** `engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md` (Accepted 2026-08-25)
**Date:** 2026-08-25

## Coverage map

| Criterion | Test | ID | Level |
|---|---|---|---|
| AC-1 — 422 → dimmed + registration cause | `refused perspective → dimmed segment, registration cause, no provider text` | **T46** | e2e |
| AC-2 — 202 + estimate → dimmed + interval | `still being set up → the wait, with an interval from the provider's estimate` | **T47** | e2e |
| AC-2 — interval bucket boundaries | `interval buckets: boundaries, the five-minute floor, and the date form` | **T48** | e2e |
| AC-3 — no usable estimate → fallback copy | `no usable estimate — absent, unparseable, or already elapsed → a few minutes` | **T49** | e2e |
| AC-4 — served → selectable, re-ranks, indicator | `ready member: My view enabled; probe request contract pinned` | **T36** *(re-pinned)* | e2e |
| AC-4 — served despite zero-valued ranks | `served with all-zero ranks reads READY — no value inspection` | **T44** | e2e |
| AC-4 — served with no matching rows | `served with empty results reads READY` | **T45** | e2e |
| AC-5 — no provider text in the DOM | asserted inside **T46**, **T47**, **T49** | — | e2e |
| AC-6 — dimmed segment reachable + described | `dimmed segment stays focusable, is aria-disabled, and is described by its note` | **T50** | e2e |
| AC-7 — Community view unchanged | asserted inside **T46**; plus T15–T35 and T39–T43 passing unmodified | — | e2e |

**Re-pinned from the retired heuristic:** **T36** (assertion message only — it asserted readiness came from `rank > 0`), **T37** (rewritten: its all-zero and empty cases now assert READY, which is the inverse of what it pinned). **T38** passes unmodified — the probe still fires on every visit.

## Edge cases

- [x] **Provisioned perspective whose probe targets both score zero** — the false-negative class ADR 0047 kills. T44 is the regression test; it asserts the opposite of what T37 asserted yesterday.
- [x] **`200` with an empty `results` array** — served, therefore ready. T45.
- [x] **`Retry-After` as an HTTP-date**, not just delta-seconds. T48.
- [x] **`Retry-After` already elapsed** — treated as absent rather than rendered as zero or negative. T49.
- [x] **Bucket boundaries**, each side: 89/90s, 599/600s, 5399/5400s. T48.
- [x] **The five-minute floor** — a 90-second wait must not render "about 0 minutes". T48.
- [x] **Probe network failure** — not ready, no note, page fully functional. T37.
- [x] **A refusal carrying a realistic reason in both channels** (`x-reason` header *and* `body.error`), so "no provider text in the DOM" is a meaningful assertion rather than a vacuous one. T46.
- [ ] **A live `202`** — not reachable. See Limitations.
- [x] Concept Graph API unavailable — not applicable; the story touches no concepts.

## Limitations

> **DISCHARGED 2026-08-26 — PO confirmed the 202 and 422 paths against real Nostr accounts on a
> live preview.** The preparing branch is no longer unverified: it has now been observed against
> the real provider, not only against the fixture below. The Limitations note that follows stands
> as the record of what was true when the tests were written.
>
> ~~**CARRY TO REVIEW — live check owed (PO, 2026-08-25).**~~ The 202 "still being set up" path
> must be exercised against the live provider before this story is treated as closed. It cannot
> be produced from outside today, so the check is: register a perspective that is not yet
> computed and load the Members page during the scheduled-but-not-ready window, confirming the
> note reads `My view is being set up. Check back in about {interval}.` with a sane interval.
> If the window cannot be caught, say so explicitly in the review rather than marking it passed.

**The 202 branch is tested against a fixture that has never been observed.** No perspective we control sits in the scheduled-but-not-computed window, so the shape is taken from the contract, not from a capture. T47–T49 pin *our* mapping from the provider's estimate to copy; they cannot prove the provider sends what we assume. Recorded so a future reader does not mistake these fixtures for evidence.

## Notes for the Implementer

Two naming points the ADR and the design guide state separately, reconciled here so the tests are stable:

- The note keeps its **id** `pov-disabled-note` (the ADR's `aria-describedby` target). Every new test locates it by id.
- Its **class** becomes `pov-status-note` (the design guide generalizes `.pov-disabled-note`, which no longer describes an element that also carries "preparing"). T50 asserts the class. The old class may remain alongside it or be dropped; the tests do not care.

## Boundary worth a second look

At exactly 90 minutes the spec renders `about 2 hours` — `n = round(5400/3600) = round(1.5) = 2`. Over-stating a wait is the safer direction, so the tests pin it as written. Flagged in case the PO prefers 90 minutes to read as `about an hour`.

## Test infrastructure

- **Framework:** Playwright (`tests/npub-search.spec.js`), fully stubbed and offline. No test contacts a live host.
- **Concept Graph API:** not required.
- **Firmware state:** no precondition.
- **Fixtures:** `povScores()` (shared), plus a new `stubProbe(page, probeResponse)` helper that answers the member's own perspective with a given status/body/headers and every other perspective normally. `stubRankApi` gains pass-through support for response headers so `x-reason` and `retry-after` can be set.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

Unit suite (unchanged by this story):

```
npm run test:unit
```

## Verification

New tests fail against the current implementation. Confirmed 2026-08-25 on commit `c7765e5`:

```
8 failed
  › Community view / My view toggle (#3) › probe transport failure → disabled segment, no note, page intact
  › My view availability states (#7) › served with all-zero ranks reads READY — no value inspection
  › My view availability states (#7) › served with empty results reads READY
  › My view availability states (#7) › refused perspective → dimmed segment, registration cause, no provider text
  › My view availability states (#7) › still being set up → the wait, with an interval from the provider's estimate
  › My view availability states (#7) › interval buckets: boundaries, the five-minute floor, and the date form
  › My view availability states (#7) › no usable estimate — absent, unparseable, or already elapsed → a few minutes
  › My view availability states (#7) › dimmed segment stays focusable, is aria-disabled, and is described by its note
44 passed (1.9m)
```

Each fails on its own named assertion, with a message describing what was expected — not on a
helper or fixture fault. Representative reasons:

- `a served perspective is ready even when every rank it returns is zero` — the segment is
  disabled, because the shipped code still inspects the values.
- `the cause a member can act on, verbatim` — the note carries yesterday's causeless copy.
- `aria-disabled, not the disabled attribute` — resolved to
  `<button disabled … id="pov-segment-mine">`, `aria-disabled` is `null`.

**T15–T35 and T39–T43 pass unmodified**, as required.
