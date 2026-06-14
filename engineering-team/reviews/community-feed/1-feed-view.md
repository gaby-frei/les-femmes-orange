# Review: Story 1 — Feed view (community feed of Bitcoin/Nostr notes)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-14
**Diff:** `git diff main...HEAD` (commit `9cc09dd`, epic `community-feed`)
**Story:** `engineering-team/stories/community-feed/1-feed-view.md`
**ADR:** `engineering-team/decisions/0029-community-feed-view.md` (Accepted)
**Test plan:** `engineering-team/stories/community-feed/1-feed-view.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `npm run test:playwright` — **31/31 passed** (18 `community-feed.spec.js` + 13 `local-signer.spec.js`). Ran by reviewer.
- [x] _Lint not configured — skipped (per CLAUDE.md, JS-without-build)._
- [x] _Typecheck not configured — skipped._
- [x] _Build not configured — skipped (static `public/index.html`)._
- [x] No regression: the pre-existing local-signer suite still passes (13/13).

## Spec adherence
- [x] **Every acceptance criterion has a passing test.** Mapped below.
- [x] No criterion silently dropped.
- [x] No behavior added beyond the story (the scope additions — avatars, side panels, `#LFO`/`#lesfemmesorange`, no-280-limit, case-sensitive label — were each folded back into the story ACs + ADR + tests before implementation, not bolted on).

| Acceptance criterion | Test(s) | Status |
|---|---|---|
| Verified member gets Feed nav + can open it | `a verified member sees a Feed nav option and can open the feed` | ✅ |
| Signed-out / non-member cannot access | `a signed-out visitor…`, `a non-member…` (assert `#nav-feed-li` exists + hidden) | ✅ |
| Only member + qualifying-hashtag kind-1 (exclusions) | `getFeed queries nos.lol … restricted to verified members and the qualifying hashtags` (asserts the relay filter) | ✅ |
| ≤100, newest-first | `getFeed returns at most 100 notes, newest-first` | ✅ |
| Name (→npub fallback) / npub / time | `getFeed resolves the display name…`, `a feed card shows the display name, truncated npub, and post time` | ✅ |
| Full note text, no limit | `note text is shown in full, with no length limit or ellipsis` | ✅ |
| Open in Primal; no interaction controls | `clicking a note opens it in Primal … with no interaction controls present` | ✅ |
| Header "X members contributing…" (singular/plural) | `the header reads "X members contributing to the discussion"` | ✅ |
| Loading + empty states | `a loading indicator…`, `an empty feed shows an empty-state message` | ✅ |
| Avatar top-right + initials fallback | `getFeed includes a sanitized author.picture…`, `a feed card shows the author profile image…` | ✅ |
| "Feed Source Relays" panel | `a "Feed Source Relays" panel lists the feed relay` | ✅ |
| Topics panel lists hashtags + case-sensitive note | `a panel lists the query hashtags…`, `the Topics panel notes that hashtags are case sensitive` | ✅ |

## ADR adherence
- [x] Files changed match the ADR's implementation notes — all changes additive, in `public/index.html`; the working membership path is untouched.
- [x] **Layering respected.** `getFeed()` (`:1979`) is the data-layer boundary returning the exact ADR contract shape `{ memberCount, notes:[{id,pubkey,created_at,content,author:{displayName,npubShort,picture}}] }`; `loadFeedPage()` (`:2024`) is render-only and source-agnostic; `makeFeedNote(note)` (`:2065`) consumes the contract shape. The Story-2 `select` seam comment (`:1990`) and the `// PLANNED: replace … fetch('/api/feed')` migration note (`:1977`) are present as designed.
- [x] **No new dependencies.** Reuses `queryRelay`, `getTagItems`/`buildMemberSets`, `fetchMetadata`, `hexToNpubShort`, `getInitials`, `escHtml`, `safePicUrl`; adds only `window._nostrNoteEncode` (one nip19 export) per the ADR.
- [x] Feed content sourced from `nos.lol` only (`FEED_RELAY`, `:1479`); membership still uses the 4-relay set — the intended distinction.
- [x] Case-sensitivity handled as the (revised) ADR resolution: explicit case variants in `FEED_HASHTAGS` + a UI "(case sensitive)" note.

## Concept-graph integrity
- [x] N/A — read-only consumer of kind-1 notes; no concept definitions touched. **No firmware reinstall required** (ADR confirms). Concept Graph API was unreachable during the cycle; correctly not depended upon.

## Things tests can't catch
- [x] No secrets committed.
- [x] No leftover debug logging / `console.log` in the feed code.
- [x] No commented-out code (the `//` comments present are intentional design markers — Story-2 seam, PLANNED migration).
- [x] **Error paths handled:** `getFeed()` failure is caught in `loadFeedPage()` (`:2037`) → loading hidden, message shown (no unhandled rejection / blank screen). Empty result handled distinctly.
- [x] Concurrency: feed loads once per session (`_feedLoaded` guard, `:1528`); no races introduced.
- [x] **Security / injection:** all interpolated strings escaped via `escHtml` (display name, npub, content, time, initials, relay host, hashtags); `safePicUrl` restricts avatar `src` to http(s); `window.open(..., 'noopener')`. No obvious XSS vector. Avatar `<img>` is injected via DOM with `onerror` removal (mirrors `makeMemberCard`) — never a broken image.

## House rules check
- [x] Concept Graph authority respected (nothing to define here).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking (optional, do not gate this story)
1. **`public/index.html:2040`** — On a `getFeed()` error, `#feed-empty`'s `textContent` is overwritten with the error message and not reset to the default empty-state copy. Harmless in practice because `loadFeedPage()` runs once per session (`_feedLoaded` guard), but if a manual refresh is added later (an out-of-scope item), the stale error text could persist. Optional: keep error vs. empty as separate elements/strings.
2. **`makeFeedNote` initials fallback (`:2073`)** — For authors with no kind-0 name, `getInitials()` runs on the truncated npub, yielding "NP". Cosmetic only; consider a neutral glyph for nameless authors in a future polish.
3. **Live-network coverage (accepted):** the suite stubs all relay seams, so it proves feed *logic*, not live nos.lol behavior. Per the test plan this is intentional; the **user has manually verified the feed in a browser**. Recommend a `/verify` or live look remain part of the pre-deploy step. Not a defect.
4. **Redundant cap:** `getFeed` requests `limit: 100` *and* client-side `slice(0, 100)` (`:1990`). Defensive and explicitly noted in the ADR; becomes meaningful in Story 2 when the fetch widens. No action.

## Verdict
**PASS**

Story 1 meets every acceptance criterion with passing tests, conforms to ADR 0029 (including the backend-ready `getFeed()` boundary and the Story-2 seam), introduces no new dependencies or concept changes, and the full suite is green (31/31). The non-blocking items are minor polish for future stories. Ready for the deploy chain.
