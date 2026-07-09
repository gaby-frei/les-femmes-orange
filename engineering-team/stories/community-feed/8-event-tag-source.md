# Story 8: Event-tag source (Provider 2) — reading `lfo-community` tagged notes

**Status:** Draft
**Created:** 2026-07-09
**Type:** Feature
**Epic:** `community-feed` · **Book:** `community-feed`
**Unblocks:** Story #2 (`2-curated-selection`)

## Background
Tapestry shipped **event-tagging**. The wire format is normative
(`tapestry/protocols/drafts/event-taggings.md`), a dependency-free CJS SDK exists
(`tapestry/src/lib/event-tagging/`), and it is **live on `tags.brainstorm.world`** carrying real LFO
data: an `lfo-community` tag with **10 tagged notes**, applied by **one verified member**, across **five
member authors** (verified 2026-07-09).

Story #2 was written to consume this signal, but it bundles the *read path* together with several
unresolved product decisions — tag scope, channel assignment, ranking, per-member caps. Those decisions
are being deferred. **This story extracts the read path alone** and proves it end-to-end against a
single pilot tag, so that #2 becomes a pure policy question over a mechanism that already works.

The feed's data layer is server-side (`api/feed.js`, ADR 0033). Today it has one source:

```
computeMembers() → fetchCandidates() → classifyNotes() → selectRelevant()
```

This story introduces the **second source** and the **merge layer** between sourcing and display.

### The mechanism, in one paragraph
Tagging is **indirect**. A *tagging assertion* (kind 39999) names its **target note** in an `e` tag and
reaches its **tag** through a `z` tag pointing at a per-tag **tagging header** — which in turn points at
the **tag-element** via an `a` tag. To find every note carrying `lfo-community`, you resolve the tag's
header(s), query assertions by `#z` over them, keep the ones whose asserter is an LFO member and whose
polarity is `apply`, and then fetch those note ids as kind-1 events. The SDK's
`filterTaggingHeadersForTag`, `filterTaggingsUsingTag`, and `classifyEventTaggings` do exactly this.

### Why we filter membership ourselves
`tags.brainstorm.world` offers server-side POV trust filtering, but the LFO POV is **not provisioned**
(`minRank: null` on `/api/tags/index`, verified 2026-07-09). Per the integration guide §6.2, an
un-provisioned POV **silently counts everyone** — it does not fail, it just stops filtering. Relying on
it would quietly admit non-member taggings. So we apply the member filter ourselves against the member
set the app already computes. We are the arbiter; nothing on Brainstorm's side must be correctly
provisioned for our feed to be correct.

## Pilot parameters (fixed for this story)

| Parameter | Value |
|---|---|
| Pilot tag | `lfo-community` |
| Tag a-coordinate | `39999:6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597:lfo-community` |
| Observed tagging header | `39999:6db8a13f…:tagging:lfo-community-tagging` |
| Channel | the **existing** `lfo` channel ("LFO Community") — no new pill |
| Ordering | **recency**, interleaved with Provider-1 notes |
| TA pubkey | resolved at runtime from `GET https://tags.brainstorm.world/api/assistant/pubkey` |
| Tagging relay | `wss://tags.brainstorm.world/relay` |

## User-facing description
As a **signed-in verified member**, I want notes that another member has explicitly tagged as
**LFO Community** to appear in my feed alongside the hashtag-sourced notes, ordered by recency, so that
what the community has deliberately vouched for shows up — even when it isn't about Bitcoin or Nostr.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test; live-relay behavior is exercised with
injected fakes, per the `buildFeedPayload(deps)` pattern.

**Sourcing**
- [ ] Given a kind-1 note carrying an `lfo-community` tagging assertion **applied by a verified member**,
  when the feed is built, then that note **appears in the feed**.
- [ ] Given a tagged note whose **author is not a verified member**, when the feed is built, then it
  **still appears** — Provider 2 gates on the **tagger**, never on the author.
- [ ] Given a tagging assertion applied by a **non-member**, when the feed is built, then that note is
  **not** admitted by Provider 2.
- [ ] Given a tagging assertion with **dispute** polarity (`≤ −0.5`), when the feed is built, then it
  does **not** admit the note. An **absent** `polarity` tag means apply. Values in the open interval
  `(−0.5, 0.5)` are **reserved** and counted as neither.
- [ ] Given a tagging assertion whose descriptor `z` resolves to a header that is **not** a member of a
  `tagging-with-specific-tag` list under an **honored authority**, then the assertion is **illegitimate**
  and does not admit the note.
- [ ] Given a tagging assertion whose descriptor header **cannot be resolved** from the data we have,
  then it is **unverifiable** — distinct from illegitimate — and does not admit the note, but the
  distinction is **surfaced in logs**, not silently collapsed (spec: "cannot determine is not not-a-tagging").
- [ ] Given a note carrying an event-tag **other than** `lfo-community` (e.g. `stoicism`, `travel`), then
  Provider 2 does **not** admit it. Tag scope for this story is exactly one tag.

**Relevance & channels**
- [ ] Given a Provider-2 note whose content is **off-topic for Bitcoin/Nostr** (e.g. a garden photo),
  when the feed is built, then it is **not dropped** by story #5's relevance filter — the classifier
  never excludes a Provider-2 note.
- [ ] Given a Provider-2 note, then its `channels` array contains **`lfo`**.
- [ ] Given a note sourced from **both** providers, when the feed is built, then it appears **once**
  (deduped by event id) and its `channels` are the **union** of Provider 1's score-derived channels and
  Provider 2's `lfo`.

**Merge & ordering**
- [ ] Given candidate notes from both providers, when the feed is selected, then the merged pool is
  deduped by event id and ordered **strictly newest-first**, capped at the existing display limit (100).
- [ ] Given a Provider-2 note **older** than the 100th newest Provider-1 note, then it does **not**
  displace it — recency alone orders the pool in this story. (Endorsement-aware ranking is #2.)

**Seam & contract**
- [ ] Given the source layer, when a provider is added or removed, then **neither** the merge nor the
  ordering logic changes — each provider is an independent function returning candidates annotated with
  **provenance** (`{ event, vias:[…] }`) recording why the note qualified.
- [ ] Given the feed response, then its shape is **unchanged**: `memberCount`, `notes`, `memberNames`,
  `channelsAvailable`, `relayStatus`.

**Degradation**
- [ ] Given the tagging relay is **unreachable or times out**, when the feed is built, then Provider 2
  contributes **zero** notes, the feed still renders Provider-1 notes, and the request **does not fail**.
- [ ] Given the TA pubkey endpoint is unreachable, then Provider 2 degrades to zero notes rather than
  falling back to a hardcoded pubkey.
- [ ] Given `relayStatus`, then it reports the **tagging relay** alongside the existing feed relays, so a
  Provider-2 outage is visible rather than silent.

## Concepts touched
Concept Graph API should be consulted by the Architect for live handles; the values below were read from
the live deployment on 2026-07-09.

- **`nostr-event-tag`** — `39998:<TA>:nostr-event-tag`. The concept an assertion joins. TA is
  **per-deployment** and **resolved at runtime**; a hardcoded literal from another instance makes our
  reads return nothing.
- **`tagging-with-specific-tag`** — `39998:<TA>:tagging-with-specific-tag`. The list whose members are
  per-tag tagging headers. Membership in it under an **honored authority** is what makes an assertion
  legitimate. The honored set is a **reader parameter** — see Open questions.
- **Tag-element** — `39999:<tagAuthor>:<slug>`; the tag itself. Ours: `lfo-community`.
- **Verified LFO member set** — the existing membership closure (`public/lib/membership.js`,
  `buildMemberSets`). Reused unchanged as Provider 2's **tagger** filter.
- **Nostr kind-1 text note** — the target and the unit displayed.

## Out of scope
- **In-app tagging (the write path).** Creating tag-elements, tagging headers, or assertions from the LFO
  UI — including `applyEventTagging` and any signer wiring — is a **future story**. This story reads only,
  consistent with the app's read-only posture.
- **Tag scope beyond `lfo-community`.** A curated tag DList (integration guide §7) is deferred to #2.
- **Channel assignment policy.** The tag↔channel map (possibly 1:many) and any new channel pill are #2's.
  This story hardcodes `lfo-community → lfo`.
- **Endorsement-aware ranking.** Distinct-tagger counts, time-decay, combining functions — all #2. Live
  data has one tagger per note, so there is nothing to rank on yet.
- **Representation floor and per-member cap** changes. #2.
- **Publishing LFO's member Trusted List** (kind-30392) and the **LFO House Assistant** (server-side nsec).
  Only needed for the future Brainstorm-side POV upgrade; the client-side member filter needs neither.
- **Brainstorm-side POV "Trust Determination."**
- Changing Provider 1 in any way — hashtags, relays, classifier, threshold, or its channel derivation.

## Note for the Architect — the two read paths
The integration guide (§5) offers two ways to read tagged notes. They are **not** equivalent for us:

- **Option A — raw relay + SDK (guide's recommendation).** Subscribe to `wss://tags.brainstorm.world/relay`
  with `filterTaggingHeadersForTag` + `filterTaggingsUsingTag`, then run `classifyEventTaggings` with a
  trust predicate of "asserter ∈ LFO member set," then fetch the target kind-1 notes by id. No cap, no
  CORS, we own the trust decision. Costs: we vendor the SDK (or reimplement its filters) and issue
  several relay round-trips.
- **Option B — `GET /api/event-tags/for-tag`.** One call returns resolved, enriched notes. But it is
  **POV-filtered** (and that POV is un-provisioned → counts everyone), **capped at 50** most-recent notes
  per tag with no pagination, and same-origin (fine from our server, not from a browser). We would still
  have to re-filter by member set ourselves, so its main draw — resolution — buys little.

**PO leaning: Option A.** It matches the decentralized posture, has no cap, and its trust predicate is
exactly the member filter we already compute. The Architect decides, and should record why.

Two sub-decisions ride on this:
- **Vendoring the SDK.** `tapestry/src/lib/event-tagging/` is dependency-free CJS — a good fit for this
  repo's JS-without-build constraint. But copying third-party source into `api/_lib/` is a real decision
  (provenance, drift against `feat/tags`, update path). It needs an ADR either way.
- **Where the target notes are fetched.** The tagged kind-1 notes resolve on `tags.brainstorm.world`, but
  Provider 1 reads `nos.lol` + the damus interim augment. The Architect decides whether to fetch note
  bodies by id from the tagging relay, the feed relays, or both.

## Decided constraints (for the Architect)
- **Resolve the TA pubkey at runtime** (`/api/assistant/pubkey`). Never hardcode it. Cache it per
  process; degrade Provider 2 to `[]` if it can't be fetched.
- **Filter taggers client-side** against our own member set. Do **not** depend on Brainstorm's POV.
- **Provider 2 bypasses the #5 relevance classifier entirely.** A member's tag is the relevance judgment.
- Provider-2 notes get `channels: ['lfo']` in this story. No new pill; no new channel.
- **Merge by event id, order by `created_at` desc**, cap at the existing `DISPLAY_LIMIT` (100).
- Each provider returns candidates carrying **provenance** so #2 can rank on it later without reworking
  the seam.
- **Never fail the request** because Provider 2 failed. It is additive; its absence is the status quo.
- Builds inside `buildFeedPayload(deps)` with providers injected, so both sources are unit-tested with
  fakes (no live relays in CI) — the existing `api/feed.js` pattern.
- Keep the feed payload shape unchanged (ADR 0029 contract, extended by ADR 0034's `channelsAvailable`).

## Open questions
- **Honored legitimacy authorities** (Architect + PO): the spec makes this a **reader parameter**. Live,
  `/api/tags/index` reports two authorities: `82b75e47…` (the `nostr-user-tag` namespace we already
  trust for membership) and `a68dbf56…` (the TA). Do we honor both, or only the TA? Hardcoding a single
  authority is explicitly warned against by the spec — but so is honoring an unbounded set.
- **`memberCount` semantics** (PO): the subtitle counts distinct authors of displayed notes. Provider 2
  can now admit a **non-member** author, who would inflate "X members contributing." *PO recommendation:*
  count distinct **member** authors only, leaving the copy honest. Confirm before implementing; #2's
  Open question 9 revisits it once endorsement lands.
- **Caching** (Architect): Provider 1's Haiku scores are KV-cached. Should tagging assertions be cached
  too, or is a per-request relay query acceptable at 10-notes scale? Note it will not stay at 10.
- **Header discovery** (Architect): anyone may author a tagging header for a tag, so a tag may have
  **several** headers. Do we query assertions across all discovered headers for `lfo-community`, or pin
  the one observed header (`39999:6db8a13f…:tagging:lfo-community-tagging`)? Pinning is simpler and
  matches today's data; discovering is correct if a second member ever mints a header.

## Linked artifacts
- ADR: (filled in after Architecture phase — **not yet started**)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- **Story #2** — `2-curated-selection.md` (the policy story this unblocks)
- Protocol: `tapestry/protocols/drafts/event-taggings.md`; family spec `tapestry/protocols/drafts/tags.md`
- SDK: `tapestry/src/lib/event-tagging/` (public repo `github.com/nous-clawds4/tapestry`, branch `feat/tags`)
- Integration guide: `lfo-tagging-integration-guide.md` (external) — §5 read paths, §6 POV, §7 membership
- Related: ADR 0029 (feed data-layer boundary), ADR 0033 (server-side feed), ADR 0034 (channels)
