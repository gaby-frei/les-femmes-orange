# Review: npub-search Story 1 — identity search + vouch from the panel

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-07-31
**Diff:** `git diff a6d1738...HEAD` (head `edfb5f6`; implementation commits `6660dd8`, `ed436ee`, `5afb6d3`, `ea7cfb7` + spec/story records)
**Inputs:** story + amendments, ADR 0041 + amendments, test plan (15 cases, `tests/npub-search.spec.js`)

## Quality gates (run by reviewer, not trusted)

- [x] `node --test test/*.test.js` — **109/109 pass**. (The `builder-parity` failure flagged at
  implementation time is resolved: the `tapestry/` checkout is back on `feat/tags`, restoring the
  upstream SDK the drift-guard compares against. It was never a story defect.)
- [x] `PORT=3100 npx playwright test` — **135/135 pass** (exit code checked directly, not through a
  pipe), including all 15 npub-search cases and the full pre-existing suite (`apply-attestation`,
  `v1-shell`, `local-signer`, feed specs).
- [x] _Lint / typecheck / build not configured — skipped (house rule)._
- [x] Working tree clean at `edfb5f6`; branch level with `origin/feat/npub-search`.

## Spec adherence

- [x] Every AC has at least one passing test: placement/gating (T1), three-form resolution
  (T2/T3), candidate presentation as amended to row format (T4, T4b), metadata-less → vouchable
  with the PO's verbatim ⚠️ warning (T9), attest-from-panel wire shape + post-attest coherence
  (T10), already-verified status-only (T8), loading feedback (T5), non-identity dead end (T12),
  page integrity (T13), plus ADR-level pins: flat-parallel fan-out with hint sanitization (T6),
  pending/verified badges (T7/T8), decline/error recovery (T11), and the pending-grid regression
  tripwire (T14, green before and after the refactor).
- [x] Every PO amendment is reflected in both code and spec, with the story/test-plan/ADR
  amendment logs updated in the same commits: row format, earned NIP-05 ✓, "Not a member" badge,
  O3 rollback, warning copy (incl. the PO's hand-added ⚠️ prefix), grey warning color, label
  sizing.
- [x] No behavior beyond the story: search surface is Members-page only; no free-text path
  (story #2), no NIP-05 *input* form, no ranking.

## ADR adherence

- [x] All changes in `public/index.html` exactly as the implementation notes specify:
  `PROFILE_RELAYS` (search-path-only, commented), `decodeIdentity` (pure, checksum-guarded,
  wss-only/deduped/≤3 hints), `fetchSearchProfile` (cache-first, flat parallel, progressive
  resolve, hits backfill `_metaCache`, misses never negative-cached), `publishVouch` extraction
  with `applyLFOTag` byte-equivalent around it, `makeMemberCard` candidate mode, debounced
  controller with stale-sequence guard, overlay panel.
- [x] ADR amendments (2026-07-31) cover the deviations from the original sketch: vertical row
  list instead of horizontal tiles, earned NIP-05 ✓, O3 reversal.
- [x] No new dependencies; no server surface added; membership truth and feed sourcing untouched.

## Concept-graph integrity

- [x] No concept definitions changed; no firmware reinstall needed (ADR records this, with the
  concept-graph API unreachable at design time and the LFO handles documented in CLAUDE.md).
- [x] The attestation wire shape is the live-proven format, verified tag-for-tag by T10/T14.

## Things tests can't catch

- [x] No secrets, no debug logging, no commented-out code in the diff.
- [x] XSS: every interpolation in candidate/grid card HTML goes through `escHtml`
  (name, nip05, initials, hex, tagName); the warning line is a static string.
- [x] Injection: `verifyNip05` builds its URL from a charset-restricted domain match
  (`[\w.-]+` — no slashes/colons/@) with `encodeURIComponent` on the name; https-only.
  Relay hints are wss-only, deduped, capped at 3 — attacker-controlled nprofiles can only add
  bounded TLS relays.
- [x] Races: `_searchSeq` guard prevents stale searches or dismissed panels from painting;
  progressive-resolve repaints are strictly-newer-only; the dismiss listener runs on
  `pointerdown` with a detached-target guard (a real bug the spec caught at implementation time
  — a button replacing itself mid-click read as an outside click and wiped the panel).
- [x] Error paths: signer decline (silent restore), publish failure (inline error + 3s retry,
  idempotent d-tag), relay timeout (per-relay, bounded), profile-JSON parse failure (skipped,
  keeps prior newest).

## House rules check

- [x] No lint/typecheck tooling added.
- [x] JS-without-build preserved (all inline in `index.html`, matching the app's idiom).

## Findings

### Blocking
None.

### Non-blocking
1. **Verified-candidate row omits the attester** (`public/index.html` candidate branch) — the
   original AC wording said "and attester, where the grid would show it"; the PO's 2026-07-31
   row-format amendment (photo, name, address, badge only) supersedes it. Treated as a ratified
   deviation; noting it so the AC's older wording doesn't read as a miss.
2. **`vouchFromPanel` fire-and-forgets `loadMembersPage()`** (`public/index.html`) — by
   construction the caches are warm so it can't realistically reject, but a `.catch(() => {})`
   would make the no-unhandled-rejection guarantee explicit. Optional.
3. **A11y polish** — the invalid-input hint isn't `aria-live` and the panel has no
   `role`/labelling beyond the input's `<label>`. Fine for this story; worth folding into
   story #2's panel work when it becomes multi-result.
4. **Process note** — one intermediate commit (`5afb6d3`) landed while T9 was red because a
   piped test command masked the exit code; the very next commit (`ea7cfb7`) fixed the spec and
   the final state is green. No effect on the reviewed head.

## Verdict
**PASS** — every acceptance criterion (as amended by the PO through six ratified UI iterations)
is implemented and pinned by a passing test; the ADR contract is honored with its amendments
recorded; the pending-grid regression tripwire and the full pre-existing suite stay green; and
the one live-code refactor (`publishVouch`) is behavior-identical for existing users.
