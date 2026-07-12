# Epic: curation-policy

**Status:** Active
**Created:** 2026-07-12
**Book:** `engineering-team/audits/community-feed/book.md` (second epic in the `community-feed` book)
**Supersedes:** story `community-feed/2-curated-selection.md` (decomposed into this epic, 2026-07-12)

## Goal
Replace the feed's placeholder ordering (pure recency over the merged pool) with LFO's deliberate
curation policy: what **ranks** (endorsement × recency), what **qualifies** (governed tag scope),
how **channels** are governed (the general tag↔channel map and a dynamic channel surface), and what
**shape guarantees** the pool makes (floor / cap / freshness). All of it operates over the
provider/merge seam and per-note `vias` provenance that stories #8/#9 delivered — this epic is
policy over an existing mechanism, and each story is green-lit independently as its product
questions get answered.

## Why
Stories #8/#9 made member tagging a feed source, but ordering is still "newest first, cap 100."
The community's collective judgment (how many members vouched for a note, with which tags) is
recorded in provenance yet unused. Meanwhile the tag set and tag↔channel map are hardcoded config —
fine for four curator-authored tags, wrong for the write-path future where members mint tags in-app
and a governed subset must drive the feed.

## Stories (candidates — files created per story via /plan-feature)

- #1 — `endorsement-ranking` — the combined endorsement × recency score: distinct-member-tagger
  counts from `vias`, time decay so endorsement cannot keep a stale note alive, endorsement-0 notes
  ranked purely by recency (Provider 1 keeps the feed full during tagging lulls). *(Not started)*
- #2 — `curated-tag-dlist` — swap the hardcoded `EVENT_TAGS` socket (`api/feed.js`, ADR 0037's
  deliberate DList projection) for a governed, published list of qualifying tag a-coordinates.
  *(Not started)*
- #3 — `tag-channel-map` — the general (possibly 1:many) tag↔channel map and a dynamic channel
  surface: banner pills driven by config/DList rather than static markup; channel-set growth beyond
  the current four. *(Not started)*
- #4 — `pool-shape-guarantees` — representation floor, per-member cap, and freshness floor,
  re-derived for the two-provider world where Provider-2 notes may be authored by non-members.
  *(Not started)*

**NOT in this epic (PO decision 2026-07-12):** feed **header semantics** (old #2 Open question 9 —
what "X members contributing" counts in the endorsement era). That is answered and implemented
inside the **`community-feed`** epic as its own story.

**Likely execution order:** #2 → #3 (the map likely rides the DList) · #1 independent (rankable on
today's `vias`) · #4 after #1 (floor/cap interact with ranking). Not binding — each story proceeds
when its questions are answered.

## Open questions (per story — resolve before that story's planning gate)

Numbering below references the superseded story's original questions (o1–o9) for the audit trail.

**#1 endorsement-ranking**
- (o3) Build ahead of the data? Live endorsement still has near-zero variance (~1 tagger per note);
  a constant signal cannot order anything. Build now vs. wait for tagging behavior to develop.
- (o4) Apply-only or net (apply − dispute)? Is there a dispute threshold that suppresses a note
  entirely (beyond the per-tag ≥1-application admission rule)?
- (o7) The combining function — time-decay (which half-life?), bounded window, or weighted sum; the
  relative weight of one endorsement vs. one unit of freshness. ADR proposes; PO fixes the intent.

**#2 curated-tag-dlist**
- (o1 remainder) Who signs/custodies the list — the curator's key, or the future LFO House
  Assistant (write-path/signing infrastructure dependency)? List kind/format? Refresh cadence?
- What happens to already-displayed notes when a tag is de-listed?

**#3 tag-channel-map**
- (o2 remainder) Map shape and custody — annotation on the DList items, or a separate artifact?
  (Coupled to #2's design.)
- New (raised by #9): revisit the uniform four-pill degradation once channels are predominantly
  tag-derived — tag channels don't degrade with the classifier; should they stay live when
  `channelsAvailable` is false?

**#4 pool-shape-guarantees**
- (o5) Does "every qualifying member ≥ 1 note" survive? On which axis — author or tagger? A
  non-member author has no quota.
- (o6) Keep the ~10 per-member cap? Capped by author? Are Provider-2 notes exempt?
- (o8) A guaranteed minimum of fresh Provider-1 notes even when endorsed notes exist, or simple
  backfill-to-cap? Quantify if a floor is wanted.

## Settled — inherited from #8/#9, not reopened here
- Full classifier bypass for Provider-2 notes (a member's tag IS the relevance judgment).
- The trust gate is the **tagger's** membership, never the author's.
- The provider/merge seam, `vias`/`taggedWith` contracts, and merge union semantics.
- Per-request tagging reads, no caching (revisit trigger: assertion volume).
- Runtime TA resolution; honored authority = the runtime TA only.
- Note bodies from tagging relay ∪ nos.lol + damus; relay hints are the recorded future upgrade.
- `memberCount` stays unfiltered **pending** the community-feed header-semantics story (see above).

## Provenance
- Seeded from `community-feed/2-curated-selection.md` (Draft of 2026-06-18, revised 2026-07-09,
  superseded 2026-07-12) — see that file for the full pre-decomposition history and the 2026-07-09
  ground-truth snapshot.
