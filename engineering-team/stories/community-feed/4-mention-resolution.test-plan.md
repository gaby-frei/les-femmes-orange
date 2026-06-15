# Test Plan: Story 4 — @ mention resolution

**Story:** `engineering-team/stories/community-feed/4-mention-resolution.md`
**ADR:** `engineering-team/decisions/0031-feed-mention-resolution.md`
**Date:** 2026-06-15

## Approach

Tests added to `tests/community-feed.spec.js` (Playwright), two layers:

1. **Unit** — call the new global `window.resolveMentions(text, names)` directly and assert the
   rewritten string. `names` is `{ pubkeyHex: displayName }`. Real mention strings are built with
   `nip19.npubEncode(hex)` / `nip19.nprofileEncode({pubkey:hex})` (nostr-tools is already imported)
   from the existing test pubkeys `A`, `B`, `Z`.
2. **Render** — `openFeedWith(page, payload)` stubs `window.getFeed`; the payload carries the new
   `memberNames` field. Assertions are on the rendered `.feed-note-excerpt`.

**Why render tests prove cold-load (AC3):** `openFeedWith` navigates straight to the feed
(`goto('/') → showView('feed')`) and **never visits Members**, so resolution can only come from the
`getFeed` payload's `memberNames`. The AC3 test additionally asserts the Members grid is empty
(`loadMembersPage` never ran).

**Seam/contract (ADR 0031):** `resolveMentions(text, names)` global+pure; `getFeed` returns
`{ memberCount, notes, memberNames }` (additive, optional); `makeFeedNote(note, memberNames={})`
resolves on the parsed text; `loadFeedPage` passes `feed.memberNames`. Non-member/unknown → `@` +
`hexToNpubShort(pk)`; malformed tokens left unchanged (decode in try/catch, never throws).

## Coverage map

| Criterion | Test | Level |
|---|---|---|
| AC1 member → @Name (npub / nprofile / bare forms) | `resolveMentions resolves member mentions (npub, nprofile, bare) to @DisplayName` | unit |
| AC1 member → @Name (rendered) | `a member mention renders as @DisplayName from the feed payload` | e2e |
| AC2 non-member/unknown → short @npub; malformed never throws | `resolveMentions shortens unknown mentions to @npub… and leaves malformed tokens unchanged` | unit |
| AC2 non-member → short @npub (rendered) | `a non-member mention renders as a shortened @npub handle` | e2e |
| AC3 cold-load resolution (no Members visit) | `member mentions resolve on a cold feed load (no Members visit)` | e2e |
| AC4 no mentions unchanged (guard) | `a note with no mentions is rendered unchanged` | e2e |
| AC5 hostile/malformed inert (guard) | `a malformed/hostile mention token renders inert — no script, no injection` | e2e |

## Edge cases
- [x] All three mention forms: `nostr:npub1…`, `nostr:nprofile1…`, bare `npub1…` (unit AC1).
- [x] Member **without** a name → treated as unknown → short handle (covered by the non-member path; `memberNames` simply lacks the key).
- [x] Malformed `npub1zzz` → token left unchanged, no throw (unit AC2 + render AC5).
- [x] HTML in content (`<b>…</b>`) → escaped inert text, no injected element (AC5).
- [x] Cold load — no Members page visited (AC3 asserts empty members grid).
- [x] `memberNames` absent from payload (Story 1/3 stubs) → mentions just shorten; existing tests stay green.

## Test infrastructure
- Playwright; `openFeedWith` + `NOTE` (existing); `nip19` (existing import).
- New local helpers: `npubOf(hex)`, `nprofileOf(hex)`.
- `page.on('dialog', …)` guards the security test.

## How to run
```
npx playwright test tests/community-feed.spec.js
```

## Verification
Confirmed 2026-06-15 at commit `fe3c629`. Of the 7 new tests, **5 fail** for the right reasons and
**2 are preservation guards** that pass now and must stay green:

```
$ npx playwright test tests/community-feed.spec.js
  5 failed, 28 passed

Failing (need new behavior):
- "resolveMentions must be a global" (×2 unit)
- render: excerpt shows the raw npub, not "@Bob" / "@npub1…" (×3: member, non-member, cold-load)

Passing guards (must stay green):
- AC4 "a note with no mentions is rendered unchanged"
- AC5 "malformed/hostile mention token renders inert" (escaped HTML, npub1zzz left as-is, no dialog)
```

No regression: the 26 existing feed tests and 13 local-signer tests are unaffected (28 = 26 + 2 guards).
