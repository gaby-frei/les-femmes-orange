# Story 9: Multi-tag sources — Bitcoin, Nostr, and the Ask LFO channel

**Status:** Done — review PASS 2026-07-12
**Created:** 2026-07-11
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`
**Builds on:** Story #8 (`8-event-tag-source`, Done) · **Precedes:** Story #2 (`2-curated-selection`)

## Background
Story #8 landed the event-tag mechanism end-to-end for one pilot tag: header discovery, member-tagger
trust gating, the provider/merge seam with provenance, the `taggedWith` payload contract, and the tag
pill UI. This story **widens the tag set from one to four** and adds one new channel. The mechanism is
deliberately untouched — this is a configuration-shaped story: more tags in, channels out.

All three new tags are **live on `tags.brainstorm.world` with real data** (verified 2026-07-11), all
authored by the same pubkey as `lfo-community` (`6db8a13f…`), each with exactly one tagging header
honored by the runtime TA:

| Tag | Assertions live | Notes |
|---|---|---|
| `bitcoin` ("Bitcoin") | 5 | |
| `nostr` ("Nostr") | 13 | |
| `ask-lfo` ("Ask LFO") | 6 | new channel (see below) |

Per-tag, the read flow is **exactly #8's six steps** (runtime TA → header discovery, never pinned →
assertions unioned across discovered headers → member-filtered resolution → note bodies from tagging
relay ∪ nos.lol + damus → merge with provenance). Whether the per-tag queries are batched into shared
round trips is the Architect's call; the observable behavior must be identical either way.

## The tag set (fixed for this story — PO decision, 2026-07-11)

The four tags and their channel assignments are a **static config array**, hardcoded like #8's single
pilot — **deliberately shaped as the projection a future curated tag-DList read would produce**, so
story #2 can swap the data source without touching the pipeline. (Decided against starting the DList
now: it would force #2's undecided governance questions — list custody, the general 1:many
tag↔channel map, dynamic channel pills — before their story. See the option-A/B discussion,
2026-07-11.)

| Tag (a-coordinate, all `39999:6db8a13f…:<slug>`) | Display name | Description (live, runtime-read) | Channel |
|---|---|---|---|
| `lfo-community` | LFO Community | "…content relevant to the Les Femmes Orange community itself…" | `lfo` (existing) |
| `bitcoin` | Bitcoin | "…Bitcoin-related content that is of interest to the LFO community." | `bitcoin` (existing) |
| `nostr` | Nostr | "…Nostr-related content that is of interest to the LFO community." | `nostr` (existing) |
| `ask-lfo` | Ask LFO | "…reserved for notes posing a question directed at the LFO community." | **`ask-lfo` (NEW)** |

Names/descriptions above are documentation only — at runtime they are read from the live tag-elements
per request, exactly as #8 does (slug fallback, inert pill on failure). Channel keys are what changes
per tag; **everything else about a tag's treatment is identical**.

## The Ask LFO channel (new)

- A **fourth toggleable pill, "Ask LFO"**, joins the #6 channel banner (Bitcoin / NOSTR / LFO
  Community / Ask LFO), with #6's exact filter semantics: none selected = show everything; selected =
  union of selected channels; header counts recompute over the filtered subset.
- **Exclusively Provider-2-sourced.** The relevance classifier's topic set (`{bitcoin, nostr, lfo}`)
  does **not** grow an `ask-lfo` topic — no Provider-1 note can ever carry the `ask-lfo` channel, by
  construction. A note is in Ask LFO iff a verified member applied the `ask-lfo` tag.
- **Degraded mode (PO decision, 2026-07-11): uniform.** When `channelsAvailable` is false, **all four
  pills disable** — #6's existing behavior extends to the new pill unchanged. (Considered keeping Ask
  LFO live since its membership never depends on the classifier; declined for UI consistency.)
- Ask-LFO-tagged notes appear in the unfiltered feed like any other note — the channel is a lens
  (#6), not a separate view.

## Channel & pill semantics for multi-tagged notes
- A note carrying several of these tags appears **once**, with `channels` = the **union** of each
  tag's channel (plus any Provider-1 score-derived channels if it was also hashtag-sourced).
- Its pill row shows **one pill per applied tag**, each independently toggleable to that tag's own
  description (the #8 pill contract, which already supports multiple entries).
- Per-tag gates are independent: a member's dispute on `bitcoin` does not affect the same note's
  `nostr` application.

## Carried from #8 unchanged (not re-decided here)
- Member-tagger gate (never the author), polarity buckets, honored authority = runtime TA only,
  header discovery over pinning, runtime TA resolution with per-process success-only cache.
- **Full classifier bypass for every Provider-2 note** (PO re-confirmed 2026-07-11 for the topic
  tags): a member's tag is the relevance judgment; where tag and classifier would disagree, the tag
  wins. Provider-2 notes are never sent to the classifier.
- No tagging-data caching; per-request reads. Volume rises from ~10 to ~34 live assertions — still
  trivial; the revisit trigger stands.
- Note bodies from tagging relay ∪ nos.lol + damus; drop silently if resolved nowhere.
- `memberCount` counts distinct authors of displayed notes, unfiltered (non-member authors included).
- Provider 2 is additive: any failure degrades to zero Provider-2 notes, never a failed request;
  `relayStatus` keeps reporting the tagging relay.
- Payload top-level shape unchanged; `taggedWith` remains the per-note display contract.

## User-facing description
As a **signed-in verified member**, I want notes that members have tagged **Bitcoin**, **Nostr**, or
**Ask LFO** to appear in my feed under those channels — with Ask LFO giving the community's questions
their own dedicated, toggleable lens — so that member curation, not just hashtags and AI scoring,
organizes what I see.

## Acceptance criteria
Testable from the outside; live-relay behavior exercised with injected fakes per the existing
patterns. #8's per-tag gate matrix (polarity, non-member tagger, header discovery, degradation) is
already covered by its tests over the shared mechanism and is **not re-tested per tag**; these
criteria cover what is new — the config-driven fan-out, channel assignments, and the new channel.

**Sourcing & channels**
- [ ] Given a note tagged `bitcoin` by a verified member, when the feed is built, then it appears
  with `bitcoin` among its channels; likewise `nostr` → `nostr` and `ask-lfo` → `ask-lfo`.
- [ ] Given one note tagged with **both** `bitcoin` and `nostr` by members, when the feed is built,
  then it appears **once**, its channels containing both, and its `taggedWith` carrying **both**
  entries (each with its own name and description).
- [ ] Given a note tagged `ask-lfo` **and** sourced by Provider 1 with a high bitcoin score, then its
  channels are the union (`ask-lfo` + score-derived) and it appears once.
- [ ] Given a Provider-1-only note (hashtag-sourced, never event-tagged), then its channels **never**
  contain `ask-lfo`, regardless of its scores or content.
- [ ] Given a tag in the config whose relay data yields zero admissible taggings, then it contributes
  nothing and the other tags are unaffected.
- [ ] Given the four-tag config, the per-tag trust gates behave exactly as #8 (spot-check: a
  non-member's `nostr` assertion admits nothing; a member's dispute on one tag does not suppress the
  same note's application under another tag).

**Channel banner (client)**
- [ ] Given the feed view, then the channel banner shows **four** pills — Bitcoin, NOSTR, LFO
  Community, **Ask LFO** — with #6's toggle semantics (aria-pressed, union filtering, empty-state,
  header recompute) extending to the fourth pill unchanged.
- [ ] Given the Ask LFO pill is selected alone, then exactly the notes whose channels include
  `ask-lfo` are shown.
- [ ] Given `channelsAvailable` is false, then **all four** pills are disabled and every note shows
  (uniform degradation — PO decision).

**Pills on notes**
- [ ] Given a note tagged with multiple tags, then one pill renders per tag, each toggling its own
  description independently (the #8 pill contract; names/descriptions from the live tag-elements
  with the #8 slug fallback).

**Contract**
- [ ] Given the feed response, then its top-level shape is unchanged; `channels` values may now
  include `ask-lfo`; `taggedWith` may carry multiple entries.

## Out of scope
- **The curated tag DList and the general (possibly 1:many) tag↔channel map** — story #2 (the config
  array here is its drop-in socket).
- **Endorsement-aware ranking** over the now-richer `vias` provenance — story #2.
- **The write path** (creating/applying tags in-app) and any signing infrastructure — future story;
  this remains a read-only consumer.
- **A new Haiku topic for `ask-lfo`** — the classifier's topic set is untouched.
- **Dynamic channel pills** (banner driven by config/DList) — the fourth pill is static, like the
  existing three; dynamism belongs with #2's DList design.
- Any change to Provider 1, the relevance filter, thresholds, or `memberCount` semantics.

## Open questions
**None blocking.** All decisions taken 2026-07-11 in planning conversation: option-A static config
(shaped as the DList projection), full classifier bypass for topic tags, uniform four-pill
degradation, story sequenced after #8 / before #2.

## Linked artifacts
- ADR: `engineering-team/decisions/0037-multi-tag-sources.md` (Accepted 2026-07-11)
- Test plan: `engineering-team/stories/community-feed/9-multi-tag-sources.test-plan.md` (2026-07-11)
- Review: `engineering-team/reviews/community-feed/9-multi-tag-sources.md` (PASS 2026-07-12)
- **Story #8** — `8-event-tag-source.md` (the mechanism this configures; Done, review PASS)
- **Story #2** — `2-curated-selection.md` (the policy story that will consume the config socket)
- ADR 0036 (+ amendments) — the provider/merge architecture this story extends
- Integration guide: `lfo-tagging-integration-guide.md` (external) — §7 "two independent axes"
