# Story 2: Vouch counts and vouchers on member cards

**Status:** In Progress (implemented 2026-11-18; awaiting Review)
**Created:** 2026-11-18
**Type:** Feature
**Epic:** `trust-weighted-membership` (story #2 of 3; depends on #1 — Done)
**Book:** `engineering-team/audits/trust-weighted-membership/book.md` — Open, acceptance-frame
**Branch:** `feat/trust-weighted-membership`

## Background

Story #1 made the number of vouches a pubkey needs depend on its house-POV trust standing
(1, 2, or 3). The Members page, however, still presents membership as if one vouch were the
whole story. Each verified card names a single voucher ("by …", or "Founding curator"), and
pending cards give no sign of how close someone is. Members can't see who stands behind whom,
and they can't tell whether a pending applicant needs one more vouch or three.

This story puts the count on the card. Verified cards show how many vouches count for that
member, and pending cards show how many they have out of how many they need. The number also
opens the list of everyone who vouched. Vouches that don't count (from accounts that are not
yet verified, or self-vouches) appear in the list but dimmed, so members can see why a count
is lower than the list is long.

Story #1 also made membership memoryless: a member whose standing falls can drop back to
pending until they collect more vouches. This story adds a **Vouch button on verified
cards**, so members can add redundancy ahead of time. Today the button only appears on
pending cards.

**Who is affected:** verified members browsing the Members page. Nobody's membership changes.
This story only shows what story #1 already computes.

## User-facing description

As a verified member, I want each member card to show how many vouches count for that
person, and who gave them, so that I can see how well-supported each member is, and how close
each applicant is. I also want to be able to vouch for members who are already verified, so
that a dip in someone's trust score doesn't lock them out.

## Copy (binding on the criteria below)

| Card | Count line | Example |
|---|---|---|
| Verified | `{N} vouches` (`1 vouch` when N is 1) | `2 vouches` |
| Pending | `{N} of {M} vouches` (`{N} of 1 vouch` when M is 1) | `1 of 3 vouches` |

- **N** is the **counting** vouches: distinct verified members other than the card's owner
  (story #1's definition). **M** is what the owner's standing requires (story #1's table).
- The count line **replaces** the verified card's current by-line ("by …" / "Founding
  curator") (PO, 2026-11-18).

## Acceptance criteria

- [ ] **Verified count.** Given a verified member with N counting vouches, when the Members page loads, then their card reads `N vouches` (`1 vouch` for one), and the old "by …" / "Founding curator" line no longer appears. The primary curator's card counts the seed's vouch like any other.
- [ ] **Pending count.** Given a pending pubkey with N counting vouches whose standing requires M, when the page loads, then their card reads `N of M vouches`, e.g. `0 of 2 vouches` for someone vouched only by an unverified account or only by themselves.
- [ ] **Voucher list opens from the count.** Given any verified or pending card, when the member hovers the count (pointer), taps it (touch), or focuses it and presses Enter or Space (keyboard), then a list opens naming **every** distinct voucher by profile name, or short npub when there's no profile. It closes when the pointer leaves, on a tap elsewhere, or on Escape.
- [ ] **Non-counting vouchers dimmed.** Given a voucher who doesn't count for that card (not verified, or the card owner vouching for themselves), then they still appear in the list, visibly dimmed and listed after the counting vouchers, and marked in text so that colour isn't the only signal. Counting vouchers appear in full strength.
- [ ] **Count and list agree.** Given any card, then the number of non-dimmed entries in its list equals the N on its count line.
- [ ] **Vouch on verified cards.** Given I am a verified member with a working signer, when I view another verified member's card that I haven't vouched for yet, then it shows a Vouch button. It doesn't show on my own card or on a card I've already vouched for. Pending cards keep today's rule.
- [ ] **After vouching a verified member.** Given I vouch from a verified card, when the vouch is published, then that card's count goes up by one and I appear in its list as a counting voucher, without a page reload, and the Vouch button is replaced by today's "vouched" acknowledgement.
- [ ] **After vouching a pending member.** Given I vouch from a pending card and the applicant is still short, then that card's count line shows the new N of M and I'm in its list. When my vouch completes the requirement, the card moves to the verified grid with its `N vouches` line, as today.
- [ ] **Follows the live verdict.** Given the counts come from the same computation as the verdict (story #1), then a card never shows a count that contradicts which grid it's in: every verified card's N is at least its M, and every pending card's N is below its M.

## Decisions

- **D1 — Count replaces the by-line on verified cards** *(PO, 2026-11-18)*.
- **D2 — Touch and keyboard** *(PO, 2026-11-18)*: tapping the count opens the list, and
  tapping elsewhere closes it. The list is also reachable from the keyboard.
- **D3 — Grids only** *(PO, 2026-11-18)*: search-result rows are unchanged.
- **D4 — Singular forms** *(carried from story #1 D4)*: `1 vouch`; `N of 1 vouch`.
- **D5 — Vouch button exclusions** *(engineering proposal)*: never on your own card, and never
  on a card you've already vouched for, whether verified or pending. A second vouch from you
  would count once anyway.
- **D6 — Order within the list** *(engineering proposal)*: counting vouchers first, then
  non-counting ones. No further ordering is promised.

## Concepts touched

No concept definition is added, changed, or removed, and no firmware reinstall is implied.

- The LFO tag concept (`39999:e83fff7a…:lfo`, concept event `4ddde08a…`): read only. Vouches
  from the Vouch button on verified cards are the same kind-39999 pubkey-tagging events
  published today.
- GrapeRank house-POV standing: read only, through story #1's verdict. It sets M.

The Concept Graph API was unreachable at planning time. The Architect should re-check.

## Out of scope

- **Search-result rows** (D3). They keep today's badge and Vouch rules.
- Showing the bucket name ("neutral") or the score next to the count. The trust chip already
  shows the score.
- **Removing or disputing a vouch** (negative polarity). There is no un-vouch.
- Any change to the verdict, the policy table, or the sign-in screens (story #1).
- The feed's author and asserter gate (story #3).
- Sorting the grids by vouch count. Trust ordering is unchanged.

## Open questions

None. D1–D3 were answered by the PO; D5–D6 stand unless the PO objects.

## Deviations

Logged by the Implementer (2026-11-18), per role step 9. Small calls; nothing forced an ADR amendment.

- **Hover, then click, pins the list open.** On a mouse, the hover opens the list before the click lands, so a plain toggle would close it on the same gesture. The first click on a hover-opened list *pins* it open (it survives pointer leave), and the next click closes it. This doesn't apply on touch screens or to the keyboard, because `(hover: hover)` gates the hover path.
- **Post-vouch grid is decided by the fresh closure,** not by `res.verified`. The card goes to whichever grid `verifiedMap` now says, and is replaced in place when that grid is unchanged. This is how a vouch on a verified card avoids the duplicate-card bug the ADR flagged.
- **Text markers:** ` — not verified yet` and ` — self-vouch`, exactly as the ADR suggested. The tests match them loosely.
- **"Published — sync pending" (brainstorm relay failed) is not kept** on the re-rendered card. It was already lost on the old move-to-verified path, so behavior is unchanged where it mattered. The publish result still lands in the local cache.
- **Re-pinned one older helper:** `tests/npub-search.spec.js` `gridCard(grid, name)` now matches the card's own `.member-name`. A whole-card `hasText` also hit cards whose voucher list names that member (3 toggle tests, strict-mode violations). No assertion changed.
- **Removed the dead by-line code** (`taggerLabel`, `.member-attested-by` CSS), as the ADR asked: deleted, not left in place.

## Linked artifacts
- ADR: `engineering-team/decisions/0049-vouch-counts-on-cards.md` (Accepted 2026-11-18)
- Test plan: `engineering-team/stories/trust-weighted-membership/2-vouch-counts-on-cards.test-plan.md` — `test/vouch-breakdown.test.js` (V1–V9), `tests/vouch-counts-cards.spec.js` (C1–C12); RED at `d956dc6`
- Review: (filled in after Review phase)
