# Story 6: Topic channels — filterable topic pills on the Feed

**Status:** Draft
**Created:** 2026-06-24
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
The v1 feed is a single **unified** stream of Bitcoin- and Nostr-hashtagged member notes. From the
start (ADR 0029, Story 1) the plan deferred **per-topic views** to v2, and Story 5 deliberately
persisted **three per-topic relevance scores** `{ bitcoin, nostr, lfo } ∈ [0,1]` per note — built as
the reusable signal these views would consume. This story is that v2 feature, named **topic channels**.

It lets a member narrow the feed to the topic(s) they care about without changing what's eligible:
the same curated pool, viewed through a topic lens. The per-note scores already exist, so this story
is about **surfacing a selectable filter** and applying it to the displayed notes — not about new
sourcing or new classification.

This is purely **additive and non-destructive**: with no channel selected the feed is exactly today's
unified feed, so a member who ignores the banner sees no change.

## User-facing description
As a **signed-in verified member**, I want a row of **topic channel** pills at the top of the Feed —
**Bitcoin**, **NOSTR**, and **LFO Community** — that I can toggle on and off, so that I can **focus the
feed on the topic(s) I care about** while still being able to see everything.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] Given the Feed view, then a **filter banner** sits at the top of the feed showing a horizontal row
  of **pill-shaped, toggleable** buttons labeled **"Bitcoin"**, **"NOSTR"**, and **"LFO Community"**.
- [ ] Given the Feed first loads, then **all channel pills are deselected** and the feed shows the
  **full unified set** — the same notes as if no filter were applied (no regression from the current
  feed). The deselected/resting state means "no filter applied," not "empty."
- [ ] Given a single channel pill is selected, when the feed renders, then it shows **only** notes that
  **belong to that channel** — a note belongs to channel X when its per-topic score for X is **≥ the
  same inclusion threshold used in Story 5**. Notes not in that channel are hidden.
- [ ] Given **multiple** channel pills are selected, when the feed renders, then it shows notes that
  belong to **any** of the selected channels (union / OR), de-duplicated — a note in two selected
  channels appears **once**.
- [ ] Given a note's content scores into **more than one** channel (e.g. a Bitcoin-on-Nostr post), then
  it appears under **each** of those channels when selected (a note may belong to multiple channels).
- [ ] Given one or more channels are selected, when the user **deselects until none remain**, then the
  feed returns to the **full unified set** (zero selected = no filter = everything), never a blank feed.
- [ ] Given a pill, then its **toggled state is visually distinct** (selected vs unselected) so a member
  can see at a glance which channels are active.
- [ ] Given the feed is filtered by channel and the result is **empty** (no notes match the selected
  channels), then an **empty-state message** is shown (not a blank screen).
- [ ] Given the per-topic scores are **unavailable** (the classifier/score store could not be read, so
  notes can't be reliably assigned to channels), when the feed renders, then **all notes are shown** (the
  full unified feed) and the channel pills are rendered **disabled / non-interactive** — the feed never
  offers a filter it cannot apply. (Zero selected continues to mean show everything.)
- [ ] Given channels are toggled, then the existing feed behavior is otherwise **unchanged** —
  newest-first ordering, the ~100 cap, card layout, open-in-Primal, and read-only posture all hold over
  whatever subset is displayed.
- [ ] Given the Feed view, then the existing right-side panel that lists the feed's **query hashtags** is
  titled **"Source Hashtags"** (renamed from "Topics"), so that "topics" unambiguously refers to the new
  channel pills and the hashtag panel reads as the *source filter* it is.
- [ ] Given channel filtering changes the displayed set, then any **count shown in the header** (distinct
  members / posts) reflects the **currently displayed** notes, so the header stays truthful as channels
  toggle. _(Header copy from Story 1; exact recompute wording is the Architect's.)_

## Concepts touched
Concept Graph API (`http://localhost:8877`) was **not reachable** during planning — concepts named in
plain language; the Architect should resolve handles.

- **Content-relevance signal** — the three persisted per-note scores `{ bitcoin, nostr, lfo } ∈ [0,1]`
  from Story 5 (ADR 0033). This story **reads** them to decide channel membership; it does not change how
  they're produced.
- **Topic channel** *(new, UI-facing)* — a selectable topic lens (Bitcoin / NOSTR / LFO Community) mapped
  1:1 to the bitcoin / nostr / lfo score buckets.
- **Nostr kind-1 text note** — the unit filtered by channel.
- **Verified LFO member set** — unchanged; still gates which notes are in the pool at all.

## Out of scope
- **New sources** — the only note source remains **Provider 1 (hashtag source)**; Provider 2 / event-tag
  sourcing stays stubbed (Story 2).
- **New classification or re-scoring** — channel membership reuses the **existing** Story 5 scores; this
  story neither re-runs the classifier nor changes the threshold/prompt.
- **Curation/ranking changes** — endorsement + recency ranking is Story 2; ordering here is unchanged.
- **Per-channel relays, per-channel caps, or separate feeds per channel** — one pool, one feed, filtered
  by a client-facing lens.
- **Persisting the user's channel selection** across reloads/sessions — selection may reset to the
  default (all deselected) on reload; durable preference is a possible later enhancement, not required.
- **Adding/removing/renaming channels beyond the three** — the channel set is fixed at Bitcoin / NOSTR /
  LFO Community for this story.

## Open questions
- _(none open)_ — the "Topics" naming overlap is resolved by renaming Story 1's hashtag side panel to
  **"Source Hashtags"** (see Decided constraints / acceptance criteria).

## Decided constraints (PO direction)
- **Channels:** exactly three — **Bitcoin** → `bitcoin`, **NOSTR** → `nostr`, **LFO Community** → `lfo`.
- **Default on load:** all pills **deselected**, feed shows **everything** (no filter applied).
- **Deselect-all:** zero selected = **show everything** (consistent with the default; never empty).
- **Membership rule:** a note is in channel X iff its X score **≥ the Story 5 inclusion threshold**
  (reuse, do not introduce a new threshold). Multi-label allowed. To be precise about what's per-channel
  and what isn't:
  - The **score is per-channel** — every note already has three separate values `{ bitcoin, nostr, lfo }`
    from Story 5.
  - The **threshold is one shared value `T`.** A note is in the Bitcoin channel if `bitcoin ≥ T`, in
    NOSTR if `nostr ≥ T`, in LFO if `lfo ≥ T` — **same `T` for all three** (a single shared cutoff, not a
    per-channel knob). This makes the union with all channels active exactly equal to today's
    `max(scores) ≥ T` inclusion rule — no regression.
- **Multi-select:** **union (OR)** across selected channels, de-duplicated.
- **Source:** Provider 1 (hashtag source) only.
- **Scores unavailable → disable filtering:** if per-topic scores can't be read, show **all** notes and
  render the pills **disabled** (don't offer a filter that can't be applied).
- **Panel rename:** Story 1's right-side hashtag panel is retitled **"Topics" → "Source Hashtags"** so
  "topics" refers only to the new channel pills.

## Linked artifacts
- ADR: `engineering-team/decisions/0034-feed-topic-channels.md` (**Accepted**)
- Test plan: `engineering-team/stories/community-feed/6-topic-channels.test-plan.md` (8 unit + 12 e2e, confirmed RED)
- Review: `engineering-team/reviews/community-feed/6-topic-channels.md` — **PASS** (2026-06-24, re-review after fix `6d5e43e`; AC-9 resolved)
