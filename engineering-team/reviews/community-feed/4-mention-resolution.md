# Review: Story 4 — @ mention resolution + shared member-metadata cache

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-15
**Diff:** `git show 902a4c8 -- public/index.html` (impl); ADR `fe3c629`, tests `75e088f`. Branch `feat/community-feed`.
**Story:** `engineering-team/stories/community-feed/4-mention-resolution.md`
**ADR:** `engineering-team/decisions/0031-feed-mention-resolution.md` (Accepted)
**Test plan:** `engineering-team/stories/community-feed/4-mention-resolution.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npx playwright test` — **46/46 passed** (33 `community-feed.spec.js` + 13 `local-signer.spec.js`). Ran by reviewer.
- [x] _Lint / typecheck / build — not configured (JS-without-build); skipped._
- [x] No regression: Stories 1 & 3 feed tests + local-signer suite all green.

## Spec adherence
- [x] **Every acceptance criterion has a passing test** (7 Story-4 tests).

| Criterion | Test | Status |
|---|---|---|
| AC1 member → @Name (npub / nprofile / bare) | unit `resolveMentions resolves member mentions…`; e2e `a member mention renders as @DisplayName…` | ✅ |
| AC2 non-member/unknown → short @npub; malformed never throws | unit `resolveMentions shortens unknown… leaves malformed unchanged`; e2e `a non-member mention renders as a shortened @npub handle` | ✅ |
| AC3 cold-load resolution (no Members visit) | e2e `member mentions resolve on a cold feed load…` (asserts empty members grid) | ✅ |
| AC4 no mentions unchanged | e2e guard `a note with no mentions is rendered unchanged` | ✅ |
| AC5 malformed/hostile inert | e2e guard `a malformed/hostile mention token renders inert…` | ✅ |

## ADR adherence
- [x] **`resolveMentions(text, names)`** (`public/index.html:1690`) — global, pure; regex
  `/(?:nostr:)?(n(?:pub|profile)1[02-9ac-hj-np-z]+)/gi`; decodes via `window._nostrDecode`
  (`npub`→`data`, `nprofile`→`data.pubkey`); member → `@name`, else → `@`+`hexToNpubShort`. Matches ADR step 3.
- [x] **Shared cache** (`:1874`) — `_metaCache` + `_metaFetched`; `fetchMetadata` fetches only `missing`,
  records **all** missing (hits **and** misses) so misses aren't re-queried, returns a Map of the
  requested pubkeys present in cache — **same signature/shape**, callers unchanged. Matches ADR step 1.
- [x] **`getFeed`** (`:2056`) — widened to `fetchMetadata(memberPubkeys)` (members ⊇ authors); emits
  `memberNames` (members-with-names only); `memberCount` **unchanged** (distinct-author). Matches ADR step 2.
- [x] **`makeFeedNote(note, memberNames = {})`** (`:2134`) resolves on the parsed text; `loadFeedPage`
  passes `feed.memberNames || {}` (`:2130`). Matches ADR steps 4–5.
- [x] **Additive contract:** `memberNames` optional everywhere it's consumed (`|| {}` / default `{}`) —
  Story 1/3 stubs (no `memberNames`, no mentions) stay green (verified 46/46).
- [x] No new dependencies, no concept changes → **no firmware reinstall**.

## Concept-graph integrity
- [x] N/A — no concept definitions touched. Concept Graph API unreachable; correctly not depended upon.

## Things tests can't catch
- [x] **Security — sound.** `resolveMentions` returns plain strings (`@name` / `@npub…` / the unchanged
  token); the result (`displayText`) is escaped via `escHtml` in the template (`:2160`), so a member
  display name containing HTML is inert. Decode is wrapped in **try/catch** → never throws; malformed
  tokens are returned unchanged. **Members-only by construction** — `names` (`memberNames`) only ever
  contains member pubkeys with a name; everyone else falls to the short handle. No non-member fetch.
- [x] **Cache correctness.** De-dupes across members page + feed; misses recorded; return shape
  identical to before. Newest-wins `_ts` preserved.
- [x] No secrets, no debug logging, no commented-out code (comments are intentional markers).

## House rules check
- [x] Concept Graph authority respected (nothing to define).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking (optional; do not gate this story)
1. **Concurrent-fetch redundancy** (`fetchMetadata`, `:1876`) — if `getFeed` and `loadMembersPage` run
   `fetchMetadata` *simultaneously* for overlapping uncached pubkeys, both compute `missing` before
   either marks `_metaFetched`, so the overlap is queried twice. Result is still correct (idempotent
   cache writes); only a rare redundant query. In practice the feed and members views don't load
   concurrently. Optional: mark `_metaFetched` before awaiting.
2. **Mention regex over-consume** (`:1691`) — the bech32 char-class `+` is greedy and unbounded; a
   mention immediately followed by more bech32-ish characters with no delimiter could over-match. Real
   mentions are whitespace/punctuation-delimited, so this is an unusual edge. Optional hardening later.
3. **Session-cache staleness (accepted)** — `_metaCache` lives for the session; a profile changed
   mid-session won't refresh. Per ADR, acceptable.
4. **Live-relay caveat (accepted)** — tests stub the `getFeed` payload / `fetchMetadata`, so resolution
   and the cache are proven in logic but not against live nos.lol member data. Recommend a
   live-browser / Vercel-preview check before deploy.

## Verdict
**PASS**

Story #4 meets every acceptance criterion with passing tests, conforms to ADR 0031 (resolveMentions
seam, shared cache, additive `memberNames` contract, members-only by construction), is XSS-safe
(escaped output, non-throwing decode), and keeps Stories 1/3 + local-signer green (46/46). Non-blocking
items are minor edge/efficiency notes. Ready for the deploy chain (live-preview look recommended).

After this, only **Story #2 (curated-selection)** remains open in the `community-feed` book.
