# Review: note-tagging Story 2 — Apply a tagging attestation

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-13
**Diff:** `git diff df14266..HEAD` (implementation `5e5310b`, count-line amendment `0c256ba`, plan row `6e51db4`)
**Story:** `engineering-team/stories/note-tagging/2-apply-attestation.md` (amended: responsibilities flow, consent panel, count line)
**ADR:** `engineering-team/decisions/0040-apply-attestation.md` (amended: count line)
**Test plan:** `engineering-team/stories/note-tagging/2-apply-attestation.test-plan.md`

## Quality gates (run by reviewer, not trusted)
- [x] `npm run test:unit` — **109/109** (writeConfig arming + conformance gate, builder parity +
  validation, slug-keyed merge with applier union, payload `tagging` passthrough, re-shaped
  `taggedWith` pins, all prior suites).
- [x] `npm test` incl. Playwright — **110/110**: 12 apply-flow tests (incl. the §2 wire-shape
  capture at the signer boundary and the optimistic count), 8 pill tests (2 new count-line, inert
  pin untouched), the narrowed demo AC-5, and every prior spec.
- [x] **Live verification (production, 2026-07-13):** the PO applied `ask-lfo` to note `4c1b323e…`
  from this app with a second member key — the relay stored a perfectly-shaped assertion
  (`event-tag-ask-lfo-4c1b323e-16ea2a43`, descriptor → the real header, apply polarity), making it
  the first attestation ever published by the LFO app and the first note with two distinct
  appliers. Arming verified live (4 tags, real coords, runtime TA); relay write path additionally
  probed non-destructively (invalid-sig event → `OK false "invalid: bad event id"`, nothing stored).

## Spec adherence
- [x] All 15 ACs (13 original + 2 count-line) map to green tests per the coverage map; live
  evidence above covers the "verify an end-to-end publish from our app" implementation-phase
  requirement.
- [x] PO decisions honored: consent panel local-mode-only, every apply, exact fixed copy with the
  member's own npub-short; optimistic pill + toast; applied-marked-yet-retriable; "Applied by N
  members" copy; inert-pill fallback preserved (no #8 pin narrowed).
- [x] Never-mint: the client module deliberately excludes the mint-capable builders (the only
  `buildTagElement`/`buildTaggingHeader` occurrence in `public/` is the provenance comment saying
  so); arming-time conformance gating means an un-armable tag can never reach the builder.
- [x] Test supersession scoped exactly as planned: demo AC-5 narrowed; no-side-effects and gating
  demo pins retained and green.

## ADR adherence
- [x] D1: `writeConfig` built during step-1 processing, conformance-gated
  (`api/_lib/tagged.js` `armedHeaderFor`), returned on all successful paths and never on
  degradation; surfaced as additive `tagging` (`api/feed.js`); `taggedWith` entries carry
  `slug`/`appliers`.
- [x] D2: `public/lib/event-tagging.js` follows the `membership.js` UMD pattern; inner bodies
  adapted-verbatim with provenance header; **drift-guarded by the parity unit test against the
  in-repo upstream SDK** (deep-equal outputs incl. relay-hint case, matching validation throws).
- [x] D3: `build → LFOSigner.sign → publishEventToRelay(TAGGING_RELAY_URL)` — single relay, no
  orchestrator, `created_at` added at sign time (the builder is deliberately timestamp-free).
- [x] D4: optimistic update mutates note state only (`taggedWith`/`appliers`, `taggers`,
  `channels`); pills, filters, header counts, and the new count line all re-derive.
- [x] Diff scope = exactly the ADR's file list + amendment docs/tests (stat verified). Read-side
  vendored files untouched (byte-identical re-verified). No new dependencies. No firmware change.

## Things tests can't catch
- [x] Key handling unchanged: no new code touches nsec/ncryptsec; signing goes through the
  existing `LFOSigner` facade; the server gains no write surface and never sees a key.
- [x] XSS discipline: every relay-sourced string in the new UI (tag names/descriptions, consent
  copy interpolations, count line) enters the DOM via `textContent`; no `innerHTML` anywhere in
  the new paths.
- [x] No TA hardcode (grep clean); the pinned `EVENT_TAGS` author remains the tag identity per
  story scope.
- [x] Consent-panel absence in extension mode is structural (element created only in local mode,
  removed on hide) — pinned by test, not just styling.

## Findings
### Blocking — none.
### Non-blocking
1. `applyTagToNote` reads `_feed.tagging.taPubkey` — arming guarantees it exists whenever an
   option is clickable, but a defensive guard would make the invariant local. Polish only.
2. The consent panel is rebuilt per show (fine at this scale); if applies become frequent, a
   template could be hoisted. Not warranted now.

## Verdict
**PASS.** All 219 tests green under reviewer runs; the story's ACs, both PO decision sets, and
ADR 0040 (as amended) are fully honored; the write path is proven against production by the PO's
own live apply; the app's first write surface ships with keys client-side only, assertion-only
publishing, and the read pipeline as the arbiter of what counts.
