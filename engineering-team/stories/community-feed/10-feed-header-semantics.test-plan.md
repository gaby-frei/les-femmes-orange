# Test Plan: Story 10 — Feed header semantics ("active content taggers")

**Story:** `engineering-team/stories/community-feed/10-feed-header-semantics.md`
**ADR:** `engineering-team/decisions/0038-feed-header-taggers.md`
**Date:** 2026-07-12

Small additive story → tests ride the existing suites plus one new Playwright spec. Same fakes and
stub patterns as #8/#9.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| Payload: appliers only, disputer never listed | `candidates carry taggers — distinct APPLIER pubkeys; a disputer is never listed (Story 10)` | `test/fetch-tagged.test.js` | unit |
| Payload: multiple appliers per note | `two appliers on one note → both pubkeys in taggers (Story 10)` | `test/fetch-tagged.test.js` | unit |
| Merge: cross-tag applier union by pubkey | `dedupe unions taggers by pubkey — cross-tag appliers combine on one note (Story 10)` | `test/merge-pools.test.js` | unit |
| Payload: taggers reach notes; P1-only notes carry none | `a Provider-2 note carries its applier pubkeys in the payload; a Provider-1-only note carries none (Story 10)` | `test/feed-event-tag.test.js` | unit |
| Header: line present, deduped across notes+tags; first line unchanged | `the header shows the taggers line beneath members/posts, deduped across notes and tags` | `tests/feed-tagger-count.spec.js` | e2e |
| Header: live per-channel recompute incl. zero | `the count follows the channel selection live, including down to zero` | `tests/feed-tagger-count.spec.js` | e2e |
| Header: singular at 1 | `singular copy at exactly one tagger` | `tests/feed-tagger-count.spec.js` | e2e |
| Header: always rendered (all-untagged pool → 0) | `a pool with no tagged notes still shows the line at zero` | `tests/feed-tagger-count.spec.js` | e2e |

## How to run
```
npm run test:unit && npx playwright test tests/feed-tagger-count.spec.js
```

## Verification
RED confirmed 2026-07-12 (post-#9 baseline): unit 98 tests — 94 pass / **4 fail** (all Story 10,
behavior failures); Playwright `feed-tagger-count.spec.js` — **4 fail** (line absent). All other
suites green.
