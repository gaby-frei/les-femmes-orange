# Story 2: Curated selection — endorsement-ranked feed over a multi-source candidate pool

**Status:** Superseded — decomposed into epic `curation-policy` (2026-07-12; PO decision)
**See:** `engineering-team/epics/curation-policy.md` — its four candidate stories carry this story's
scope and open questions o1–o8. **Exception:** Open question 9 (feed header semantics) stays in the
`community-feed` epic as its own story. This file is retained unchanged below as the
pre-decomposition record; do not plan work from it.
**Created:** 2026-06-18
**Revised:** 2026-07-09 — protocol unblocked; scope narrowed (see "What changed")
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`
**Depends on:** Story #8 (`8-event-tag-source`) — the read-path pilot that lands Provider 2

## What changed (2026-07-09)
The original draft was written while `nostr-event-tag` was unspecified and Provider 2 was a stub
returning `[]`. **That premise no longer holds.** Tapestry shipped event-tagging: the wire format is
normative (`tapestry/protocols/drafts/event-taggings.md`), a dependency-free CJS SDK exists
(`tapestry/src/lib/event-tagging/`), and it is **live on `tags.brainstorm.world`** with real LFO data.

Four things the original draft got wrong or could not have known, all corrected below:

1. **Tagging is per-tag and indirect**, not a generic "LFO event-tag attestation." An assertion names
   its *target* in `e`/`a` and reaches its *tag* indirectly through a per-tag **tagging header** in a
   `z` tag. "Endorsement" is therefore always *endorsement with respect to some specific tag* — which
   forces a **tag-scope decision** the original draft never posed.
2. **Two independent filters, not one.** *Which tags* count and *whose taggings* count are orthogonal
   axes (integration guide §7). The draft collapsed them into "verified-member LFO attestations."
3. **The note's author need not be a member** — only the **tagger** must be. Confirmed by the user
   2026-07-09. This breaks the author-axis assumption under the representation floor and per-member cap.
4. **Provider-2 notes are not subject to Provider 1's relevance filter** (#5 Haiku). Confirmed by the
   user 2026-07-09. A human member's tag *is* the relevance judgment; the classifier must not overrule it.

**Consequently this story is split.** Story **#8** takes the read path — Provider 2 sourcing, proven
end-to-end against the single `lfo-community` tag, merged with Provider 1 by recency. Story #2 keeps
what genuinely remains open: **generalizing** that pilot to many tags, and deciding **ranking**,
**channel assignment**, and **caps**. #2 is now blocked on **product decisions**, not on Tapestry.

## Ground truth as of 2026-07-09 (verified live)
Measured against `tags.brainstorm.world`; re-verify before implementing.

| Fact | Value |
|---|---|
| TA pubkey | `a68dbf561cfe3da1b76f1e65c7d4d9cc116f79921b38a815fd75cb5460b4b599` — **resolve at runtime** via `GET /api/assistant/pubkey`; never hardcode |
| Honored authorities (observed) | `82b75e47…` (the `nostr-user-tag` namespace we already use) and `a68dbf56…` (the TA) |
| Tags on the instance | 9, of which 5 have event applications |
| `lfo-community` tag | `39999:6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597:lfo-community` — 10 event applications, 0 disputes |
| Distinct taggers across all 10 | **1** (`6db8a13f…`, a verified member) |
| Distinct note authors | 5 — **all verified members** (today; not guaranteed) |
| Tagged-note content | Lifestyle/community: gardens, family, reading, retreats — **content #5's classifier is built to reject** |
| Server-side POV filtering | `minRank: null` → **un-provisioned → silently counts everyone**. We must filter by member set ourselves (guide §6.2) |
| `GET /api/event-tags/for-tag` | Works; **caps at 50** most-recent notes per tag; no CORS (server-side only) |

**The critical consequence:** endorsement strength has **no variance** in live data — every tagged note
has exactly one tagger. An endorsement-*ranking* signal that is constant cannot order anything. The
original draft's headline mechanism is, today, unexercised. It may still be worth building ahead of the
data, but that is now an explicit decision (Open question 3), not an assumption.

## Background
The feed's data layer is **server-side** (`api/feed.js`, ADR 0033, executing ADR 0029's migration). Its
current shape is four stages, not the two the original draft described:

```
computeMembers() → fetchCandidates() → classifyNotes() → selectRelevant()
```

This story widens that into the **three-layer seam** the original draft proposed — sources → merge →
selection — so that adding a source changes neither merge nor selection. **Story #8 builds that seam**
and puts two providers behind it. Story #2 then replaces #8's placeholder ordering (recency) with the
real curation policy.

1. **Sources (providers)** — independent functions returning candidate notes annotated with
   **provenance** (why the note qualified):
   - **Provider 1 — hashtag source.** Kind-1 by verified-member authors carrying a qualifying `t` tag,
     refined by #5's Haiku relevance filter. **Consistent, always-on** — the freshness backbone.
   - **Provider 2 — event-tag source.** Notes carrying LFO event-tag assertions from verified members.
     **High-signal but bursty** — depends on manual tagging, so volume is uneven. **Live as of #8.**
2. **Merge** — union by event id; a note arriving from both carries both provenance entries.
   Output: one candidate pool, each entry `{ event, vias:[…] }`.
3. **Selection / curation** — one source-agnostic policy over the merged pool. **This is the heart of
   the story.**

Provider 1 keeps running alongside Provider 2 to keep the feed full and fresh during tagging lulls.

## User-facing description
As a **signed-in verified member**, I want the feed to surface the notes the community has most
strongly **vouched for** — while still staying full and fresh — so that what I see reflects LFO's
collective judgment, not just whatever was posted most recently.

## Selection model (Layer 3) — PO direction
The feed is ordered by a **combined relevance score that factors in both endorsement and recency** —
neither dominates the other absolutely. A strongly-endorsed note still ages out: a five-month-old post
with the strongest endorsement should **not** surface in today's feed, while a well-endorsed *recent*
note should rank above an un-endorsed equally-recent one.

- **Endorsement strength.** A note's endorsement is the **count of distinct verified members who have
  applied a qualifying LFO event-tag to that note** (unique taggers, not total assertions). *Which* tags
  qualify is Open question 1.
- **Recency.** Note age is a co-equal input: older notes are progressively discounted (time-decay or a
  bounded window) so endorsement cannot indefinitely keep a stale note alive. The exact combining
  function is **deferred to the ADR** — this story fixes the *intent*, not the formula.
- **Polarity-aware.** Only `apply` assertions from **verified members** count. Per the spec's v1 rule,
  `polarity ≥ 0.5` is applied and `≤ −0.5` disputed; the open interval is reserved and not counted.
  Whether disputes *subtract* or merely *don't add* is Open question 4.
- **Provider 1 keeps it fresh.** Endorsement only *adds* to a recency-grounded score, so notes with
  endorsement 0 are ranked purely by recency — Provider 1 naturally fills the feed to the ~100 cap
  during tagging lulls, newest-first.
- **Provider 2 bypasses the relevance filter.** A member's tag is the relevance judgment. Haiku scores
  never exclude a Provider-2 note (settled; inherited from #8).

## Acceptance criteria
Assumes #8 has landed Provider 2 and the three-layer seam. These criteria cover only what #8 defers.

- [ ] Given the three-layer seam, when the feed is built, then candidates are produced by independent
  **source** functions, **merged** deduped by event id with provenance unioned, and a single
  **selection** policy is applied; adding or removing a source changes neither merge nor selection.
- [ ] Given two notes of **comparable recency** with differing counts of **distinct verified-member**
  taggers, when the feed is selected, then the note with **more distinct taggers ranks higher**.
- [ ] Given a strongly-endorsed but **old** note and a fresh **un-endorsed** note, when the feed is
  selected, then a sufficiently old note (e.g. months old) does **not** outrank current notes on
  endorsement alone, and does not surface in today's feed.
- [ ] Given a note attested only by **non-members**, or only via **dispute** polarity, then those
  assertions do **not** raise its endorsement strength.
- [ ] Given a tag **outside** LFO's qualifying tag scope (Open question 1), when a member applies it to
  a note, then that note is **not** admitted to the feed by Provider 2.
- [ ] Given few or no endorsed notes, when the feed is selected, then the ~100 cap is filled by recency
  (Provider 1), so the feed stays full and fresh.
- [ ] Given a Provider-2 note, then its `channels` are derived from **its event-tag(s)**, not from Haiku
  scores (per the epic's tag↔channel mapping), and a note sourced from **both** providers carries the
  **union** of both channel derivations.
- [ ] Given the curated result, then the feed payload's return shape is **unchanged** (`memberCount`,
  `notes`, `memberNames`, `channelsAvailable`, `relayStatus`).

## Concepts touched
- **`nostr-event-tag`** — **shipped.** Member assertion that an event carries a tag. Normative spec:
  `tapestry/protocols/drafts/event-taggings.md`. Reference SDK: `tapestry/src/lib/event-tagging/`.
- **`tagging-with-specific-tag`** — the per-tag header concept that makes tagging indirect. A reader
  counts an assertion only if its descriptor `z` resolves to a legitimate header under an **honored
  authority** (a reader parameter, not a protocol constant).
- **Verified LFO member set** — existing membership closure. Gates *whose attestations count*
  (Provider 2) and *whose notes count* (Provider 1). **Not** a gate on Provider-2 note authorship.
- **Nostr kind-1 text note** — the unit ranked and displayed.
- **Topic hashtag (`t` tag)** — Provider 1's qualifying signal (unchanged from Story 1).

## Out of scope
- **Everything Story #8 covers** — Provider 2's live read path, the `lfo-community` pilot tag, the
  merge layer, recency ordering, and the `lfo` channel assignment for tagged notes.
- **In-app event-tag attestation UI** (tagging a note from the feed) — future, separate story. This
  story and #8 are **read-only**.
- **Publishing LFO's member Trusted List** (kind-30392) and the **LFO House Assistant** (server-side
  nsec) — only needed for the *future* Brainstorm-side POV upgrade (guide §7); the client-side member
  filter needs neither.
- **Brainstorm-side POV "Trust Determination"** — a later upgrade; we are the arbiter for now.
- **Changing the gating / access model.**
- New relays for Provider-1 content (still nos.lol + the damus interim augment, per Story 1 / #5).

## Open questions
Resolve before approving. Deferred from the 2026-07-09 planning session at the user's request.

1. **Tag scope.** Which event-tags qualify a note for Provider 2? Options: a **curated LFO tag DList**
   of hand-picked a-coordinates (guide §7's recommendation); **only `lfo-community`** (what #8 pilots);
   or **any tag applied by a member** (no tag curation — a member tagging something `#stoicism` would
   silently inject it).
2. **Channel assignment.** Provider-2 notes have no Haiku scores. How do they get channel pills?
   Options: a new **Community** channel; a **tag→channel map** (the epic's stated direction, possibly
   1:many); **all P2 → `lfo`** (what #8 pilots); or classify-for-channels-only (never for exclusion).
   Note the epic: the channel set may need to grow beyond Bitcoin / NOSTR / LFO Community.
3. **Ranking.** Live endorsement has zero variance (all notes: 1 tagger). Build the full combined
   endorsement×recency score anyway, ahead of the data? Or **P2-before-P1** blocks? Or **merge by
   recency**, letting endorsement decide inclusion only (what #8 pilots)?
4. **Polarity rule.** Is endorsement `distinct apply taggers` only, or **net** (apply − dispute), and
   is there a dispute threshold that suppresses a note entirely?
5. **Representation floor.** Does "every qualifying member ≥ 1 note" survive? On which axis — **author**
   or **tagger**? Complicated by non-member authors: a non-member author has no quota.
6. **Per-member cap (~10).** Keep it? Capped by **author** (a heavily-endorsed author could otherwise
   dominate) or dropped in favor of pure endorsement ranking? Do Provider-2 notes get exempted?
7. **Combining function** (ADR's to propose). Time-decay (which half-life?), bounded recency window, or
   weighted sum — and the relative weight of one endorsement vs. one unit of freshness.
8. **Freshness floor.** Guarantee a **minimum count** of recent Provider-1 notes even when endorsed
   notes exist, or simply backfill to the cap? Quantify if a floor is wanted.
9. **Header semantics.** "X members contributing" counts distinct authors. Does endorsement change what
   the subtitle reports (authors vs endorsers)? Non-member authors now count toward it.

## Linked artifacts
- ADR: (filled in after Architecture phase — **not yet started**)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- **Story #8** — `8-event-tag-source.md` (the read-path pilot this story generalizes)
- Protocol: `tapestry/protocols/drafts/event-taggings.md`; SDK `tapestry/src/lib/event-tagging/`
- Integration guide: `lfo-tagging-integration-guide.md` (external; §5–§7 are the load-bearing sections)
- Related: ADR 0029 (feed view / data-layer boundary), ADR 0033 (server-side feed), ADR 0034 (channels);
  memory `project-feed-curation-direction`
