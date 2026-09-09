# Story 1: Trust-weighted closure and sign-in gate

**Status:** Approved (PO, 2026-09-09 — "Proceed through ADR and tests")
**Created:** 2026-09-09
**Type:** Feature
**Epic:** `trust-weighted-membership` (new — this is its first story)
**Book:** `engineering-team/audits/trust-weighted-membership/book.md` — Open, acceptance-frame
**Branch:** `feat/trust-weighted-membership`

## Background

Today one vouch from any verified member admits anyone. The Hub does not distinguish between an
applicant the community's own web of trust already regards highly and a complete unknown; both
need exactly one vouch. At intake, 51 of the 52 verified members rest on a single vouch.

This story makes the number of vouches a pubkey needs depend on its **trust standing from the
house point of view** — the same GrapeRank score the trust chips already display, from the same
community perspective. Trusted people keep a low bar, unknowns face a higher one, and a member's
vouch remains the only way in: a high score lowers the requirement to one vouch, never to zero.

The membership verdict stays **memoryless**. Nothing about who is a member is stored anywhere;
every load recomputes it from the live vouch events and the live scores. That is what makes the
policy honest in both directions: an applicant whose standing rises needs fewer vouches from
that moment on, and a member whose standing falls is held at the door until they regain the
required count. The PO accepts both, including the day-one rollback of the 11 members whose
single vouch no longer suffices (they become pending; second vouches are collected
operationally before merge).

Because the verdict now needs scores, **the trust provider becomes a hard dependency of
sign-in**. When it cannot answer, the Hub must say so rather than guess — no silent fallback to
a different perspective or algorithm, since that would change who is a member.

**Who is affected:** everyone who signs in. Verified members see no change unless their standing
and vouch count no longer meet the bar. Pending applicants and non-members learn exactly how many
vouches they need. Members whose standing slipped see the same pending state.

## User-facing description

As a member of Les Femmes Orange, I want the number of vouches an applicant needs to reflect how
the community's own web of trust already regards them, so that people we collectively trust join
easily while unknowns need broader endorsement — and as an applicant, I want to be told exactly
how many vouches I still need.

## Policy (binding on the criteria below)

| Standing | Trust chip integer (house POV) | Vouches required |
|---|---|---|
| Trusted | 75–100 | 1 |
| Neutral | 50–74 | 2 |
| Low trust | 0–49, and any pubkey the provider has no score for | 3 |

- The integer is the one the trust chip displays: the provider's 0–1 score rounded to the nearest
  whole percent. A member's standing always matches the number on their chip.
- The three thresholds and three counts are defined **once**, in a single place, so that changing
  them there changes every verdict in the Hub with no other edit.
- A **counting vouch** is one signed by a *distinct verified member other than the pubkey itself*.
  Self-vouches never count. Several vouches from the same voucher count once. Vouches from
  accounts that are not verified do not count (but still place the target in the pending set).
- The bootstrap seed is the **only root** — verified by definition, exempt from the policy. Every
  other pubkey, the primary curator included, is governed by the table.
- Standing is always evaluated **from the house perspective**, regardless of which view
  (Community / My view) a member has selected on the Members page.

## Acceptance criteria

- [ ] **Bucketed requirement.** Given a pubkey vouched by exactly one verified member, when its house-POV chip integer is 75 or above, then it is verified; when it is 50–74, then it is not verified until a second distinct verified member vouches; when it is 0–49, then it is not verified until a third. Given a pubkey the provider returns no score for, then it is treated as 0.
- [ ] **Boundary on the displayed integer.** Given a provider score of 0.745, then the pubkey is trusted (chip 75, needs 1); given 0.744, then it is neutral (chip 74, needs 2). Same rule at the 50 boundary.
- [ ] **Counting vouches.** Given a pubkey with a self-vouch plus one vouch from a verified member, then it has one counting vouch. Given two vouches from the same verified member, then one. Given a vouch from a pending (unverified) account, then zero counting vouches and the pubkey appears as pending.
- [ ] **Roots.** Given the seed alone, then it is verified with no vouches. Given the primary curator with the seed's vouch, then she is verified only because her chip integer and counting vouches satisfy the table (today: 96, two counting vouches). Given hypothetically a curator chip of 60 with only the seed's vouch, then she is pending and everyone whose chain runs solely through her is too.
- [ ] **Single point of change.** Given the policy's thresholds or counts are changed in their one defined place, when the verdicts are recomputed, then every surface (sign-in, Members grids) reflects the new table with no other change.
- [ ] **Memoryless.** Given the same vouch events and a provider score that has changed between two loads, then the second load's verdict follows the new score with nothing carried over from the first. Nothing about membership is persisted on the client or a server.
- [ ] **Sign-in, verified.** Given a pubkey that satisfies the table, when they sign in, then they reach the gated views exactly as today.
- [ ] **Sign-in, tagged but short.** Given a pubkey with at least one vouch (from anyone, including themselves) that does not satisfy the table, when they sign in, then the pending state shows `Your trust level in the community requires {N} vouches from other members.` and `{M} more vouches needed` (`1 more vouch needed` when M is 1), where N is the requirement for their standing and M = N − counting vouches. This is the state a rolled-back member sees, with no additional acknowledgement of prior membership.
- [ ] **Sign-in, untagged.** Given a pubkey with no vouch at all, when they sign in, then the non-member state keeps the apply prompt and adds the same two lines with M = N.
- [ ] **Provider unavailable.** Given the trust provider cannot be reached, times out, refuses the house perspective, or returns an unreadable answer, when someone signs in, then no membership verdict is shown; the sign-in shows exactly `We couldn't check your membership because Brainstorm scores are temporarily unreachable.` with a way to try again. No fallback perspective or algorithm is used, and no provider-authored text appears.
- [ ] **After a vouch.** Given a verified member vouches for someone from the Members page or search panel, when the vouch is published, then the immediate feedback reflects the policy: the target is now verified, or still short with the remaining count.
- [ ] **Grids follow the closure.** Given the new closure, when the Members page loads, then the verified and pending grids contain exactly the verified and pending sets it produces (rolled-back members appear in pending). No new card content in this story.

## Concepts touched

No concept definition is added, changed, or removed; no firmware reinstall is implied.

- The LFO tag concept (`39999:e83fff7a…:lfo`, concept event `4ddde08a…`) — read only; vouches remain the kind-39999 pubkey-tagging events exactly as published today.
- The `nostr-user-tag` parent concept (`39998:82b75e47…:nostr-user-tag`) — query namespace, unchanged.
- GrapeRank trust scores (house POV) — **now an input to the membership verdict** for the first time, as a requirement modifier only. This amends the CLAUDE.md key decision "trust scores are not an input to membership"; the Architect should record the amendment.

The Concept Graph API was unreachable at planning time; the Architect should re-check.

## Out of scope

- **Vouch counts, voucher hover list, and the Vouch button on verified cards** — story #2.
- **The feed's author and asserter gate** — story #3 (same closure, server-side).
- **Solution-page copy** describing the verification model — PO: outdated, ignore.
- Any change to the attestation event format, the relay set, or the NIP-51 kind-30000 list.
- Registering a perspective with the provider from inside the Hub.
- Naming or displaying the bucket ("neutral") or score on the sign-in screens — the copy states only the counts.

## Decisions

- **D1 — Copy for the short/untagged states** *(PO, 2026-09-04)*: the two lines in the criteria, verbatim.
- **D2 — Roots** *(PO, 2026-09-09)*: seed only; curator governed. The seed is an assistant key on a Brainstorm dev machine (PO, 2026-09-09) — see the book's seed findings.
- **D3 — Provider-failure copy** *(PO, 2026-09-09)*: `We couldn't check your membership because Brainstorm scores are temporarily unreachable.` plus a Try again control.
- **D4 — Singular form** *(engineering proposal, unopposed)*: `1 more vouch needed` when one remains; `{N} vouches` otherwise. `requires 1 vouch from other members` likewise.
- **D5 — Locked-out members** *(engineering proposal, unopposed)*: ordinary pending state, no extra line. The algorithm is memoryless and cannot know.

## Open questions

None — D3–D5 closed the three raised at draft.

## Notes for the Architect

- The intake dry run (`policy-dry-run.mjs`, session scratchpad; the book asks for it to be promoted into `scripts/`) is the reference computation: 64 tag items, 57 pubkeys, one batch score call, 41 verified / 11 pending under this table with the seed as the only root.
- Scores are already fetched in batch for the Members grids from the same perspective; the verdict needs scores for every pubkey that appears in any vouch event, not just the signing-in user, because the closure is transitive.
- The Members page's Community/My view toggle must not influence the verdict.

## Linked artifacts
- ADR: `engineering-team/decisions/0048-trust-weighted-closure.md` (Accepted 2026-09-09)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
