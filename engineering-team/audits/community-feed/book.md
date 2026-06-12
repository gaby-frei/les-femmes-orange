# Book of Work: Native community-authored feed

**Slug:** community-feed
**Status:** Open
**Opened:** 2026-06-12

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below.

### Acceptance frame

- [ ] Signed-in verified members have a **Feed** view alongside Members and About, gated like the rest of the app.
- [ ] The feed shows recent kind-1 notes authored by **verified members** that carry a **Bitcoin- or Nostr-related hashtag**, sourced from **nos.lol**.
- [ ] The feed is curated to ~**100** notes: every qualifying member is **represented at least once**, **newer notes are favored**, and no single member dominates (soft per-member cap).
- [ ] Each note is a **non-interactive card** (display name, truncated npub, post time) that **opens the note in Primal** when clicked; the feed has no in-app zap/like/repost/reply/message controls.
- [ ] The feed handles **loading** and **empty** states gracefully.

## Epics in this book
- `community-feed` — a gated, read-only feed of verified members' Bitcoin/Nostr notes to give new members a feel for Nostr before onboarding to richer clients.

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at open:** high (v1 scope confirmed with user; relay + hashtag-only detection decided)

## Decided constraints (carried into Architecture)
- Content relay: **nos.lol only** (45/48 member coverage; see memory `project-community-feed-relay`).
- Topic detection: **hashtag-only** (`t` tags); specific hashtag list is an **open question**.
- v1 is a **single unified feed** (Bitcoin + Nostr together). Topic filter tabs deferred to **v2**.
- Membership = the app's existing verified-member computation (unchanged).

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/community-feed/audit.md`
- Product feedback: `engineering-team/audits/community-feed/prd-seed.md` (or `prd-addendum.md`)
