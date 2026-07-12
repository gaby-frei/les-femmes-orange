# Story 10: Feed header semantics — the "active content taggers" line

**Status:** Draft
**Created:** 2026-07-12
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`
**Origin:** the one piece of superseded story #2 (its Open question 9) kept in this epic (PO
decision 2026-07-12).

## Background
Since #8, the feed header's subtitle — "X members contributing across the latest Y posts" — counts
**distinct authors of displayed notes, unfiltered**, so a non-member author of a member-tagged note
inflates it. That was a deliberate, documented interim. The PO decision (2026-07-12) resolves the
question **additively**: the existing copy and its semantics stay exactly as they are, and the
header gains a **second line surfacing tagging activity** — the community's curation work becomes
visible where before it was silent.

Today the payload carries per-note tag *metadata* (`taggedWith`) and per-(provider, tag) application
*counts* (server-internal `vias`), but not tagger *identities* — distinct-tagger counting across an
arbitrary client-side channel selection needs the appliers' pubkeys per note. Exposing them is a
payload extension for the Architect to shape (they are already-public relay data; no new
information is disclosed).

## User-facing description
As a **signed-in verified member**, beneath "X members contributing across the latest Y posts" I
want a line reading **"Z active content taggers"** — the number of distinct members whose tag
applications put or kept notes in what I'm currently looking at — updating live as I toggle
channels, so the community's active curation is visible alongside its posting.

## Decided semantics (PO, 2026-07-12)
- **Copy:** a second subtitle line, `Z active content tagger${Z === 1 ? '' : 's'}`. The existing
  members/posts line is **unchanged** in copy and semantics (status quo explicitly ratified — the
  unfiltered author count, non-members included, stands).
- **Z = distinct APPLIER pubkeys over the displayed pool.** A tagger counts if they applied ≥ 1
  qualifying tag to ≥ 1 currently-displayed note. Deduped across tags and notes (three tags on five
  notes by one member = 1). **Disputers never count** — a dispute is not endorsement and is
  surfaced nowhere else in the feed.
- **Scoped to the *visible* notes, live.** Recomputed client-side on every channel toggle from the
  already-fetched pool — no re-fetch — consistent with #6's filtering model. With no channel
  selected, the scope is the whole displayed pool.
- **Always rendered, including zero.** "0 active content taggers" shows when the visible pool has
  no tagged notes (e.g. a hashtag-only channel view, or Provider-2 degradation). Uniform layout
  over hiding.
- Taggers are verified members by pipeline construction (the #8 trust gate); the client trusts the
  payload and does no membership re-check.

## Acceptance criteria
Testable from the outside; unit via `buildFeedPayload(deps)` fakes, browser behavior via Playwright
with the stubbed-`getFeed` pattern.

**Payload**
- [ ] Given a note admitted by Provider 2, then the payload note carries the **distinct applier
  pubkeys** behind its admission (shape = Architect's; additive — top-level payload contract and
  all existing note fields unchanged; pre-#10 clients render unchanged).
- [ ] Given a note whose taggings include applies and disputes, then only **appliers** appear.
- [ ] Given a Provider-1-only note, then it contributes no tagger identities.

**Header line**
- [ ] Given the feed view with tagged notes displayed, then a second subtitle line reads
  "Z active content taggers" with Z = distinct appliers across the **visible** notes.
- [ ] Given one member applied several tags across several visible notes, then they count **once**.
- [ ] Given a channel is toggled, then Z updates immediately from the fetched pool (no re-fetch):
  e.g. selecting a channel whose visible notes carry no taggings shows **"0 active content
  taggers"**; selecting Ask LFO shows the appliers of the visible ask-lfo notes.
- [ ] Given Z = 1, the copy is singular ("1 active content tagger").
- [ ] Given zero visible tagged notes (including Provider-2 degradation), the line renders with 0 —
  it is never hidden.
- [ ] Given the existing first line, its copy and numbers behave **exactly as before** (unfiltered:
  server `memberCount` over the whole pool; filtered: recomputed over the visible subset — the #6
  behavior, untouched).

## Out of scope
- Changing the members/posts line's counting or copy (explicitly ratified as-is).
- Ranking on tagger counts, endorsement scores, or any ordering change — `curation-policy` epic.
- Displaying tagger names/avatars (identities ride the payload for counting; rendering who they
  are is future/#curation territory).
- Any write path.

## Open questions
None — semantics fully decided 2026-07-12 (zero-state: always render; appliers only, deduped).

## Linked artifacts
- ADR: `engineering-team/decisions/0038-feed-header-taggers.md` (Accepted 2026-07-12)
- Test plan: (after Test Design)
- Review: (after Review)
- Superseded story #2 (`2-curated-selection.md`) — origin of Open question 9
- ADR 0036/0037 — the provider pipeline whose applier data this story surfaces
