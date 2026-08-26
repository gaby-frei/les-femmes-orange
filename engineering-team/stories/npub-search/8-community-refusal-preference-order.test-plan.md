# Test Plan: Story 8 — Community refusal and the preference order

**Story:** `engineering-team/stories/npub-search/8-community-refusal-preference-order.md`
**ADR:** `engineering-team/decisions/0047-ore-unavailable-pov-client-handling.md` (amended 2026-08-26)
**Date:** 2026-08-26

## Coverage map

| Criterion | Test | ID |
|---|---|---|
| AC-1 — community declined, hers served → substitution + announcement | `community declined, hers served → opens on My view and says why` | **T51** |
| AC-2 — neither served → both dimmed, unpersonalized copy | `neither perspective served → both dimmed, nothing claimed beyond the negative` | **T52** |
| AC-3 — unpersonalized search still returns rows under one line | `unpersonalized search still returns rows, under one honest line` | **T53** |
| AC-4 — substituted My view search carries no line | `substituted My view search carries no notice — those rows are personalized` | **T54** |
| AC-5 — the selection never moves under the member | `the control never shows one side selected and then switches` | **T55** |
| AC-6 — an explicit choice outranks the preference order | `an explicit choice is kept while it can be served` | **T56** |
| AC-7 — at most one unrequested move per visit | `at most one unrequested move per visit` | **T57** |

## Two tests pass before implementation, deliberately

**T54** and **T56** are green against the pre-story code, and that is the point.

- **T54** passes vacuously today — there is no panel notice element to find. It becomes a real
  assertion the moment T53 introduces one, and it is the guard that stops the notice appearing on
  personalized rows.
- **T56** passes because the session view survives in-app navigation today. It pins that as a
  requirement rather than an accident, so the preference order introduced by this story cannot
  quietly start overriding a member's choice.

Recorded so a reviewer does not read them as unwritten.

## Edge cases

- [x] The negative is claimed and nothing more — T52 asserts "nostr network" never appears.
- [x] No provider vocabulary in any of the new states — T52 runs the full `PROVIDER_LEAKS` sweep.
- [x] A declined perspective never renders as "no matches" or "temporarily unavailable" — T53.
- [x] Toggle settle observed rather than sampled — T55 installs a MutationObserver before the page
      loads and inspects the full transition history, so a paint-then-flip cannot hide in a race.
- [x] Recovery mid-visit re-enables the control without moving her again — T57.
- [ ] **A real provider declining the community perspective** — not reachable offline. See below.

## Limitations

The community perspective is provisioned and healthy on the live provider, so **every state this
story adds is reachable only by stub**. Unlike story #7, where the PO could produce a real 422 by
signing in as an unregistered account, there is no way to make the live provider decline the
community key on demand. Carry to Review as a live check with that caveat stated: it may only be
verifiable by pointing a preview at a deliberately unprovisioned key.

## How to run

```
npx playwright test tests/npub-search.spec.js
```

## Verification

Confirmed 2026-08-26: **5 failed, 2 passed** across T51–T57, each failing on its own named
assertion. Representative: T57 fails `Expected "— searching as you", Received "— searching as Les
Femmes Orange"` — the substitution does not exist yet. T54 and T56 pass for the reasons above.
The other 52 tests in the file pass unmodified.
