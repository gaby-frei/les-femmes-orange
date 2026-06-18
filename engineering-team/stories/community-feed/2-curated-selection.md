# Story 2: Curated selection — endorsement-ranked feed over a multi-source candidate pool

**Status:** Draft
**Created:** 2026-06-18
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`

## Background
Story 1 delivered the Feed view and a placeholder selection (newest-100). This story replaces that
placeholder with the real **curation policy** and, in doing so, widens the data layer so the feed's
**sourcing** is transferable to the community's intended long-term signal: member-applied
**`nostr-event-tag`** attestations on notes (planned in `tapestry/protocols/drafts/tags.md`; not yet
specified on the wire, not yet deployed — `tags.brainstorm.world` deploys only `nostr-user-tag`).

The existing two-stage seam in `getFeed()` (source → select) is widened into **three thin layers**
so the future event-tag source is a single-function drop-in, with **zero churn to selection**:

1. **Sources (providers)** — independent functions, each returning candidate notes annotated with
   **provenance** (why the note qualified). Today:
   - **Provider 1 — hashtag source** (the current method: kind-1 by verified-member authors carrying a
     qualifying `t` tag). **Consistent, always-on** — the freshness backbone.
   - **Provider 2 — event-tag source** (notes carrying LFO `nostr-event-tag` attestations from verified
     members). **High-signal but bursty** — depends on manual tagging, so volume is uneven and may be
     low or zero at any given time. **Stubbed `→ []`** until the `nostr-event-tag` wire format lands
     and is deployed.
2. **Merge** — union by event id; a note that arrives from both providers carries both provenance
   entries. Output: one candidate pool, each entry `{ event, vias:[…] }`.
3. **Selection / curation** — one source-agnostic policy over the merged pool. **This is the heart of
   the story.**

Because Provider 2 is bursty and inconsistent, we **deliberately keep Provider 1 running alongside
it** to keep the feed full and fresh during tagging lulls — Provider 1 backfills whatever Provider 2
does not supply.

## User-facing description
As a **signed-in verified member**, I want the feed to surface the notes the community has most
strongly **vouched for** — while still staying full and fresh — so that what I see reflects LFO's
collective judgment, not just whatever was posted most recently.

## Selection model (Layer 3) — PO direction
The feed is ordered by a **combined relevance score that factors in both endorsement and recency** —
neither dominates the other absolutely. Endorsement is a **primary signal alongside (not above)
recency**: a strongly-endorsed note still ages out, so a five-month-old post with the strongest
endorsement signal should **not** surface in today's feed, while a well-endorsed *recent* note should
rank above an un-endorsed equally-recent one.

- **Endorsement strength.** A note's endorsement is the **count of distinct verified members who have
  applied an LFO `nostr-event-tag` to that note** (unique taggers, not total tags). More distinct
  taggers → higher endorsement contribution to the score.
- **Recency.** Note age is a co-equal input: older notes are progressively discounted (e.g. a
  time-decay or a bounded recency window) so endorsement cannot indefinitely keep a stale note alive.
  The exact combining function (decay half-life / window / relative weights) is **deferred to the ADR**
  — see Open questions; this story fixes the *intent*, not the formula.
- **Polarity-aware.** Only `apply` (polarity `1`) attestations from **verified members** count toward
  endorsement; `dispute` (polarity `-1`) does not add (exact net-vs-threshold rule → open question).
- **Provider 1 keeps it fresh.** Because endorsement only *adds* to a recency-grounded score, notes
  with endorsement 0 (today *every* note, since Provider 2 is stubbed; later, all hashtag-only/untagged
  notes) are ranked purely by recency — so Provider 1 naturally fills the feed to the ~100 cap during
  tagging lulls, newest-first.
- **Graceful identity today.** With Provider 2 stubbed (no event-tag data), every note has endorsement
  0, so the combined score reduces to **newest-first** — i.e. no regression vs Story 1's current output.
  The scoring is fully built and **unit-testable now** via synthetic provenance; it simply has no live
  endorsement data to act on until the protocol lands.

The interaction of the **representation floor** (every qualifying member ≥ 1 note) and the **soft
per-member cap (~10)** with the new endorsement-primary ordering is **not yet decided** — see Open
questions. Those rules were defined on an author axis; endorsement reframes the community signal
toward *taggers/curators*, and the two can pull against each other.

## Acceptance criteria
Testable from the outside (Layer 3 testable today via synthetic provenance; Provider 2 query is not).

- [ ] Given the three-layer seam, when `getFeed()` runs, then candidates are produced by one or more
  independent **source** functions, **merged** into a single pool deduped by event id with provenance
  unioned, and a single **selection** policy is applied; adding or removing a source changes neither
  the merge nor the selection logic.
- [ ] Given two notes of **comparable recency** with differing counts of **distinct verified-member LFO
  event-tag** attestations, when the feed is selected, then the note with **more distinct taggers ranks
  higher**.
- [ ] Given a strongly-endorsed but **old** note and a fresh **un-endorsed** note, when the feed is
  selected, then recency is weighed too — a sufficiently old note (e.g. months old) does **not** outrank
  current notes on endorsement alone, and does not surface in today's feed.
- [ ] Given a note attested only by **non-members**, or only via **dispute** polarity, then those
  attestations do **not** raise its endorsement strength.
- [ ] Given few or no endorsed notes, when the feed is selected, then the ~100 cap is filled by recency
  (Provider 1), so the feed stays full and fresh.
- [ ] Given **no** event-tag data (Provider 2 stubbed — today's reality), when the feed loads, then it
  is populated by the hashtag source and ordered **newest-first**, with **no regression** vs Story 1.
- [ ] Given the curated result, then `getFeed()`'s return shape is **unchanged** (`memberCount`,
  `notes`, `memberNames`, `relayStatus`) so it remains a drop-in for the planned `GET /api/feed`
  (ADR 0029).

## Concepts touched
Concept Graph API should be consulted by the Architect for live handles.

- **`nostr-event-tag`** (planned; `tapestry/protocols/drafts/tags.md`) — member attestation that a
  kind-1 event belongs to a tag. The future primary relevance signal. Wire format unspecified →
  Provider 2 stays a stub; the *selection contract* depends only on the abstract "set of distinct
  verified-member taggers per note," which is stable across whatever wire form lands.
- **Verified LFO member set** — existing membership closure; gates both *whose* notes/hashtags count
  (Provider 1) and *whose* attestations count (endorsement). Not modified by this story.
- **Nostr kind-1 text note** — the unit ranked and displayed.
- **Topic hashtag (`t` tag)** — Provider 1's qualifying signal (unchanged from Story 1).

## Out of scope
- **In-app event-tag attestation UI** (tagging a note from the feed) — future, separate story.
- **Search-by-event-ID to apply a tag** — future, separate story.
- **Implementing Provider 2's live relay query** — stays a documented stub returning `[]` until the
  `nostr-event-tag` wire format is specified and deployed. This story builds the *seam and the
  selection policy*, not the live event-tag fetch.
- **Changing the gating / access model**, and **tagger-as-representation-axis** (see Open questions —
  may be revisited, but not committed here).
- New relays for feed content (still nos.lol for Provider 1, per Story 1).

## Open questions
Resolve before approving.

1. **Polarity rule** — is endorsement `distinct apply taggers` only, or **net** (apply − dispute), and
   is there a dispute threshold that suppresses a note entirely?
2. **Representation floor** — does "every qualifying member ≥ 1 note" survive now that endorsement is
   primary? If so, on which axis — **author** or **tagger**? (Story 1 header counts *authors*.)
3. **Per-member cap (~10)** — keep it, and is it capped by **author** (a heavily-endorsed author could
   otherwise dominate) or dropped in favor of pure endorsement ranking?
4. **Combining function** — how exactly are endorsement and recency merged into one score? Time-decay
   (which half-life?), a bounded recency window, or weighted sum — and the relative weight of one
   endorsement vs. one unit of freshness. Intent is fixed (both co-equal, old notes age out); the
   formula is the ADR's to propose.
5. **Freshness floor** — the user wants "a healthy quantity" from Provider 1 regardless of tagging
   volume. Do we guarantee a **minimum count of recent hashtag notes** even when endorsed notes exist,
   or simply backfill to the cap? Quantify if a floor is wanted.
6. **Header semantics** — "X members contributing" currently counts distinct authors. Does endorsement
   change what the subtitle should report (authors vs endorsers)?

## Linked artifacts
- ADR: (filled in after Architecture phase — **not yet started**)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- Related: ADR 0029 (community-feed view / data-layer boundary); memory `project-feed-curation-direction`.
