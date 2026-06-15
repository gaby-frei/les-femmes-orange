# Story 4: Rich note rendering — @ mention resolution

**Status:** Draft (planned — execute after Story 3)
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

- [ ] Given a note that mentions an **LFO member**, then the mention displays as **`@<member display name>`** (not the full npub).
- [ ] Given a note that mentions a **non-member or unresolvable** pubkey, then the mention displays as a **shortened `@npub1…` handle** (not the full-length npub).
- [ ] Given a note with no mentions, then rendering is unchanged.
- [ ] Given a malformed or hostile mention token, then it is rendered as **inert text** — no element injected, no script runs.

## Concepts touched
- **Verified LFO member set** — reused to decide which mentions resolve to a name (members) vs. truncate (everyone else). Not modified.

## Out of scope
- **Inline images** — Story 3.
- **Fetching non-member profiles** to name them — non-members truncate to a short handle (no extra relay fetch), per product decision.
- `nevent`/`note` quote expansion.

## Open questions
- Exact set of mention forms to support: `nostr:npub1…`, `nostr:nprofile1…`, and bare `npub1…` — Architect to confirm against real note content.

## Decided constraints (for the Architect)
- **Members only** resolve to `@DisplayName`; non-members/unresolvable → shortened `@npub1…` handle. **No non-member relay fetch.**
- Resolving member mentions may require member display names beyond just the note authors (bounded to the ~45-member set) — likely a small change to how `getFeed()` assembles member metadata. Flag in the ADR.
- Builds on Story 1's `makeFeedNote()` / `getFeed()` in `public/index.html`.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
