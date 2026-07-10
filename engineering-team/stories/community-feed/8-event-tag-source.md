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
polarity is `apply`, and then fetch those note ids as kind-1 events.

### Why we filter membership ourselves
`tags.brainstorm.world` offers server-side POV trust filtering, but the LFO POV is **not provisioned**
(`minRank: null` on `/api/tags/index`, verified 2026-07-09). Per the integration guide §6.2, an
un-provisioned POV **silently counts everyone** — it does not fail, it just stops filtering. Relying on
it would quietly admit non-member taggings. So we apply the member filter ourselves against the member
set the app already computes. We are the arbiter; nothing on Brainstorm's side must be correctly
provisioned for our feed to be correct.

## The read flow (normative for this story)
Six steps. **All tagging data comes from the Brainstorm relay** (`wss://tags.brainstorm.world/relay`) —
assertions and headers are published there and propagate nowhere else. Only step 4 (note bodies) may
need other relays.

**0 — Get the TA pubkey.**
`GET https://tags.brainstorm.world/api/assistant/pubkey` → `a68dbf56…`. Resolve at runtime, cache per
process, never hardcode. Every concept handle below is composed from it. If this fails, Provider 2
returns `[]`.

**1 — Find the relevant tagging header** for the `lfo-community` tag, via its stable a-coordinate
`39999:6db8a13f…:lfo-community`. Build with `filterTaggingHeadersForTag({ tagAuthorPubkey, slug, taPubkey })`:

```js
{ kinds: [39999],
  '#a': ['39999:6db8a13f…:lfo-community'],                  // the header points at the tag-element
  '#z': ['39998:a68dbf56…:tagging-with-specific-tag'] }     // …and is itself a tagging header
```

Precisely: the header→tag pointer is an **`a`** tag (which we match on), and the `#z` clause narrows the
result to events that are members of the honored `tagging-with-specific-tag` list. The `z` pointer is
what makes it a *header*; the `a` pointer is what makes it *this tag's* header. Today this returns one
header: `39999:6db8a13f…:tagging:lfo-community-tagging`.

**2 — Find the assertions (taggings) that reference that header.** For each header author from step 1,
`filterTaggingsUsingTag({ headerAuthorPubkey, slug })`:

```js
{ kinds: [39999], '#z': ['39999:6db8a13f…:tagging:lfo-community-tagging'] }
```

Note the parameter is the **header's** author, not the tag's — they coincide today but need not.
Returns raw **candidates** (10 today), each carrying an `e` tag naming a kind-1 note.

**3 — Resolve and filter.** Pass candidates + headers to **`groupTaggingsByTarget`** (not
`classifyEventTaggings` — that one groups by *tag* for a single target, i.e. the reverse direction):

```js
groupTaggingsByTarget({
  candidates, headers,
  honoredAuthorities: [taPubkey],                 // see Open questions
  isAsserterTrusted: (pk) => memberSet.has(pk),   // OUR membership filter
  tag: { authorPubkey: '6db8a13f…', slug: 'lfo-community' },
})
```

It gates each candidate on: descriptor `z` present → header resolvable → header joins an honored
authority → header names *this* tag → **polarity** buckets to apply (`≥ 0.5`; an **absent** `polarity`
tag means apply) or dispute (`≤ −0.5`; the open interval is neutral and dropped) → **asserter is a
member**. Keep targets with ≥ 1 application. **Output: a list of event ids.**

Two gates carry the weight, and neither can be done by a relay filter: **polarity** is a multi-letter
tag and therefore not relay-indexable (NIP-01), and **membership** cannot be expressed as a filter at
all because publishing is permissionless — anyone may publish an assertion pointing at our header. The
legitimacy gate is near-redundant, because step 1 already filtered headers by honored authority — keep
it anyway: it is what makes the resolver safe for any caller that supplies headers by another path.

> **Unverifiable and illegitimate assertions are never sourced in the first place.** The spec's read
> model distinguishes *unverifiable* (the assertion's descriptor header can't be resolved) from
> *illegitimate* (it resolves, but joins no honored authority). **Neither branch is reachable in this
> flow.** Step 1 fetches only headers already filtered by honored authority, so an un-honored header's
> assertions are never legitimate-checked; step 2 queries assertions **by** those headers' coordinates,
> so every candidate returned points at a header we already hold. `groupTaggingsByTarget` therefore
> never lands in either branch, and the fact that it drops unverifiable candidates silently
> (`classify.js:175`, where `classifyEventTaggings` would collect them) costs us nothing. Those branches
> matter for the **reverse** read — "what tags does this note carry?", scanned by target and thus
> namespace-agnostic — which this story does not perform.
>
> One residual edge: the resolver selects a candidate's header with `.find()` — the **first** `z`
> matching the descriptor pattern (`classify.js:73`, `:172`). A conforming assertion carries exactly one
> descriptor `z` (its `d` tag derives from a single slug), but nothing at the relay enforces that. A
> nonconforming assertion bearing two descriptor `z` tags would match our step-2 filter on ours, yet
> `.find()` could select the other tag's header — which we never fetched — silently dropping a note that
> validly carries `lfo-community`, decided by nothing but tag order. Not expected against today's
> publishers; noted so it is recognized if a note mysteriously fails to surface.

> **No dedupe is required.** The assertion `d` tag is deterministic
> (`event-tag-<slug>-<target8>-<asserter8>`) and kind 39999 is parameterized-replaceable, so
> `(tag, target, asserter)` addresses exactly one event; a flip from apply to dispute *replaces* the
> prior assertion. Since assertions live on a single relay, strfry enforces latest-wins and we only ever
> see the survivor. Therefore `applications.length` **is** the distinct-tagger count, and no member can
> appear in both `applications` and `disputes`. The SDK's "caller dedupes upstream" note
> (`classify.js`) is a warning for consumers scanning **across relays**; it does not apply to us. Do not
> reintroduce a `(pubkey, d)` latest-wins pass unless the tagging read is ever widened beyond one relay.

**4 — Fetch the notes by id.** `{ kinds: [1], ids: [...] }`. The tagged notes resolve on the tagging
relay; whether we also query the Provider-1 relays is an Architect decision (see Open questions). Note
bodies are kind-1 — non-replaceable, deduped by event id — so reading them from several relays raises
none of step 3's concerns.

**5 — Merge and integrate into the feed.** Wrap each note as a Provider-2 candidate carrying
**provenance** (`{ event, vias: [{ provider: 'event-tag', tag: 'lfo-community', applications: n }] }`),
union with Provider 1's pool **by event id**, assign `channels: ['lfo']`, sort the merged pool by
`created_at` descending, cap at `DISPLAY_LIMIT` (100). Provider-2 notes **skip the Haiku classifier**.

Cost: three relay round-trips (headers → assertions → notes) plus one HTTP call for the TA pubkey.

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
- [ ] Given a tagging assertion whose descriptor `z` names a header **outside** the set discovered in
  step 1 — whether because it joins no **honored authority** or because it cannot be resolved at all —
  then it does **not** admit the note. (Both cases are excluded at *sourcing* time, not by the resolver;
  see the read-flow note.)
- [ ] Given a note carrying an event-tag **other than** `lfo-community` (e.g. `stoicism`, `travel`), then
  Provider 2 does **not** admit it. Tag scope for this story is exactly one tag.
- [ ] Given **two** legitimate tagging headers for `lfo-community` authored by **different** pubkeys, and
  a member assertion referencing the **second** header, when the feed is built, then that note **is
  admitted** — headers are discovered at read time and assertions are unioned across all of them. No
  header coordinate is pinned as a constant.

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

- **Option A — raw relay + SDK (guide's recommendation; the flow specified above).** Subscribe to
  `wss://tags.brainstorm.world/relay` with `filterTaggingHeadersForTag` + `filterTaggingsUsingTag`, then
  run **`groupTaggingsByTarget`** with a trust predicate of "asserter ∈ LFO member set," then fetch the
  target kind-1 notes by id. No cap, no CORS, we own the trust decision. Costs: we vendor the SDK (or
  reimplement its filters) and issue several relay round-trips.
  *(The guide names `classifyEventTaggings`; that is the by-target reverse view. The by-tag forward view
  we need is `groupTaggingsByTarget`, added in Tapestry's event-tagging ADR 0008.)*
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
- **Discover the tagging header(s) at read time — do NOT pin a header coordinate.** (PO decision,
  2026-07-09; the integration guide's §5-A path.) Step 1 runs every read via
  `filterTaggingHeadersForTag`, and step 2 unions assertions across **all** discovered headers for the
  tag. Rationale: publishing is permissionless, so any member may mint a second `lfo-community` tagging
  header (e.g. via a different client); a pinned coordinate would render their taggings **silently
  invisible**, violating Tapestry's decentralized-first invariant. Pinning would have allowed steps 1
  and 2 to collapse into a single multi-filter REQ (3 round trips → 2); **that saving is explicitly
  declined.** Consequently step 3's legitimacy gate is near-redundant — keep it regardless, as the guard
  that makes the header input trustworthy for any future caller.
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

## Linked artifacts
- ADR: (filled in after Architecture phase — **not yet started**)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- **Story #2** — `2-curated-selection.md` (the policy story this unblocks)
- Protocol: `tapestry/protocols/drafts/event-taggings.md`; family spec `tapestry/protocols/drafts/tags.md`
- SDK: `tapestry/src/lib/event-tagging/` (public repo `github.com/nous-clawds4/tapestry`, branch `feat/tags`)
- Integration guide: `lfo-tagging-integration-guide.md` (external) — §5 read paths, §6 POV, §7 membership
- Related: ADR 0029 (feed data-layer boundary), ADR 0033 (server-side feed), ADR 0034 (channels)
