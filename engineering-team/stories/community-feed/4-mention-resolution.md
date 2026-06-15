# Story 4: Rich note rendering — @ mention resolution

**Status:** Approved
**Created:** 2026-06-15
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
Nostr mentions in note text currently render as the full npub, which reads as a wall of characters.
This story resolves mentions to readable handles. Sibling of **Story 3** (inline images); split out so
each stays a tight, separately-reviewable unit. Mention resolution has a data-layer wrinkle (see below)
that images do not, which is why they are separate.

## User-facing description
As a **member browsing the feed**, I want **@ mentions shown as usernames** (not full npubs), so that
notes referencing other people are readable.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given a note that mentions an **LFO member who has a display name**, in any supported form (`nostr:npub1…`, `nostr:nprofile1…`, or a bare `npub1…`), then the mention displays as **`@<member display name>`** (not the full npub).
- [ ] Given a note that mentions a **non-member**, or a member **without a resolvable display name**, then the mention displays as a **shortened `@npub1abc…wxyz` handle** (prefix + ellipsis + tail), not the full-length npub.
- [ ] Given the feed loaded **directly** (without first visiting the Members page), member mentions still resolve to names — resolution does not depend on navigation order.
- [ ] Given a note with **no** mentions, then rendering is unchanged (Story 3 images/links still behave as before).
- [ ] Given a **malformed or hostile** mention token (e.g. `nostr:npub1zzz…`, or HTML), then it is rendered as **inert text** — nothing crashes, no element is injected, no script runs.

## Concepts touched
Concept Graph API not reachable during planning. This story touches **no concept definitions**.
- **Verified LFO member set** — reused (unchanged) to decide which mentions resolve to a name (members) vs. shorten (everyone else).

## Out of scope
- **Inline images / link shortening** — Story 3 (this story extends the same content-parsing seam).
- **Fetching non-member profiles** to name them — non-members shorten to a handle (no extra relay fetch), per product decision.
- The deprecated **`#[index]` tag-reference** mention form, and `nevent`/`note` quote expansion.

## Open questions
- _(none open)_ — mention forms decided (`nostr:npub1…`, `nostr:nprofile1…`, bare `npub1…`).

## Decided constraints (for the Architect)
- **Members only** resolve to `@DisplayName`; non-members / no-name / unresolvable → shortened `@npub1abc…wxyz`. **No non-member relay fetch.**
- **Enabling change — shared member-metadata cache (Option B):** introduce a module-level member-metadata map, populated once via `fetchMetadata`, **reused** by the Members page (`loadMembersPage` ~`:1987`), the feed cards (`getFeed` ~`:2034`), **and** mention resolution. This guarantees member names are available regardless of navigation order **and de-duplicates** today's separate, redundant member/author fetches. This is the core architectural move — design it in the ADR.
- **Mention forms:** `nostr:npub1…`, `nostr:nprofile1…`, bare `npub1…`. Decode via the existing `window._nostrDecode` (`nip19.decode`, `:1425`). Skip legacy `#[index]`.
- **Security:** resolved `@handles` are escaped text (`escHtml`) like all other content; malformed/undecodable tokens must not throw — leave them shortened or as inert text.
- Builds on Story 3's `parseNoteContent()` seam + Story 1's `makeFeedNote()` / `getFeed()` in `public/index.html`.

## Linked artifacts
- ADR: `engineering-team/decisions/0031-feed-mention-resolution.md`
- Test plan: `engineering-team/stories/community-feed/4-mention-resolution.test-plan.md`
- Tests: `tests/community-feed.spec.js` (Story 4 describe blocks)
- Review: (filled in after Review phase)
