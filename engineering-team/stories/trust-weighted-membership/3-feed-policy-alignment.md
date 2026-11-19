# Story 3: The community feed follows the trust-weighted membership rule

**Status:** Approved (PO, 2026-11-19)
**Created:** 2026-11-19
**Type:** Feature
**Epic:** `trust-weighted-membership` (story #3; depends on #1 — Done)
**Book:** `engineering-team/audits/trust-weighted-membership/book.md` — Open, acceptance-frame
**Branch:** `feat/trust-weighted-membership`

## Background

Stories #1 and #2 changed who counts as a verified member at sign-in and on the Members page.
A pubkey now needs 1, 2, or 3 vouches from distinct verified members depending on its house
trust standing. The **community feed** works out its own member list on the server, and it
still uses the old one-vouch rule. So today the Hub disagrees with itself: a member rolled
back to pending at sign-in can still have their notes pulled into the feed, and their topic
tags still curate it.

This story moves the feed onto the same rule. That covers both places membership matters in
the feed:

1. **Hashtag notes.** Only verified members' notes tagged with the feed hashtags are
   candidates.
2. **Topic tags.** Only tags applied by verified members count toward a note's channels, its
   tag pills, and the list of who applied them.

Curation itself stays the same (PO, 2026-11-19): a note by a non-member still appears when a
verified member tags it. What changes is who counts as a verified member.

As at sign-in, the feed now needs Brainstorm trust scores to know who's a member. When it
can't get them, it says so (PO, 2026-11-19: the same wording as sign-in). It never falls back
to the old rule or to a different perspective, because that would let different people into
the feed.

**Who is affected:** everyone reading the feed. Notes from rolled-back members drop out until
they collect enough vouches, unless a verified member tags them.

## User-facing description

As a member reading the community feed, I want the feed to be curated by exactly the people
the Hub recognises as verified members, so that the feed and the membership rules never
disagree, and I want to be told plainly when the feed can't check membership rather than
being shown a misleading empty feed.

## Copy (binding on the criteria below)

- **Scores unavailable:** `We couldn't load the community feed because Brainstorm scores are temporarily unreachable.`
  plus a **Try again** control (PO, 2026-11-19).
- **Any other feed failure:** the existing `Could not load the feed right now. Please try again later.` (D3).

## Acceptance criteria

- [ ] **Hashtag notes follow the rule.** Given a pubkey that's verified under the trust-weighted rule, their notes with the feed hashtags are feed candidates. Given a pubkey with one vouch from a verified member but neutral standing (needs 2), their hashtag notes aren't candidates.
- [ ] **Topic tags follow the rule.** Given a topic tag applied by a verified member, it counts: the note joins that tag's channel, shows the tag pill, and lists that member as an applier. Given the same tag applied only by a pubkey that's pending under the new rule, it doesn't count for any of those, and that pubkey isn't counted among the feed's active taggers.
- [ ] **Curation unchanged.** Given a note by a non-member that a verified member tagged, it still appears, exactly as today.
- [ ] **One verdict across the Hub.** Given the same vouch events and the same house-perspective scores, the feed's set of verified members equals the Members page's verified grid. Standing is always taken from the house perspective.
- [ ] **Follows live scores.** Given a pubkey whose score changes between two feed loads, the second load uses the new score. Nothing about membership is carried over between loads.
- [ ] **Scores unavailable.** Given Brainstorm can't be reached, times out, refuses the house perspective, or returns an unreadable answer, when the feed loads, then no notes are shown and the feed shows exactly the scores-unavailable copy with **Try again**. No fallback rule or perspective is used, and no provider-authored text appears.
- [ ] **Try again.** Given the feed showed the scores-unavailable state, when Brainstorm is reachable again and the member presses Try again, then the feed loads normally without a page reload.
- [ ] **No misleading empty feed.** Given the feed fails for any other reason, then it shows the generic failure copy, never `No notes to show yet…`. `No notes to show yet…` appears only when the feed loaded successfully and has no notes.

## Decisions

- **D1 — Scores-unavailable copy** *(PO, 2026-11-19)*: matches sign-in (story #1 D3), worded
  for the feed, with Try again.
- **D2 — Curation unchanged** *(PO, 2026-11-19)*: member-tagged notes by non-members still
  appear.
- **D3 — Other failures** *(engineering proposal)*: show the existing generic copy instead of
  the empty-feed message. Today a server failure is read as "no notes", which the
  scores-unavailable state would make much more common.

## Concepts touched

No concept definition is added, changed, or removed, and no firmware reinstall is implied.

- The LFO tag concept (`39999:e83fff7a…:lfo`, concept event `4ddde08a…`): read only, the
  vouch events.
- The `nostr-event-tag` concept and the per-tag tagging headers: read only. The topic-tag
  assertions are unchanged; only *whose* assertions count changes.
- GrapeRank house-POV standing: read only. It now sets the feed's membership as well.

The Concept Graph API was unreachable at planning time. The Architect should re-check.

## Out of scope

- Changing what the feed curates or how notes are ranked or classified (D2).
- Caching the feed or its member list.
- Showing vouch counts or trust scores in the feed.
- Story #4 (cascade card refresh on the Members page).
- Applying a topic tag from the feed: who may apply is already decided by the browser's
  verdict from story #1.

## Notes for the Architect

- With this story the old one-vouch closure loses its last user. The epic expects it to be
  retired.
- The feed runs on the server, so the house perspective and the "no fallback" rule from
  ADR 0048 need a server-side counterpart.

## Open questions

None. D1–D2 were answered by the PO; D3 stands unless the PO objects.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
