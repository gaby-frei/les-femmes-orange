# Review: Story 7 — inline videos & extension-less Blossom media

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-07
**Diff:** `git diff HEAD~2..HEAD` (impl commit `ac004f7`, ADR `6ff01b4`)

## Quality gates (run by reviewer, not trusted)

- [x] `npm test` (unit) — **PASS** — `node --test test/*.test.js` → tests 39, pass 39, fail 0.
- [x] `npm run test:playwright` — **PASS** — 74 passed (incl. 18 Story 7 specs).
- [x] _Lint not configured — skipped._
- [x] _Typecheck not configured — skipped._
- [x] _Build not configured — skipped (JS-without-build)._

## Spec adherence
- [x] Every acceptance criterion has a passing test (coverage map in the test plan verified against the specs).
  - AC1 extension video embeds + URL stripped — helper + render tests ✓
  - AC2 extension-less Blossom **video** embeds via imeta — ✓ (the screenshot case)
  - AC2 extension-less Blossom **photo** embeds into the Story 3 grid via imeta — ✓
  - AC3 muted / controls / no-autoplay / click ≠ Primal — ✓
  - AC4 card body still opens Primal — ✓
  - AC5 image + video coexist, both stripped — ✓
  - AC6 non-media URL shortened (unchanged) — ✓
  - AC7 graceful degradation, both (a) no-imeta and (b) runtime load-error — ✓
  - AC8 unsafe scheme inert, no script — ✓
  - AC9 no video → no player — ✓
- [x] No criterion silently dropped.
- [x] No behavior added beyond the story (one-player cap enforced; extras → shortened links).

## ADR adherence
- [x] Files changed match ADR 0035's implementation notes: new pure `api/_lib/media.js`
  (`extractImetaMedia`), additive `note.media` in `buildFeedPayload` (`api/feed.js:73`),
  `parseNoteContent(content, media)` → `{ text, images, videos }` and the `<video>` block in
  `makeFeedNote` + CSS (`public/index.html`).
- [x] Layering respected: type resolution is server-side from imeta (the preferred authoritative
  source); the client only renders. `getFeed()` call shape unchanged; payload change is additive.
- [x] No new dependencies (pure JS on both sides).
- [x] imeta-only v1 scope honored — no `HEAD` content-type probe (correctly deferred; the story's
  Out-of-scope and ADR both record this).
- [x] Security posture preserved: `<video>`/fallback built via DOM, `src` via `safePicUrl` (http(s)
  only), fallback via `textContent`. No `innerHTML` of user-derived content anywhere in the diff.

**Documented deviation (accepted):** the player uses `preload="none"`; ADR 0035's implementation
note (line 149) hinted `preload="metadata"`. This is explicitly reconciled in the test plan
("Testability decision — clarifies the ADR's `preload` hint", lines 19–25): metadata preload would
`onerror`-remove the element under Playwright's Chromium (can't decode H.264) and flake the render
tests, and `preload="none"` is also the better default for off-screen feed videos (no fetch until
play). This is an improvement, documented at the same phase, not a silent drift — **not a blocker**.

## Concept-graph integrity
- [x] No concepts touched — purely feed rendering + payload enrichment. Concept Graph API was
  unreachable during planning/architecture; correctly recorded as "no handles."
- [x] **No firmware reinstall required** (no concept definitions changed) — matches ADR.

## Things tests can't catch
- [x] No secrets in the diff.
- [x] No leftover `console.log` / `debugger` / TODO in new source (grep clean).
- [x] No commented-out code.
- [x] Error paths handled: non-http(s) → shortened text; unparseable imeta → skipped; video load
  error → shortened link; missing/empty `tags` → `[]`; `note.media` absent → `parseNoteContent`
  defaults `media = []` (back-compatible with any caller passing one arg).
- [x] Concurrency: N/A — both helpers are pure and synchronous; no shared state.
- [x] Security: input validated at both boundaries (server `^https?://` + mime prefix; client
  `safePicUrl`). `javascript:`/`data:`/markup cannot become a player — verified by AC8 tests.

## House rules check
- [x] Concept Graph API authority respected (nothing to resolve; noted unreachable).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **`api/_lib/media.js:31`** — mime matching is case-sensitive (`mime.startsWith('video/')`).
   NIP-92 mimes are lowercase by convention so this is fine in practice; a future hardening could
   lowercase `mime` before the prefix test. Optional.
2. **`public/index.html` (parseNoteContent)** — imeta↔content matching is exact-string on the URL
   (as ADR 0035 specifies). An imeta attachment whose URL isn't also present in the note text won't
   render. Consistent with the ADR and the real-world notes (Primal writes the URL in both); noting
   only as a known boundary for the deferred follow-up.
3. **UX note (`preload="none"`)** — a genuinely dead video URL shows an empty player shell until the
   viewer presses play, at which point it degrades to a shortened link (rather than degrading at
   render time). This is the accepted tradeoff of lazy-loading and is covered by AC7b. No change asked.

## Verdict
**PASS** — All acceptance criteria are covered by passing tests; the implementation matches ADR 0035
(with one documented, phase-appropriate `preload` clarification); security and house-rule posture are
intact; no blocking findings. Ready for the deploy chain.
