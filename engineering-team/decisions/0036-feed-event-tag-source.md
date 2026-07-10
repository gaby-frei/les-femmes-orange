# ADR 0036: Event-tag source (Provider 2) — vendored SDK read path + generic merge seam

**Status:** Accepted
**Date:** 2026-07-09
**Story:** `engineering-team/stories/community-feed/8-event-tag-source.md`

## Context

Story 8 adds a second feed source: kind-1 notes carrying an `lfo-community` event-tagging assertion
applied by a verified LFO member. The read flow is normative in the story (six steps: TA pubkey →
header discovery → assertion fetch → resolve/filter → note fetch → merge), and the planning phase
already decided the load-bearing constraints: runtime TA resolution, honored authority = the runtime
TA only, header discovery over pinning, client-side member filter, no caching, classifier bypass,
`channels: ['lfo']`, provenance-annotated candidates, never fail the request.

What the Architect owns here:

1. **Which read path** realizes the flow (integration guide §5: raw relay + SDK vs. REST `for-tag`).
2. **How the SDK enters this repo** (the story flags vendoring as a real decision needing an ADR).
3. **Where note bodies are fetched** (step 4 — the one implementation choice the story leaves open).
4. **The shape of the provider/merge seam** inside `buildFeedPayload` (ADR 0029/0033/0034 contracts
   must hold; the seam must survive Story #2 adding ranking policy without rework).

**Codebase facts** (read before deciding):

- `api/feed.js` — `buildFeedPayload(deps)` is a pure orchestrator with all externals injected;
  `handler` wires real deps. Provider 1 is three sequential stages inside it:
  `fetchCandidates → classifyNotes → selectRelevant` (`api/feed.js:49–52`), then note-shaping derives
  `channels` from per-topic scores (`api/feed.js:63–76`). `relayStatus` is handler-local state
  (`api/feed.js:131–143`).
- `api/_lib/relay.js` — `queryRelayStatus(url, filter, timeout)` → `{ events, ok }` and
  `queryRelays(urls, filter, timeout)` → deduped union. Global-WebSocket, no deps (ADR 0033).
- `tapestry/src/lib/event-tagging/` (public repo `github.com/nous-clawds4/tapestry`, branch
  `feat/tags`, local clone at commit `42596656`) — the SDK. The read-side surface is exactly three
  files, all dependency-free CJS:
  - `handles.js` (38 lines, zero imports) — coordinate composers, TA pubkey always a parameter.
  - `filters.js` (55 lines, imports only `handles.js`) — `filterTaggingHeadersForTag`,
    `filterTaggingsUsingTag`.
  - `classify.js` (216 lines, **zero imports**) — `groupTaggingsByTarget` (the by-tag forward
    resolver this story needs, per Tapestry's event-tagging ADR 0008) + `classifyEventTaggings`.
  The other files (`apply.js`, `builders.js`, `taggings.js`, `applicability.js`, `slug.js`) are the
  write path and Brainstorm-UI projection layers — out of scope (this story reads only).

**Concept graph** (live deployment `tags.brainstorm.world`, checked 2026-07-09): TA pubkey resolves to
`a68dbf56…b599`; both `39998:<TA>:nostr-event-tag` and `39998:<TA>:tagging-with-specific-tag` exist as
concept headers. No concept is defined or mutated by this story.

**Prior-ADR contracts honored (none superseded):** ADR 0029 payload shape; ADR 0033 request-time
`/api/feed` + KV score cache (untouched — Provider 2 bypasses the classifier, so the KV surface never
sees its notes); ADR 0034 channel derivation for Provider-1 notes and the `channelsAvailable`
degradation signal (unchanged semantics — it remains a *classifier* health signal, computed from
Provider 1 only); ADR 0032 membership relay set (reused as-is by `computeMembers`).

## Options considered

### Decision 1 — read path

**Option A — raw relay + SDK resolver (chosen).** Query `wss://tags.brainstorm.world/relay` with the
SDK's filters (headers, then assertions), resolve with `groupTaggingsByTarget` under
`isAsserterTrusted = memberSet.has`, fetch the target kind-1 notes by id.
*Pros:* no 50-note cap; no dependence on Brainstorm-side POV provisioning (which is un-provisioned and
silently counts everyone — guide §6.2); the trust predicate is exactly the member set we already
compute; pure resolver → trivially unit-testable with fakes; matches the story's normative flow and
the guide's own recommendation.
*Cons:* three relay round-trips; we take on ~310 lines of vendored resolver code.

**Option B — proxy `GET /api/event-tags/for-tag`.** One HTTP call from our server returns resolved,
enriched notes.
*Pros:* no vendored code, one round-trip.
*Cons:* POV-filtered by an un-provisioned POV → counts every asserter, so we must re-filter by member
set anyway — which requires re-fetching the raw assertions to learn each asserter, defeating the
point; hard-capped at the 50 most-recent notes with no pagination; couples feed correctness to
Brainstorm API availability *and* its POV configuration. Rejected.

### Decision 2 — how the SDK enters the repo

**Option A — vendor the three read-side files verbatim (chosen).** Copy `handles.js`, `filters.js`,
`classify.js` unmodified into `api/_lib/event-tagging/`, plus a `PROVENANCE.md` recording repo,
branch, commit (`42596656`), date, and the local-diff rule.
*Pros:* dependency-free CJS fits the JS-without-build rule; Vercel's file tracing bundles them with
the function; drift against upstream is checked with a plain `diff -r` because the files are verbatim;
`classify.js` has zero imports so the subset is closed.
*Cons:* a third-party snapshot to keep an eye on; upstream fixes arrive only by re-copying.

**Option B — `require` from the `tapestry/` clone in-repo.** Zero duplication.
*Cons:* couples the deployed serverless bundle to a repo documented as a *read-only reference* whose
branch/commit may be moved for unrelated lookup purposes; a `git pull` in `tapestry/` would silently
change production behavior. Rejected.

**Option C — reimplement a minimal resolver (~100 lines).** No third-party code.
*Cons:* re-derives subtle, already-tested gating (descriptor regex, polarity buckets, honored-`z`
matching, target extraction) and loses byte-for-byte diffability against the normative SDK. Rejected.

### Decision 3 — where note bodies are fetched (the story's open choice)

**Option A — tagging relay only (chosen — PO direction, 2026-07-09).**
`queryRelayStatus(TAGGING_RELAY, { kinds:[1], ids })` — one socket, the relay we already hold open
conceptually for steps 1–2.
*Pros:* simplest; every tagged note verified to date resolves there; keeps Provider 2's failure
domain to a single relay (one `relayStatus` entry tells the whole story).
*Cons:* a future tagging whose note body never propagated to the tagging relay yields an id with no
body — that note silently doesn't surface. Accepted for now; the *durable* fix is not a hardcoded
relay union but **relay hints**: tagging assertions' `e`/`a` tags (and NIP-65 outbox data) can carry
relay URLs naming where the target lives, and a future story should fetch note bodies from those
hints. Deferred (see Out of scope).

**Option B — tagging relay ∪ feed relays.** Union over `FEED_RELAYS` (nos.lol, damus) closes part of
the propagation gap for free (kind-1 is non-replaceable, deduped by id, so a multi-relay read is
safe). Rejected for now: it papers over the gap with a static relay list rather than following the
events' own hints, and today it buys nothing (all tagged notes resolve on the tagging relay). If
notes start going missing before hint-following lands, this is the cheap interim widening.

### Decision 4 — the provider/merge seam

**Option A — generic merge module over N candidate pools; Provider 1 stays inline (chosen).**
A new pure `mergeCandidatePools(pools, { displayLimit })` flattens N arrays of
`{ event, channels, vias }`, dedupes by `event.id` (unioning `channels` and concatenating `vias`),
sorts `created_at` desc, slices. `buildFeedPayload` shapes Provider 1's existing pipeline output into
that candidate contract and merges it with the injected Provider-2 pool. Adding/removing a provider =
adding/removing one pool input; merge and ordering never change (the seam AC).
*Pros:* minimal diff to code tested by stories 5/6/7; the seam contract (provenance-annotated
candidates) is exactly what Story #2 needs to rank on later.
*Cons:* Provider 1 is not yet itself an extracted "provider function" — full symmetry is deferred.

**Option B — full provider registry** (extract Provider 1 into its own module, orchestrate
`providers[]` uniformly). *Pros:* symmetric. *Cons:* churns the classifier/`channelsAvailable`/KV
wiring for zero behavioral gain; no acceptance criterion requires it. Rejected — revisit in Story #2
if ranking policy wants a uniform shape.

## Decision

**Option A on all four axes:** raw-relay read path with the SDK's `groupTaggingsByTarget`; the three
read-side SDK files vendored verbatim into `api/_lib/event-tagging/`; note bodies fetched from the
tagging relay only (relay-hint following deferred); a generic pure merge layer with Provider 1 kept
inline.

## Consequences

- Story #2 gets its mechanism: `vias[{ provider, tag, applications }]` provenance is in place to rank
  on, and the merge layer is provider-count-agnostic.
- We own a 3-file third-party snapshot; `PROVENANCE.md` + verbatim copies make drift auditable. A
  future SDK release as an npm package would supersede the vendoring.
- Request latency adds 3 sequential relay round-trips on the Provider-2 branch (headers →
  assertions → note bodies, all against the tagging relay) plus the cached TA HTTP call, but the
  branch runs in parallel with Provider 1's fetch+classify, so wall-clock impact is bounded by
  `max(P1, P2)`, and P2's volume today is 1 header + 10 assertions.
- The `relayStatus` contract gains one entry (the tagging relay). The client renders status dots from
  the array as-is, so no client change is required.
- `fetchMetadata` widens from member pubkeys to members ∪ displayed authors, so a Provider-2 note by a
  non-member renders with name/avatar when its kind-0 is on the feed relays (falls back to npub-short
  otherwise, the existing behavior).
- **Firmware reinstall required?** No — no concept definitions change.

## Implementation notes

Constants (in `api/feed.js`, beside the existing config block):

```js
const TAGGING_RELAY = 'wss://tags.brainstorm.world/relay';
const TA_PUBKEY_URL = 'https://tags.brainstorm.world/api/assistant/pubkey';
const EVENT_TAG = { authorPubkey: '6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597',
                    slug: 'lfo-community', channel: 'lfo' };   // pilot parameters, Story 8 table
```

(`EVENT_TAG.authorPubkey` is the *tag's* identity — pinning it is the story's pilot scope, not a TA
hardcode. The TA pubkey itself is never a literal anywhere.)

New files:

- `api/_lib/event-tagging/{handles,filters,classify}.js` — **verbatim** copies from
  `tapestry/src/lib/event-tagging/` @ `42596656` (`feat/tags`). Do not edit; local changes require
  updating `PROVENANCE.md`.
- `api/_lib/event-tagging/PROVENANCE.md` — source repo, branch, commit, copy date, refresh procedure
  (`diff -r` against upstream).
- `api/_lib/ta.js` — `getTaPubkey({ url, fetchImpl, timeoutMs })`: GET, parse `{ pubkey }`, validate
  64-hex. **Module-scope cache of the resolved value only on success** (per-process, per story);
  failures are not cached and return `null`. Export a `_reset()` for tests.
- `api/_lib/tagged.js` — `fetchTaggedCandidates(deps)` where deps =
  `{ getTaPubkey, queryRelayStatus, memberSet, tag, taggingRelay }`.
  Returns `{ candidates, relayOk }`; **never throws** (any failure → `{ candidates: [], relayOk: false }`).
  Steps:
  1. `taPubkey = await getTaPubkey(...)`; null → degrade (AC: no hardcoded fallback).
  2. Headers: `queryRelayStatus(taggingRelay, filterTaggingHeadersForTag({ tagAuthorPubkey, slug, taPubkey }))`.
     Zero headers → `{ candidates: [], relayOk }`.
  3. Assertions, one REQ: `{ kinds: [39999], '#z': headerCoords }` where `headerCoords` are the
     **discovered** headers' real coordinates (`39999:${h.pubkey}:${dTag(h)}`) — one filter, multiple
     `#z` values, unioning across all headers (the story's no-pinning decision; equivalent to
     `filterTaggingsUsingTag` per header when `d` follows convention, robust when it doesn't).
  4. Resolve: `groupTaggingsByTarget({ candidates, headers, honoredAuthorities: [taPubkey],
     isAsserterTrusted: (pk) => memberSet.has(pk), tag })`. Keep `targets` with
     `applications.length >= 1` **and** `target.id` (kind-1 ids; addressable targets are out of story
     scope). Ignore the `mine` channel (no viewer server-side).
  5. Notes: `queryRelayStatus(taggingRelay, { kinds: [1], ids }, timeout)` — tagging relay only
     (Decision 3); `noteRelays` is not a dep. An id whose body doesn't resolve is dropped silently.
  6. Wrap: `{ event, channels: [tag.channel], vias: [{ provider: 'event-tag', tag: tag.slug,
     applications: t.applications.length }] }`.
- `api/_lib/merge.js` — `mergeCandidatePools(pools, { displayLimit })`: flatten → dedupe by
  `event.id` (first occurrence wins the event object; `channels` unioned as a set; `vias`
  concatenated) → sort `created_at` desc (tie-break by id for determinism) → slice. Pure.

Changes to `api/feed.js`:

- `buildFeedPayload(deps)` gains `fetchTaggedCandidates` (default: `async () => ({ candidates: [] })`
  so existing tests pass unchanged). Orchestration:
  `computeMembers` → `Promise.all([P1 pipeline as today, fetchTaggedCandidates(memberSet)])` →
  shape P1's `selected` into `{ event, channels: score-derived, vias: [{ provider: 'hashtag' }] }` →
  `mergeCandidatePools([p1Pool, p2Pool], { displayLimit })` → note-shaping over the merged list
  (each note keeps its candidate's `channels`; Provider-2 notes never consult scores).
- `memberCount` = distinct authors of the **merged displayed** notes (same rule as today, now over
  the merged list — deliberately unfiltered per the story's Decided constraints).
- `fetchMetadata` called with `[...new Set([...memberPubkeys, ...displayedAuthors])]`.
- `channelsAvailable`: computed exactly as today, from Provider-1's `selected`/scores only.
- `handler`: wire `fetchTaggedCandidates` with real deps; append
  `{ url: TAGGING_RELAY, ok: relayOk }` to `relayStatus` (`ok:false` covers TA-fetch failure, relay
  failure, and timeout — the AC's visible-outage requirement).
- Member set for the trust predicate: reuse `computeMembers()` output as-is (it excludes the
  bootstrap seed — acceptable: the seed is a bootstrap key, not an active tagger; noted, not changed).

Test seams (for the Tester, not prescriptive): `mergeCandidatePools` and the vendored `classify.js`
are pure; `fetchTaggedCandidates` takes every external as a dep; `buildFeedPayload` keeps the existing
fakes pattern — no live relays in CI.

Known edge inherited from the SDK (story read-flow note): the resolver selects a candidate's
descriptor with `.find()` (first matching `z`); a nonconforming double-descriptor assertion could
resolve to the wrong header and be dropped. Accepted — recognized, not mitigated, per the story.

## Out of scope

- Ranking on provenance, tag DLists, tag↔channel maps, per-member caps — Story #2 (this ADR only
  guarantees the `vias` seam it will consume).
- The write path (`apply.js`, `builders.js`, signer wiring) — future story; not vendored.
- **Relay-hint note fetching** — following relay URLs carried in assertion `e`/`a` tags (and/or
  NIP-65 outbox lookups) to fetch note bodies from wherever the target actually lives. This is the
  durable answer to Decision 3's propagation gap; a future story, triggered if tagged notes start
  failing to resolve on the tagging relay.
- Caching of tagging data (PO decision: per-request reads) and any KV surface for Provider 2.
- Publishing the member Trusted List / LFO House Assistant / Brainstorm-side POV provisioning.
- Any change to Provider 1's relays, hashtags, classifier, threshold, or channel derivation.
