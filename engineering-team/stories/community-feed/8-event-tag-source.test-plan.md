# Test Plan: Story 8 — Event-tag source (Provider 2)

**Story:** `engineering-team/stories/community-feed/8-event-tag-source.md`
**ADR:** `engineering-team/decisions/0036-feed-event-tag-source.md`
**Date:** 2026-07-09 · **Amended:** 2026-07-11 (tag-pill UI: +6 unit tests, +1 Playwright spec)

All tests are unit-level with injected fakes (no live relays, no live HTTP in CI), per the story's
`buildFeedPayload(deps)` pattern and ADR 0036's seams. The relay fake
(`test/fixtures/event-tagging.js`) is **filter-faithful** — it applies real NIP-01 matching
(`kinds`/`ids`/`authors`/`#a`/`#z`/`#e`) — so provider tests exercise genuine filter composition, not
stub dispatch. The 2026-07-11 UI amendment (tag pill) adds one Playwright spec,
`tests/feed-tag-pill.spec.js`, using story #6's stubbed-`getFeed` pattern.

AC labels: S = Sourcing, R = Relevance & channels, M = Merge & ordering, X = Seam & contract,
D = Degradation, in story order.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| S1 member-tagged note appears | `sources a note that a member tagged lfo-community (S1)` + `a member-tagged note appears in the feed alongside hashtag notes (S1, feed level)` | `test/fetch-tagged.test.js`, `test/feed-event-tag.test.js` | unit |
| S2 non-member **author** still appears | `keeps a tagged note whose AUTHOR is not a member — the gate is on the tagger (S2)` | `test/fetch-tagged.test.js` | unit |
| S3 non-member **tagger** not admitted | `drops an assertion applied by a non-member (S3)` | `test/fetch-tagged.test.js` | unit |
| S4 polarity: dispute / absent / neutral | `dispute polarity (≤ −0.5) does not admit the note (S4)`; `an absent polarity tag means apply (S4)`; `polarity in the open interval (−0.5, 0.5) is neutral — counted as neither (S4)` | `test/fetch-tagged.test.js` | unit |
| S5 header outside discovered set excluded at sourcing | `an assertion whose descriptor names an un-honored header is never sourced (S5)` | `test/fetch-tagged.test.js` | unit |
| S6 other tags never sourced | `a different tag (stoicism) is never sourced — tag scope is exactly one tag (S6)` | `test/fetch-tagged.test.js` | unit |
| S7 headers discovered, not pinned; union across all | `unions assertions across ALL discovered headers — no pinned coordinate (S7)` | `test/fetch-tagged.test.js` | unit |
| R1 classifier never excludes a P2 note | `the relevance classifier never sees nor excludes a Provider-2 note (R1)` (also pins that P2 notes are never *sent* to the classifier) | `test/feed-event-tag.test.js` | unit |
| R2 channels contain `lfo` | `a Provider-2 note carries the lfo channel (R2)` + provenance test below | `test/feed-event-tag.test.js` | unit |
| R3 both providers → once, channels unioned | `a note sourced by BOTH providers appears once with unioned channels (R3)` + `dedupes by event id: channels unioned, vias concatenated (R3)` | `test/feed-event-tag.test.js`, `test/merge-pools.test.js` | unit |
| M1 dedupe + newest-first + cap | `merged pool is deduped, strictly newest-first, and capped… (M1+M2)` + `orders the merged pool strictly newest-first (M1)` | `test/feed-event-tag.test.js`, `test/merge-pools.test.js` | unit |
| M2 older P2 note doesn't displace | `caps at displayLimit; an older Provider-2 note does not displace a newer Provider-1 note (M2)` | `test/merge-pools.test.js` (+ feed-level M1+M2 test) | unit |
| X1 provider add/remove leaves merge/ordering unchanged | `merges any number of pools — 1, 2, or 3 — with the same logic (seam AC)` (structural: merge takes N pools of provenance-annotated candidates) | `test/merge-pools.test.js` | unit |
| X2 payload shape unchanged | `the payload contract is unchanged: memberCount, notes, memberNames, channelsAvailable (X2)` | `test/feed-event-tag.test.js` | unit |
| X3 memberCount counts non-member P2 author | `memberCount counts the non-member author of a displayed tagged note (X3, deliberate per story)` | `test/feed-event-tag.test.js` | unit |
| D1 tagging relay down → zero notes, feed survives | `tagging relay down → zero candidates, relayOk false, and no throw (D1)`; `Provider 2 degrading to zero notes leaves the Provider-1 feed intact (D1)`; `a THROWING fetchTaggedCandidates dep never fails the request (D1, defense in depth)` | `test/fetch-tagged.test.js`, `test/feed-event-tag.test.js` | unit |
| D2 TA endpoint down → degrade, no hardcoded fallback | `TA pubkey unresolvable → degrades to zero candidates with NO relay query and NO hardcoded fallback (D2)` + all of `test/ta-pubkey.test.js` | `test/fetch-tagged.test.js`, `test/ta-pubkey.test.js` | unit |
| D3 relayStatus reports the tagging relay | Covered at the seam: `relayOk` is asserted true/false in the D1/D2 tests above. The one-line handler wiring (`relayStatus` append) is not reachable by `npm test` (no real deps, per ADR 0033's precedent) — verify on preview deploy. | `test/fetch-tagged.test.js` | seam + manual |
| **UI-1** payload carries `taggedWith` (P2) / none (P1-only) | `candidates carry taggedWith from the live tag-element (UI amendment)`; `a Provider-2 note carries taggedWith in the payload; a Provider-1-only note carries none (UI amendment)`; `dedupe unions taggedWith by name — a both-provider note keeps its pill metadata (UI amendment)` | `test/fetch-tagged.test.js`, `test/feed-event-tag.test.js`, `test/merge-pools.test.js` | unit |
| **UI-2** pill renders on tagged notes only | `a tagged note shows a pill labeled with the tag name beneath its content`; `an untagged note renders no pill row` | `tests/feed-tag-pill.spec.js` | e2e |
| **UI-3** toggle reveals/hides description, `aria-expanded` tracks | `clicking the pill toggles the description open and closed, tracked by aria-expanded`; `the pill toggles from the keyboard (Enter and Space)` | `tests/feed-tag-pill.spec.js` | e2e |
| **UI-4** card-link isolation | `pill and description clicks never trigger the card's open-in-Primal action` (also asserts the card link still works — isolation, not suppression) | `tests/feed-tag-pill.spec.js` | e2e |
| **UI-5** tag-element degradation (slug fallback, inert toggle, request succeeds) | `tag-element missing → taggedWith falls back to the slug…`; `tag-element with unparseable content → same slug fallback, no throw`; `a slug-fallback entry (empty description) renders an inert pill` | `test/fetch-tagged.test.js`, `tests/feed-tag-pill.spec.js` | unit + e2e |

## Edge cases

- [x] Apply + dispute by different members → still admitted (story's ≥1-application rule) — `fetch-tagged`.
- [x] Two member applications on one note → one candidate, `vias[0].applications === 2` — `fetch-tagged` (provenance seam Story #2 ranks on).
- [x] Assertion targeting an addressable event (`a`-tag target) → ignored (story scope is kind-1) — `fetch-tagged`.
- [x] Tagged id whose kind-1 body doesn't resolve on the tagging relay → dropped silently (ADR Decision 3) — `fetch-tagged`.
- [x] Empty pools → `[]`; equal `created_at` → deterministic order regardless of pool order — `merge-pools`.
- [x] TA cache: success cached per process (1 fetch / 2 calls); failure NOT cached (retry succeeds); malformed/non-hex/HTTP-error/throwing fetch → `null`, never rejects — `ta-pubkey`.
- [x] `memberNames` stays members-only (non-member P2 author excluded) — `feed-event-tag`.
- [x] `channelsAvailable` remains a Provider-1-only classifier signal: all-pass-through P1 scores → `false` even with P2 notes present — `feed-event-tag`.
- [x] Back-compat: omitting `fetchTaggedCandidates` preserves stories 1–7 behavior — `feed-event-tag`.
- [x] Two tag-element versions on the relay → latest `created_at` wins — `fetch-tagged` (amendment).

Not tested (out of scope per story/ADR): the vendored SDK's internals (third-party, tested upstream;
exercised here through the provider), the double-descriptor `.find()` edge (story: recognized, not
mitigated), relay-hint note fetching (future story).

## Test infrastructure

- Framework: Node built-in runner (`node --test test/*.test.js`). No new infrastructure.
- Fixtures: `test/fixtures/event-tagging.js` — TA/member/non-member pubkeys, `mkHeader` /
  `mkAssertion` / `mkNote` event builders matching the live wire shapes (descriptor `z`, honored-`z`,
  `a`-pointer, polarity), a filter-faithful `fakeRelay(events)` that records calls, and `deadRelay()`.
- Concept Graph API: not needed — no concept behavior in this story (ADR 0036: no firmware change).
- Live relays / HTTP: none. `getTaPubkey` takes `fetchImpl`; the provider takes `queryRelayStatus`.

Four of the new tests pass against current code **by design** — they are regression guards pinning
behavior that must remain true through the change: P2-degrades-to-status-quo, throwing-dep tolerance,
back-compat without the dep, and members-only `memberNames`. All other new tests are RED.

## How to run

```
npm run test:unit                                  # unit suite
npx playwright test tests/feed-tag-pill.spec.js    # the pill spec (UI amendment)
```

(`npm test` runs both. The pill spec follows `tests/feed-topic-channels.spec.js`'s stub pattern —
`window.getFeed` replaced in-page, no live backend. Its DOM seam contract is documented in the spec
header: `.feed-note-tags` row, `.feed-note-tag-pill` button with `aria-expanded`/`aria-disabled`,
`.feed-note-tag-desc` panel.)

## Verification

The new tests fail with the current code. Re-confirmed 2026-07-11 after the UI amendment (base
commit `dabc608`):

```
ℹ tests 83                                        # unit suite
ℹ pass 43   (39 pre-existing + 4 regression guards)
ℹ fail 40   (all Story-8, all failing on behavior, not imports)

Playwright (tests/feed-tag-pill.spec.js): 5 failed, 1 passed
  — the pass is 'an untagged note renders no pill row', a regression guard true by
    definition until the pill exists; all 5 failures are the pill not rendering.
```

Original 2026-07-09 baseline (pre-amendment):

```
ℹ tests 77
ℹ pass 43   (39 pre-existing + 4 regression guards)
ℹ fail 34   (all Story-8, all failing on behavior, not imports)

✖ sources a note that a member tagged lfo-community (S1)
  Error: api/_lib/tagged.js does not export fetchTaggedCandidates yet (Story 8 unimplemented)
✖ merges any number of pools — 1, 2, or 3 — with the same logic (seam AC)
  Error: api/_lib/merge.js does not export mergeCandidatePools yet (Story 8 unimplemented)
✖ resolves the TA pubkey from the endpoint
  Error: api/_lib/ta.js does not export getTaPubkey yet (Story 8 unimplemented)
✖ a member-tagged note appears in the feed alongside hashtag notes (S1, feed level)
  AssertionError [ERR_ASSERTION]: the tagged note is in the feed
```

Missing-module failures use a guarded require so each test reports the missing export by name
instead of dying on import — every failure message states the expected behavior.
