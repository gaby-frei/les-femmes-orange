# Story 1: Feed view — gated community feed of Bitcoin/Nostr notes

**Status:** Done
**Created:** 2026-06-12
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
LFO gates access behind a web-of-trust membership list but, once inside, gives members no window
into what the community is saying on Nostr. This story adds the **first, read-only version** of a
native Feed: a gated view that surfaces recent kind-1 notes authored by verified members on
Bitcoin/Nostr topics. Its purpose is onboarding — letting newcomers feel the community's presence
before adopting a full Nostr client. This story delivers the **feed view and its display**; the
curation policy (representation floor + per-member cap + recency fill) is **Story 2** and operates
within the 100-note set established here.

## User-facing description
As a **signed-in verified member**, I want a **Feed** of recent notes from other verified members
about Bitcoin and Nostr, so that I can **get a feel for the community's voice on Nostr** and have a
reason to explore further.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given a signed-in **verified member**, when they use the app, then a **Feed** navigation option is available alongside Members and About, and selecting it shows the feed view.
- [ ] Given a **signed-out visitor or non-member**, when they load the app, then the Feed view/content is **not accessible** (same gating as the rest of the members area).
- [ ] Given the feed loads, then it shows **only** kind-1 notes that are **(a)** authored by a verified member **and (b)** carry a qualifying Bitcoin/Nostr hashtag; notes from non-members, and member notes without a qualifying hashtag, **do not appear**.
- [ ] Given more than 100 qualifying notes exist, when the feed loads, then **at most 100** notes are shown, ordered **newest-first** (descending post time). _(Selection within the 100 is refined in Story 2; here it is simply the newest 100.)_
- [ ] Given a displayed note, then its card shows the author's **display name** (falling back to a **truncated npub** when no profile name is available), a **truncated npub**, and the **post time**.
- [ ] Given a displayed note, then its card shows the author's **profile image** in the top-right; when the author has no usable picture, an **initials fallback** is shown instead (never a broken image).
- [ ] Given a displayed note, then its card shows the note's **full text content** as plain text (no length limit / no truncation). Images/embeds/mention resolution are not rendered (out of scope).
- [ ] Given a displayed note, when the user clicks it, then **that specific note opens in Primal** in a new browser tab; and the feed presents **no** zap / like / repost / reply / message controls anywhere.
- [ ] Given the feed is loaded, then a **header** shows the title **"What LFO members are saying…"** and a subtitle with the count of **distinct members represented**, phrased **"X members contributing across the latest 100 posts"** (X = number of distinct authors whose notes appear). _(Header copy amended 2026-06-15.)_
- [ ] Given the feed is **loading**, then a loading indicator is shown; and given the query returns **no** qualifying notes, then an **empty-state message** is shown (not a blank screen).
- [ ] Given the feed view, then a **"Feed Source Relays"** side panel lists the relay(s) the feed is sourced from (v1: `nos.lol`).
- [ ] Given the feed view, then a side panel ("Topics") lists the **query hashtags** the feed filters on (the qualifying `t` tags) and notes that matching is **case-sensitive**.

## Concepts touched
Concept Graph API (`http://localhost:8877`) was **not reachable** during planning — concepts named in plain language; the Architect should resolve handles.

- **Verified LFO member set** — the app's existing membership computation (closure over kind-9999/39999 LFO tag items, `#e` = LFO concept, `#z` = `nostr-user-tag`). The feed's author allow-list. Not modified by this story.
- **Nostr kind-1 text note** — the content unit displayed.
- **Topic hashtag (`t` tag)** — the qualifying signal for inclusion (specific list is an open question).

## Out of scope
- **Topic filter tabs** (Bitcoin vs Nostr). v1 is one unified feed; per-topic views are **v2**.
- **Curated selection** (representation floor, soft per-member cap ~10, recency fill) — **Story 2**.
- Any **write / interaction** (zap, like, repost, reply, follow) — the feed is read-only.
- **Relays other than nos.lol** for feed content.
- Rich note rendering (inline images, embeds, mention/nevent resolution) — note text stays plain. _(Author profile images on cards ARE in scope — see acceptance criteria.)_
- Editable relay/hashtag config from the side panels — the panels are **read-only/informational** for v1.

## Open questions
- _(none open)_ — hashtag matching is **case-sensitive** (relay `#t` behavior); case variants are listed explicitly (e.g. `lfo` and `LFO`) and the Topics panel surfaces "(case sensitive)".

## Decided constraints (for the Architect)
- Content relay: **nos.lol only**.
- Topic detection: **hashtag-only** (`t` tags). **Qualifying hashtag list (v1):** `nostr`, `asknostr`, `grownostr`, `bitcoin`, `btc`, `lightning`, `sats`, `lfo`, `LFO`, `lesfemmesorange`. Matching is **case-sensitive**, so case variants are listed explicitly. A note qualifies if it carries **any** of these as a `t` tag.
- Feed size cap: **100**.
- Membership computation: reuse the app's existing logic unchanged.

## Linked artifacts
- ADR: `engineering-team/decisions/0029-community-feed-view.md`
- Test plan: `engineering-team/stories/community-feed/1-feed-view.test-plan.md`
- Tests: `tests/community-feed.spec.js`
- Review: `engineering-team/reviews/community-feed/1-feed-view.md` — **PASS** (2026-06-14)
