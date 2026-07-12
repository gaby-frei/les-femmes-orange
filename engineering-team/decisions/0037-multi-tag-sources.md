# ADR 0037: Multi-tag sources — batched fan-out over the #8 pipeline, config as the DList socket

**Status:** Accepted
**Date:** 2026-07-11
**Story:** `engineering-team/stories/community-feed/9-multi-tag-sources.md`

## Context

Story 9 widens Provider 2 (ADR 0036) from one pilot tag to four — `lfo-community`, `bitcoin`,
`nostr`, `ask-lfo` — all authored by the same pubkey, each mapping to a channel (`ask-lfo` to a
**new** channel/pill). The story fixes the semantics (mechanism identical per tag, channels unioned
on multi-tagged notes, one pill per tag, uniform four-pill degradation, classifier untouched) and
leaves the Architect two real choices: the **config shape** and the **query topology** (per-tag loop
vs. batched).

**Codebase facts:**
- `api/_lib/tagged.js` implements #8's pipeline for a single `tag` dep; its assertion step already
  unions across discovered headers via one multi-value `#z` REQ (ADR 0036).
- `api/_lib/merge.js` — `mergeCandidatePools` dedupes by event id **within and across pools**,
  unioning `channels`, concatenating `vias`, unioning `taggedWith` by name. This means a provider may
  emit one candidate *per (tag, note) pair* and the merge produces exactly the story's multi-tag
  union semantics with **zero changes**.
- Vendored `classify.js` — `groupTaggingsByTarget` takes a single `tag` identity + a `headers` subset;
  its tag-identity gate makes per-tag resolution over a shared candidate pool safe.
- `public/index.html:1411–1415` — the channel banner is three static `.feed-channel` buttons;
  `setupChannelBanner` (`:2149`) wires toggles/disable generically over `querySelectorAll`, so a
  fourth button needs **no JS change**, and the uniform-degradation decision is automatic.
- `api/feed.js:63` — `CHANNELS = ['bitcoin','nostr','lfo']` is Provider 1's score→channel set. Left
  untouched, no Provider-1 note can ever carry `ask-lfo` — the story's exclusivity AC holds by
  construction.
- Live relay state (verified 2026-07-11): four tag-elements, four honored headers (one per tag, all
  by `6db8a13f…`), assertions 10/5/13/6.

No concept definitions change. Concept handles were cross-checked against the live deployment's
Concept Graph API during planning (LFO has no local stack).

## Options considered

### Decision 1 — config shape

**Option A — `EVENT_TAGS` array with per-tag `channels: [...]` (chosen).**
```js
const TAG_AUTHOR = '6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597';
const EVENT_TAGS = [
  { authorPubkey: TAG_AUTHOR, slug: 'lfo-community', channels: ['lfo'] },
  { authorPubkey: TAG_AUTHOR, slug: 'bitcoin',       channels: ['bitcoin'] },
  { authorPubkey: TAG_AUTHOR, slug: 'nostr',         channels: ['nostr'] },
  { authorPubkey: TAG_AUTHOR, slug: 'ask-lfo',       channels: ['ask-lfo'] },
];
```
`channels` is an **array** even though every entry is 1:1 today: story #2's tag↔channel map is
possibly 1:many, and the merge already unions arrays — so the DList-projection socket costs nothing
now and saves a shape migration later. `authorPubkey` stays per-entry (not hoisted) because nothing
guarantees future curated tags share an author.

**Option B — keep `channel` singular (strict #8 mirror).** Rejected: forces a config-shape change in
#2 for zero savings today.

### Decision 2 — query topology

**Option A — batched fan-out, single provider call (chosen).** One pipeline pass over all tags:
1. Round trip 1 (two parallel REQs): headers `{ kinds:[39999], '#a': [all 4 tag coords],
   '#z': [39998:<TA>:tagging-with-specific-tag] }`; tag-elements `{ kinds:[39999],
   authors:[unique tag authors], '#d': [all 4 slugs] }` (metadata; non-critical).
2. Partition headers per tag by their `a` tag; round trip 2: **one** assertions REQ,
   `{ kinds:[39999], '#z': [every discovered header coord] }`.
3. Resolve **per tag** in memory: `groupTaggingsByTarget({ candidates: allAssertions,
   headers: tagHeaders[i], tag: tags[i], … })` — the resolver's descriptor-resolution +
   tag-identity gates partition correctly; per-tag gate independence (a dispute on tag X never
   touches tag Y) falls out of per-tag polarity bucketing.
4. Round trip 3: one bodies fetch for the union of kept ids across tags (tagging relay ∪ noteRelays,
   any-ok, as revised in ADR 0036).
5. Emit one candidate per (tag, kept target): `{ event, channels: tag.channels,
   vias: [{ provider:'event-tag', tag: slug, applications }], taggedWith: [tagMeta(slug)] }`.
   The existing merge unions same-note entries — no new union code anywhere.

*Pros:* wire cost stays exactly #8's — 3 sequential round trips, 4–6 REQs total (vs. up to 16 for a
loop); one `relayOk` covering one pipeline (headers ok ∧ assertions ok ∧ (no ids ∨ any body relay
ok)); tag-element failures degrade per-tag to the #8 slug fallback.
*Cons:* `tagged.js` changes from `tag` to `tags` internally (partition + per-tag resolve loop) rather
than staying byte-stable.

**Option B — call the #8 single-tag pipeline once per tag, in parallel.** `tagged.js` untouched;
handler maps tags → four provider calls → four pools.
*Pros:* zero provider changes. *Cons:* 4× the sockets/REQs to the same relay (16 vs ~6) for identical
results; four TA-gated pipelines racing the same cache; `relayOk` becomes four flags needing an
aggregation rule anyway. Rejected — the batched form is what ADR 0036's one-REQ assertion decision
already chose at smaller scale.

### Decision 3 — client channel surface

**Option A — add one static button (chosen).** `<button class="feed-channel"
data-channel="ask-lfo" aria-pressed="false">Ask LFO</button>` after the LFO Community button
(`public/index.html:1414`). Toggle wiring, union filtering, empty-state, header recompute, and the
uniform disable are all generic over `.feed-channel` — no JS change.
**Option B — render the banner from a channels config.** Rejected: dynamic pills are #2's DList
territory (story's out-of-scope), and a fourth static button is a one-line diff.

## Decision

`EVENT_TAGS` config array with per-tag `channels` arrays (the DList-projection socket);
`fetchTaggedCandidates` generalized to a **single batched multi-tag pass** (same 3-round-trip
envelope as #8); the Ask LFO channel added as **one static banner button**; Provider 1's `CHANNELS`
set and the classifier untouched.

## Consequences

- Story #2 swaps `EVENT_TAGS` for a DList read and gets 1:many channel mapping without a shape
  change; `vias` now carries per-tag applications across four tags — richer ranking input.
- Wire cost unchanged vs. #8 (3 sequential round trips); assertion volume ~34, still trivially
  per-request (no caching, unchanged PO constraint).
- The provider's candidate list may contain multiple entries for one note (one per tag); this is a
  **contract with the merge** (dedupe-and-union), which the seam already defines. Any future
  provider consumer bypassing `mergeCandidatePools` must be aware.
- `relayOk` remains a single flag for the whole Provider-2 pipeline — a per-tag partial failure is
  invisible in `relayStatus` (acceptable: headers/assertions/bodies are shared queries; only
  tag-element metadata degrades per-tag, to the slug fallback).
- **Firmware reinstall required?** No — no concept definitions change.

## Implementation notes

- `api/feed.js` — replace `EVENT_TAG` with `EVENT_TAGS` (exact array above); handler passes
  `tags: EVENT_TAGS` to the provider; `CHANNELS` (line 63) untouched.
- `api/_lib/tagged.js` — deps take `tags` (array) instead of `tag`:
  - Step-1 filters: headers REQ composes `'#a'` from every `tagElementAddr(authorPubkey, slug)`
    (vendored `handles.js`) with the single honored `'#z'`; elements REQ uses
    `authors: [...new Set(authors)]`, `'#d': [...slugs]`. Both in one `Promise.all` with the
    existing criticality split (headers critical, elements not).
  - Partition: `headersByTag[i]` = headers whose `a` tag equals tag *i*'s coordinate (`TAG_A_RE`
    semantics — match on the exact coord string); `metaBySlug` = latest element per (author, slug) →
    `tagMetaFrom` per tag with per-tag slug fallback.
  - Steps 2–4 as in Decision 2A. Keep the `:null`-guard (or the cleaner `tagVal != null` filter —
    review finding #2) when composing header coords.
  - Step-5 wrap: `channels: tag.channels` (array copy, not `[tag.channel]`).
  - Degradation contract unchanged: never throws; `{ candidates: [], relayOk: false }` on TA/headers/
    assertions/all-bodies failure; zero-header and zero-admissible cases return `relayOk: true`.
- `public/index.html` — one line at `:1414`: the Ask LFO button (`data-channel="ask-lfo"`,
  label "Ask LFO"). No CSS (existing `.feed-channel` rules), no JS.
- No changes to `merge.js`, `ta.js`, vendored files, `select.js`, `classify.js` (Haiku), or the
  pill-row renderer (already multi-entry).

Test seams (for the Tester): the provider still takes every external as a dep — the URL-aware
`fakeRelaysByUrl` fixture covers multi-relay bodies; multi-tag stores just add the extra
headers/elements/assertions events. Feed-level fakes inject multi-tag candidate pools directly.

## Out of scope

- Curated tag DList, general tag↔channel map, endorsement ranking — story #2 (this ADR builds its
  socket, decides none of it).
- Dynamic channel-banner rendering; new Haiku topics; write path & signing.
- Per-tag `relayOk` reporting (single-flag contract kept; revisit only if tag sets stop sharing
  queries).
