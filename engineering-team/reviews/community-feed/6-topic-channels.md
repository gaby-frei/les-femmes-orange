# Review: Story 6 — Topic channels

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-24
**Diff:** `git diff main...feat/community-feed` — implementation commit `789cf03` (`api/feed.js`, `public/index.html`)

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:unit` — **PASS** (27/27, incl. 8 new in `test/feed-channels.test.js`).
- [x] `npm test` (full, unit + Playwright) — **PASS** (27 unit + 56 e2e) post-implementation, no code change since; incl. 12 new in `tests/feed-topic-channels.spec.js` and the unchanged Story 1/3/4 specs (header + hashtag-panel regressions clear).
- [x] _Lint not configured — skipped (per CLAUDE.md, JS-without-build)._
- [x] _Typecheck / Build not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test (AC-1…AC-12 mapped in the test plan; all green).
- [~] **AC-9 partially met** — see Blocking finding #1. The "no AI key configured" trigger disables the pills; the "classifier configured but unavailable/erroring" trigger (the other half of AC-9's "classifier … could not be read") does **not**.
- [x] No behavior added beyond the story (no selection persistence, no new channels, no ranking change).

## ADR adherence
- [x] Option B implemented as designed: server tags each note with `channels` from the **same** `threshold`; client filters the fetched feed in memory (no re-fetch on toggle). Threshold stays single-sourced server-side; the client never sees `T`.
- [x] `select.js` untouched; channel tagging layered on already-selected notes (`api/feed.js:56-68`).
- [x] `loadFeedPage()` refactored into a reusable `renderFeedNotes()`; `#feed-channels` banner, `aria-pressed` toggle state, native `disabled`, `data-note-id`, and the "Topics → Source Hashtags" rename all per the ADR's implementation notes.
- [~] **Deviation:** the ADR specifies `channelsAvailable` be `false` "when classification could not produce real scores … **the same condition that triggers the `PASS_THROUGH` fallback**" (ADR §Decision, and impl note: "anthropic client absent, **or all results were `PASS_THROUGH` / KV unreadable**"). The implementation derives it solely from `anthropic != null` (`api/feed.js:159`), which detects *missing key* but not *runtime fallback*. See Blocking #1.
- [x] No new dependencies.

## Concept-graph integrity
- [x] No concept definitions touched; `channels`/`channelsAvailable` are payload fields, not concepts. No firmware reinstall required (matches ADR). N/A otherwise.

## Things tests can't catch
- [x] No secrets committed; `classifierAvailable: anthropic != null` reads the env-derived client, doesn't expose the key.
- [x] No debug logging, no commented-out code, no leftover scaffolding.
- [x] Security: channel values are used only for `Set` membership and class/attr toggling; no `innerHTML` of untrusted data introduced. `data-channel` is static. Note rendering path unchanged. No new injection vector.
- [x] Idempotency: `btn.onclick` is reassigned (not `addEventListener`) on each `setupChannelBanner`, so repeated loads don't stack handlers. `_selectedChannels.clear()` on every load gives a deterministic unfiltered start.
- [x] No concurrency concern (synchronous client re-render; single fetch).

## House rules check
- [x] No new lint/typecheck/build tooling. Concept-graph authority N/A (API was down; no concepts changed).

## Findings

### Blocking
1. **`api/feed.js:159`** — `classifierAvailable: anthropic != null` only covers AC-9's "no AI key" case. When the classifier **is** configured but **errors at call time**, `classifyOne`'s catch returns `PASS_THROUGH = {1,1,1}` per note (`api/_lib/classify.js:31`), so every note is tagged with all three channels while `channelsAvailable` stays `true`. Result: the pills stay **enabled but non-functional** (any single-channel selection still shows everything) — exactly the "offers a filter it cannot apply" outcome AC-9 forbids, and the precise condition the ADR said should flip the flag to `false`.
   **Asked change:** set `channelsAvailable` from whether real scores were produced — i.e. detect the all-`PASS_THROUGH` outcome (the ADR's suggested signal) in `buildFeedPayload`, or have `classifyNotes` report degradation — so a configured-but-failing classifier also disables the pills. (KV *read* failure currently throws up to the handler's 500 path → empty feed + client error banner; that's a separate, already-graceful path and is not the gap here.)

### Non-blocking
1. **`public/index.html` (filtered-empty branch of `renderFeedNotes`)** — a channel selection matching zero notes reuses the Story 1 empty-state copy *"No notes to show yet — check back soon as members post about Bitcoin and Nostr."* When other channels do have notes, that reads as "the feed is empty" rather than "this filter matched nothing." AC-8 only requires *an* empty-state, so non-blocking. Optional: a filter-aware message (e.g. "No posts in the selected channel(s).").
2. **`public/index.html` (header wording)** — unfiltered shows "across the latest 100 posts" (Story 1 wording retained to avoid regressions) while filtered shows "across N posts". Cosmetic asymmetry; both are truthful. Acceptable as-is.

## Verdict
**CHANGES_REQUESTED** — one blocking item (AC-9 degradation only half-honored, deviating from the ADR's stated `channelsAvailable` condition). Everything else — all 12 ACs' happy paths, ADR Option-B structure, tests, security, regressions — is solid.

_Note for the gate: the ADR's "Consequences" already labels `channelsAvailable` as coarse, deferred debt. If the team chooses to accept the runtime-fallback case as **documented debt** for this story rather than fix it now, that is a legitimate call by the owner — in which case this verdict converts to **PASS** with a tracked follow-up. The fix is small, so my recommendation is to do it now._
