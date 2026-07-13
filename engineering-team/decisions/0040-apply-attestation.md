# ADR 0040: Apply attestation — server-armed modal, browser-vendored builders, assertion-only publish

**Status:** Accepted
**Date:** 2026-07-13
**Story:** `engineering-team/stories/note-tagging/2-apply-attestation.md`

## Context

Story note-tagging #2 wires the demo modal's "Search existing" to a real apply: four supported
tags, member-signed (both signer modes via `LFOSigner`), one kind-39999 assertion published to the
tagging relay (guide §2/§4), assertion-only (never mint), optimistic pill + toast, local-mode
consent panel with fixed PO copy. The story's Responsibilities amendment fixes the client/server/
Brainstorm split; this ADR decides the four implementation-shaped questions inside it.

**Codebase facts:**
- `LFOSigner` (`public/index.html:1561`) already abstracts extension vs. local (NIP-49
  ncryptsec-at-rest, in-memory sk while unlocked) behind one `sign(unsigned)` call, and
  `publishEventToRelay` (`:1863`) already implements EVENT→OK publishing — both proven by the
  membership-attestation flow (`applyLFOTag`, `:1901`).
- Provider 2 (`api/_lib/tagged.js`) already fetches, per request, everything the modal needs:
  runtime TA, the four tag-elements (names/descriptions), the discovered tagging headers, and
  per-target applier identities.
- The SDK's `buildEventTaggingAssertion` (`tapestry/src/lib/event-tagging/builders.js:121`) is the
  §3-sanctioned composer; its closure is `builders.js` + `slug.js` + `handles.js`. It is **CJS**,
  and the client is intentionally JS-without-build — it cannot `require`. Precedent for sharing
  logic into the browser: `public/lib/membership.js` (script-tagged by the client, `require`d by
  `api/feed.js`).
- `apply.js` (the §3 orchestrator) mints missing elements/headers — the story forbids minting, so
  it is **not** wanted even where convenient.
- All four live headers follow the `d = tagging:<slug>-tagging` convention (verified), which is the
  precondition for the SDK builder's descriptor derivation to reproduce the discovered coordinate.

## Options considered

### Decision 1 — how the modal gets its data (TA, tags, headers, applied-state)

**Option A — server arms via the feed payload (chosen).** Provider 2 returns, alongside
candidates, a `writeConfig`: `{ taPubkey, tags: [{ authorPubkey, slug, name, description,
headerAuthorPubkey, headerCoord }] }`, which the handler surfaces as an additive top-level
`tagging` field on the payload. A tag is included **only if** its discovered header's coordinate
equals the SDK convention (`taggingHeaderAddr(headerAuthor, slug)`) — a nonconforming or missing
header keeps the tag out of `writeConfig`, which *is* the story's "header cannot be discovered →
fail gracefully, never mint" gate, enforced at arming time. Per-note applied-state: each
`taggedWith` entry gains `slug` and `appliers` (pubkeys) — additive, per the #10 precedent.
*Pros:* zero extra round trips (the provider already holds all of it); the §5 CORS rule satisfied
by construction; applied-state truthful from relay data.
*Cons:* payload grows slightly; `tagging` absent when Provider 2 degrades → modal shows an
"unavailable right now" state (correct: no TA → could not compose handles anyway).

**Option B — client discovers via relay WebSocket.** CORS-legal but duplicates the server's
discovery logic in the browser, adds client round trips, and re-opens the trust/conformance checks
client-side. Rejected.

### Decision 2 — how the client builds the assertion (the §3 "don't hand-roll" rule vs. no-build)

**Option A — browser-shared vendored builders (chosen).** New `public/lib/event-tagging.js`
following the `membership.js` dual-environment pattern: a UMD-style wrapper whose **inner logic is
copied verbatim** from `slug.js`, the needed `handles.js` composers, and
`buildEventTaggingAssertion` (`feat/tags` @ `42596656`), with a provenance header and an entry in
`api/_lib/event-tagging/PROVENANCE.md`. Client composes the unsigned assertion locally with the
armed `writeConfig` values.
*Pros:* honors §3/§9 (SDK shapes, not hand-rolled) within the no-build constraint; the descriptor
the builder derives is guaranteed to match the discovered header by Decision 1's conformance gate.
*Cons:* wrapper means adapted-verbatim rather than byte-verbatim — mitigated by keeping the inner
function bodies untouched and diffable, documented in PROVENANCE.
**Option B — hand-roll in `index.html`** (the `applyLFOTag` precedent). Rejected: the story
explicitly binds to the SDK shapes; hand-rolling is what §9 warns against for this format.
**Option C — server builds the unsigned event via a new endpoint.** Rejected: event composition is
pure; a network hop buys nothing and puts our server in the signing loop's critical path.

### Decision 3 — publish transport and orchestration

**Chosen:** reuse `publishEventToRelay` against a client-side `TAGGING_RELAY` constant (single
relay, per guide §1 — tagging events live nowhere else). No `apply.js`: the flow is
`build → LFOSigner.sign → publishEventToRelay`, assertion only. Success = relay `OK true`;
`OK false`/timeout → inline error + retry (idempotent by deterministic `d`). Alternative (multi-
relay fan-out like `applyLFOTag`) rejected: assertions are single-home by design; fanning out would
contradict the read path's single-relay model.

### Decision 4 — optimistic update shape

**Chosen:** on `OK true`, mutate the in-memory note object only: append/extend the tag's
`taggedWith` entry (adding `me` to its `appliers`), add `me` to `note.taggers`, union the tag's
channels into `note.channels`, then re-render. Pills, channel filtering, and the
active-taggers header line all re-derive from that state with **zero new display logic**; the next
feed load replaces it with relay truth. Alternative (trigger a full feed re-fetch on success)
rejected as the primary path — slower and jarring — but remains the natural recovery if the
optimistic write ever proves unreliable.

## Decision

Server-armed `tagging` payload with arming-time header-conformance gating (D1); browser-shared
adapted-verbatim builders in `public/lib/event-tagging.js` (D2); single-relay
sign-and-publish reusing the existing helpers, no orchestrator (D3); state-mutation optimistic
update (D4). Consent panel per the story's fixed copy: shown iff `LFOSigner.mode === 'local'`,
every apply, as a content swap inside the existing modal.

## Consequences

- The write path adds **no server write surface** — the server's only new job is exposing data it
  already fetches. Keys never leave the client; the publish is client→relay.
- `taggedWith` entries gain `slug`/`appliers` — additive; pre-#2 clients unaffected. Story
  `curation-policy/#1` gets per-tag applier identity in the payload as a side effect.
- The arming-time conformance gate means a future nonconforming header silently removes that tag
  from the *write* UI while the *read* path still counts it — asymmetry accepted and documented
  (write requires the SDK-derivable coordinate; read honors discovered reality).
- Test supersession per the story: `tests/note-tagging.spec.js`'s "nothing published" pin narrows
  to Apply-new + cancel paths; the Tester stubs `window.LFOSigner` / `publishEventToRelay` /
  `getFeed` for the e2e flows (both signer modes, consent panel, errors).
- **Firmware reinstall required?** No — no concept definitions change.

## Amendment (2026-07-13) — pill count line
The story amendment adds "Applied by N members" inside the pill's existing description panel,
computed from `taggedWith[i].appliers` — **display-only; zero server change** (the data is this
ADR's D1 payload extension). Inert-pill fallback unchanged (PO). `makeFeedNote()`'s panel becomes
two DOM children (description + count line, both `textContent`); count omitted when `appliers` is
absent/empty. Optimistic applies increment it for free (D4 mutates `appliers`).

## Implementation notes

- `api/_lib/tagged.js` — build `writeConfig` during the existing step-1 processing (headers +
  elements already in hand); conformance-check each tag's headers; return
  `{ candidates, relayOk, writeConfig }`. Add `slug`/`appliers` to `taggedWith` entries (appliers =
  the same distinct-applier set already computed per target for `taggers`, but per tag).
- `api/feed.js` — surface `tagging: writeConfig` as an additive top-level payload field (absent on
  Provider-2 degradation); `merge.js` unions `taggedWith` by `name` today — keying by `slug` once
  entries carry it (safer identity; same behavior for the four tags).
- `public/lib/event-tagging.js` — NEW, dual-environment wrapper; inner bodies verbatim from
  `slug.js` / `handles.js` composers / `buildEventTaggingAssertion`; provenance header + PROVENANCE.md
  entry. Script-tag it in `index.html` (no module build).
- `public/index.html` — `TAGGING_RELAY` client constant; Search-existing list rendered from
  `_feed.tagging` (DOM/`textContent` — relay-sourced strings); applied-state from
  `taggedWith[].appliers` ∪ session-applied set; consent panel (local mode, every apply, PO copy,
  member npub-short via existing `hexToNpubShort`); `Sign & publish` → build (vendored builder) →
  `LFOSigner.sign` → `publishEventToRelay(TAGGING_RELAY, …, 8000)` → optimistic mutation + toast;
  error states per story ACs; "Apply new" placeholder copy updated. Modal buttons/copy built with
  `textContent`, never `innerHTML` interpolation of tag metadata.
- Naming: descriptive per PO direction (e.g. `supportedTags`, `applyTagToNote`, `consentPanel`).

## Out of scope

Disputes / revocation / minting (elements, headers, "Apply new"); relay-wide tag discovery;
multi-relay assertion fan-out; any read-pipeline trust change; server-side publish proxying.
