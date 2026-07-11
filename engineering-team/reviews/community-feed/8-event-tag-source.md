# Review: Story 8 — Event-tag source (Provider 2) + tag pill

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-11
**Diff:** `git diff 28ec8d5..HEAD` (implementation commits `b11eabf`, `70460c0`; base = test-design commit)
**Story:** `engineering-team/stories/community-feed/8-event-tag-source.md` (amended 2026-07-11: tag-pill UI)
**ADR:** `engineering-team/decisions/0036-feed-event-tag-source.md` (amended 2026-07-11: pill; Decision 3 revised 2026-07-11)
**Test plan:** `engineering-team/stories/community-feed/8-event-tag-source.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **85/85 pass** (39 pre-existing + 46 story-8; run independently by reviewer)
- [x] `npm test` (incl. Playwright) — **80/80 pass**, including all 6 `tests/feed-tag-pill.spec.js`
- [x] Live smoke (reviewer re-ran the Implementer's script shape during phase; result recorded in test
  plan): all **10** live `lfo-community` notes source with correct provenance + `taggedWith` — including
  the screenshot note `26c603d5…`
- [x] _Lint / typecheck / build not configured — skipped (house rule: intentionally JS-without-build)._

## Spec adherence

- [x] Every acceptance criterion maps to a passing test (coverage map in the test plan: S1–S7, UI-1–5,
  R1–R3, M1–M2, X1–X3, D1–D3). D3's one-line handler wiring (`relayStatus` append,
  `api/feed.js:239`) is seam-tested via `relayOk` and documented for preview verification — the
  ADR-0033 precedent for handler-only lines.
- [x] No criterion silently dropped. The two deliberate constraints an implementer might "fix" are
  honored: `memberCount` counts non-member Provider-2 authors (`test/feed-event-tag.test.js` X3), and
  no tagging-data caching exists anywhere in the diff (only the TA pubkey, per story).
- [x] No behavior beyond the story. The one mid-phase design change — note bodies from tagging relay ∪
  nos.lol + damus — was PO-directed 2026-07-11 after live evidence (0/10 bodies on the tagging relay),
  and is recorded in both the story (step 4 correction) and the ADR (Decision 3 revision). Not drift:
  a ratified revision.

## ADR adherence

- [x] Files match the ADR's implementation notes exactly: `api/_lib/event-tagging/{handles,filters,classify}.js`
  + `PROVENANCE.md`, `api/_lib/ta.js`, `api/_lib/tagged.js`, `api/_lib/merge.js`, `api/feed.js`,
  `public/index.html`.
- [x] **Vendored files verified byte-identical** to `tapestry/src/lib/event-tagging/` @ `42596656`
  (`diff -q`: all three identical). PROVENANCE.md records repo/branch/commit/date/refresh procedure.
- [x] Layering respected: `tagged.js` is pure-with-injected-deps; `merge.js` and vendored `classify.js`
  are pure; `buildFeedPayload` stays the orchestrator; handler wires real deps.
- [x] No new dependencies (`package.json` untouched).
- [x] **No hardcoded TA pubkey** anywhere in `api/` or `public/` (grep clean for `a68dbf56`). The only
  pinned pubkey is `EVENT_TAG.authorPubkey` (`api/feed.js:43`) — the tag's own identity, which the
  story's pilot-parameters table fixes deliberately.
- [x] Amendment conformance: tag-element fetched in step-1's parallel round trip
  (`api/_lib/tagged.js:53–59`), latest-`created_at` wins, slug fallback, metadata not pipeline-critical;
  `taggedWith` unioned by name in merge; payload emits it only when non-empty.

## Concept-graph integrity

- [x] All handles composed as `kind:pubkey:slug` via the vendored `handles.js` composers; TA is always
  a runtime parameter.
- [x] No concept definitions changed → **no firmware reinstall** (per ADR).
- [x] Concept handles were verified against the live deployment's Concept Graph API during Architecture
  (LFO has no local stack; `tags.brainstorm.world` is the relevant instance).

## Things tests can't catch

- [x] No secrets committed; no `console.log`/debug residue in the new server modules (grep clean).
- [x] No commented-out code.
- [x] Error paths: `tagged.js` never throws (whole-body catch → `{ candidates: [], relayOk: false }`);
  `buildFeedPayload` additionally catches a throwing/malformed Provider-2 dep (defense in depth,
  pinned by test); TA fetch failure short-circuits with **zero relay queries** (pinned by test).
- [x] XSS discipline: pill name/description are relay-sourced strings and enter the DOM exclusively via
  `textContent`/`setAttribute` (`public/index.html:2337–2371`) — never `innerHTML`. Card-link isolation
  via `stopPropagation` on the row, matching the video-player pattern.
- [x] Concurrency: providers run under `Promise.all` with independent failure domains. `ta.js`'s
  module-level cache has a benign first-call race (two concurrent cold calls both fetch, cache the same
  value) — noted, not blocking.

## House rules check

- [x] Concept Graph API authority respected; no BIBLE.md re-derivation in code.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`api/feed.js:216`** — the `map` callback parameter `r` in `FEED_RELAYS.map((r) => r.url)` shadows
   the enclosing `const r` (the Provider-2 result). Scoping is correct (no TDZ read), but renaming one
   of them would aid readability.
2. **`api/_lib/tagged.js:69`** — the malformed-header guard `!c.endsWith(':null')` is stringly-typed;
   filtering on `tagVal(h,'d') != null` before composing the coordinate would say what it means.
3. **`public/index.html:2357`** — the pill sets `aria-expanded` but not `aria-controls`/`id` linking it
   to its description panel. The accessible name + expanded state satisfy the story's a11y AC; the
   linkage would be a polish improvement.
4. **`api/_lib/ta.js:15`** — benign double-fetch race on concurrent cold starts (see above). A shared
   in-flight promise would eliminate it if it ever matters.

## Verdict

**PASS.** The diff matches the story (as amended), the ADR (as amended and revised), and the test
plan; all 165 tests pass under the reviewer's own runs; vendoring is verbatim and provenanced; the
runtime-TA rule and the app's read-only posture are intact; the live pipeline delivers all 10
production tagged notes end-to-end.
