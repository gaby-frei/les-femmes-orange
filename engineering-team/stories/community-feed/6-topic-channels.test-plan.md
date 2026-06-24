# Test Plan: Story 6 — Topic channels

**Story:** `engineering-team/stories/community-feed/6-topic-channels.md`
**ADR:** `engineering-team/decisions/0034-feed-topic-channels.md`
**Date:** 2026-06-24

## Approach

Two levels, mirroring how Stories 1/3/4/5 are tested:

- **L3 unit (`node --test`)** — the pure `buildFeedPayload(deps)` seam in `api/feed.js`. The ADR's only
  backend change is *additive*: each note gets a `channels: string[]` array (derived from the existing
  per-topic scores at the single shared `threshold`), and the payload gains a top-level
  `channelsAvailable` boolean. These are deterministic and fully unit-testable with faked deps — no relays,
  no AI, no KV. New file: `test/feed-channels.test.js`.
- **e2e (Playwright)** — the browser behavior: the filter banner, pill toggling, client-side filtering of
  the already-fetched feed, the disabled/degraded mode, the empty-filtered state, header recompute over the
  displayed subset, and the panel rename. Stubs `window.getFeed` with synthetic payloads (the established
  pattern) and drives `showView('feed')`. New file: `tests/feed-topic-channels.spec.js`.

### Contract introduced by this story (what the Implementer must satisfy)

**Payload (additive):**
- Each note object gains `channels` — a subset of `['bitcoin','nostr','lfo']`, computed server-side as
  `CHANNELS.filter(c => score[c] >= threshold)` using the **same** `threshold` already passed to
  `buildFeedPayload`. The pass-through fallback `{1,1,1}` therefore yields all three channels.
- The payload gains `channelsAvailable: boolean`. Default **true**. The injected degradation signal sets it
  **false** when per-topic scores could not be produced (classifier/score-store unavailable). The unit
  tests drive this via a `classifierAvailable: false` dep (the real `handler` derives it from the
  anthropic client / classification outcome — implementation detail, not asserted here).

**DOM / globals (e2e):**
- `#feed-channels` — the filter banner, above `#feed-notes`.
- `.feed-channel[data-channel="bitcoin|nostr|lfo"]` — three toggle buttons, labels **"Bitcoin"**,
  **"NOSTR"**, **"LFO Community"**. Selected state exposed via `aria-pressed="true"`. Disabled state via the
  native `disabled` attribute.
- Filtering is **client-side over the fetched `feed`**, re-rendered without a re-fetch on toggle.
- `#feed-hashtags-panel` title text becomes **"Source Hashtags"** (was "Topics").

## Coverage map

| Criterion (story AC) | Test name | Test file | Level |
|---|---|---|---|
| AC-1 banner with 3 labeled toggle pills | `a filter banner shows Bitcoin / NOSTR / LFO Community toggle pills` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-2 default deselected, shows everything | `on load no pill is selected and every note is shown` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-3 single channel → only its notes | `selecting one channel shows only notes in that channel` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-4 multi-select union, de-duplicated | `selecting two channels shows their union with no duplicate cards` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-5 multi-label note appears under each | `a note in two channels appears under each when selected` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-6 deselect-all → full feed | `deselecting the last channel restores the full feed` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-7 toggled state visually distinct | `a pill reflects its selected state via aria-pressed` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-8 filtered-empty → empty state | `a selection that matches no note shows the empty state` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-9 scores unavailable → all shown, pills disabled | `when channels are unavailable the pills are disabled and all notes show` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-10 otherwise unchanged (newest-first over subset) | `filtering preserves the payload (newest-first) order` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-11 header counts reflect displayed subset | `the header member/post counts reflect the filtered subset` | `tests/feed-topic-channels.spec.js` | e2e |
| AC-12 panel rename Topics → Source Hashtags | `the hashtag panel is titled "Source Hashtags"` | `tests/feed-topic-channels.spec.js` | e2e |
| Backend: single-label tagging | `tags a note with the single channel that clears the threshold` | `test/feed-channels.test.js` | unit (L3) |
| Backend: multi-label tagging | `tags a note with every channel that clears the threshold` | `test/feed-channels.test.js` | unit (L3) |
| Backend: sub-threshold excluded from channels | `omits a channel whose score is below the threshold` | `test/feed-channels.test.js` | unit (L3) |
| Backend: pass-through → all channels | `a pass-through (fallback) note is tagged with all three channels` | `test/feed-channels.test.js` | unit (L3) |
| Backend: channelsAvailable default true | `channelsAvailable is true on the normal path` | `test/feed-channels.test.js` | unit (L3) |
| Backend: channelsAvailable false when degraded | `channelsAvailable is false when the classifier is unavailable` | `test/feed-channels.test.js` | unit (L3) |
| Backend: contract stays additive | `the existing note/payload fields are unchanged` | `test/feed-channels.test.js` | unit (L3) |

## Edge cases

- [ ] **Multi-label de-duplication** — a note in both selected channels renders exactly **once** (AC-4/5).
- [ ] **Boundary at the threshold** — a score exactly `= T` puts the note **in** that channel (`>=`), mirrored from `select-relevant.test.js`'s boundary test (covered implicitly by single-label tagging using golden scores; threshold reuse is asserted by constructing a `= threshold` score).
- [ ] **Pass-through fallback** — never narrows the feed: all notes carry all channels, so any selection still shows them (AC-9 cross-check at the data layer).
- [ ] **Disabled pills are not clickable** — degraded mode can't be filtered into a blank feed.
- [ ] **Header singular/plural** — "1 member" vs "N members" stays correct after recompute (mirrors the existing header test).

## Test infrastructure

- Test framework: Node built-in runner (`node --test test/*.test.js`) for L3; Playwright for e2e.
- Concept Graph API: **not required** (no concept definitions touched).
- Firmware state: none.
- Fixtures: reuse `test/fixtures/golden-notes.js` for realistic scores; craft inline notes/scores for the
  multi-label and boundary cases (same style as `select-relevant.test.js`). e2e payloads are built inline in
  the spec.

## How to run

```
npm run test:unit            # L3 — node --test test/*.test.js
npx playwright test tests/feed-topic-channels.spec.js   # e2e (boots server.js on :3000)
npm test                     # both
```

## Verification

The new tests fail against the current code (no `channels`/`channelsAvailable` in the payload; no
`#feed-channels` banner; hashtag panel still titled "Topics"). Confirmed RED on 2026-06-24 at commit
`68905e3`:

```
# L3 unit — node --test test/feed-channels.test.js
ℹ tests 8
ℹ pass 0
ℹ fail 8
  (e.g. "note still has channels" → channels absent; channelsAvailable === undefined)

# e2e — npx playwright test tests/feed-topic-channels.spec.js
12 failed
  (banner #feed-channels never renders; hashtag panel title still "Topics (case sensitive)")
```

All failures are feature-absence, not assertion scaffolding — each names the missing contract element.
