# Test Plan: Story 9 — Multi-tag sources (Bitcoin, Nostr, Ask LFO channel)

**Story:** `engineering-team/stories/community-feed/9-multi-tag-sources.md`
**ADR:** `engineering-team/decisions/0037-multi-tag-sources.md`
**Date:** 2026-07-11

Same infrastructure as #8's plan: Node built-in runner with the filter-faithful relay fakes
(`test/fixtures/event-tagging.js`), Playwright with the stubbed-`getFeed` pattern. Fixtures gained
the four-tag config (`TAGS` — entries now carry `channels` **arrays**, the ADR 0037 shape).

**Signature migration note:** ADR 0037 changes the provider dep from `tag` to `tags` (array).
The existing `test/fetch-tagged.test.js` suite was migrated to `tags: [TAG]` as part of this phase —
its **positive** (sourcing) tests are now RED until the implementation lands, which is the intended
TDD pressure; its **negative** (assert-empty) tests pass trivially during the migration window
(the un-migrated provider degrades to empty) and re-arm as real gates the moment the new signature
is implemented. No #8 behavior is weakened: every #8 gate must hold under a one-entry array.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 per-tag channel assignment | `each tag sources into its own channel: bitcoin→bitcoin, nostr→nostr, ask-lfo→ask-lfo (AC-1)` | `test/multi-tag.test.js` | unit |
| AC-2 multi-tag union (once; both channels; both pills; both vias) | `a note tagged bitcoin AND nostr merges to ONE entry with both channels, both pills, both provenance vias (AC-2)` | `test/multi-tag.test.js` | unit |
| AC-3 tag + Provider-1 union | `an ask-lfo tagged note also sourced by Provider 1 appears once with unioned channels (Story 9 AC-3)` | `test/feed-event-tag.test.js` | unit |
| AC-4 ask-lfo exclusivity (P1 can never assign it) | `a Provider-1 note NEVER carries the ask-lfo channel — even on pass-through scores (Story 9 AC-4)` | `test/feed-event-tag.test.js` | unit |
| AC-5 silent tag leaves others unaffected | `a tag with no relay data contributes nothing and leaves the others unaffected (AC-5)` | `test/multi-tag.test.js` | unit |
| AC-6 per-tag gate spot-checks | `gates hold per tag: a non-member nostr assertion admits nothing (AC-6)`; `per-tag independence: a member dispute on bitcoin does not suppress the same note's nostr application (AC-6)` — plus the full migrated #8 matrix running under the array signature | `test/multi-tag.test.js`, `test/fetch-tagged.test.js` | unit |
| Banner: four pills incl. Ask LFO | `the banner shows FOUR pills, including Ask LFO` | `tests/feed-ask-lfo-channel.spec.js` | e2e |
| Banner: Ask LFO filters alone | `selecting Ask LFO alone shows exactly the ask-lfo-channel notes` | `tests/feed-ask-lfo-channel.spec.js` | e2e |
| Banner: #6 union semantics extend | `Ask LFO unions with other selected channels (#6 semantics)` | `tests/feed-ask-lfo-channel.spec.js` | e2e |
| Banner: uniform degradation (PO decision) | `channelsAvailable=false disables ALL FOUR pills (uniform degradation — PO decision)` | `tests/feed-ask-lfo-channel.spec.js` | e2e |
| Pills: one per tag, independent toggles | `a multi-tagged note renders one pill per tag, each toggling its own description independently` (green guard — #8's renderer already supports this; story 9 pins it) | `tests/feed-ask-lfo-channel.spec.js` | e2e |
| Contract: top-level unchanged, `ask-lfo` a legal channel value | covered by the AC-3/AC-4 feed-level tests + the untouched #8 contract tests | `test/feed-event-tag.test.js` | unit |
| ADR 0037 wire contract (batched fan-out) | `wire contract: one headers REQ carrying every tag coordinate, one elements REQ, one assertions REQ, one bodies REQ (ADR 0037)` | `test/multi-tag.test.js` | unit |
| Relay panel shows the tagging relay (in-phase addition, 2026-07-12) | `the Feed Source Relays panel lists the tagging relay alongside the feed relays` | `tests/feed-ask-lfo-channel.spec.js` | e2e |

## Edge cases

- [x] Per-tag metadata fallback: bitcoin element missing → bitcoin pill degrades to slug, nostr keeps
  real name/description — `multi-tag` (pins the *per-tag* granularity of #8's fallback).
- [x] All of #8's edges re-run under the array signature (polarity buckets, header discovery,
  D3-revision body fetches, dead relays, TA failure) — `fetch-tagged` migrated in place.
- [x] Merge-level union mechanics (channels/vias/taggedWith dedupe) — already pinned by #8's
  `merge-pools` tests; AC-2 composes provider output through the real merge to prove the end-to-end
  union without re-testing merge internals.

Not tested: dynamic banner rendering (out of scope — the fourth pill is static markup); per-tag
`relayOk` (ADR keeps the single-flag contract).

## How to run

```
npm run test:unit
npx playwright test tests/feed-ask-lfo-channel.spec.js
```

## Verification

RED confirmed 2026-07-11 at commit `01326d6`:

```
Unit:       94 tests — 74 pass, 20 fail
            (7 new multi-tag tests + 13 migrated #8 positive tests, all failing on
             behavior under the new `tags` signature; no import errors)
Playwright: feed-ask-lfo-channel.spec.js — 4 failed (fourth pill absent), 1 passed
            (multi-pill note guard — #8's renderer already multi-entry)
✖ each tag sources into its own channel: bitcoin→bitcoin, nostr→nostr, ask-lfo→ask-lfo (AC-1)
✖ wire contract: one headers REQ carrying every tag coordinate, … (ADR 0037)
✖ the banner shows FOUR pills, including Ask LFO
```

All other suites (merge-pools, ta-pubkey, feed-handler, feed-channels, prior Playwright specs)
remain green — the migration touches only the provider dep shape.
