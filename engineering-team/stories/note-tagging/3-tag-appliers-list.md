# Story 3: See who applied a topic tag to a post

**Status:** Approved (PO, 2026-11-19)
**Created:** 2026-11-19
**Type:** Feature
**Epic:** `note-tagging` (story #3; builds on #2 — Done)
**Book:** `engineering-team/audits/note-tagging/book.md` — Open, acceptance-frame
**Branch:** `feat/trust-weighted-membership` (built alongside trust-weighted-membership #3, which is paused at Architecture)

## Background

When a member presses a topic tag pill on a feed post, a panel opens with the tag's description
and a count line, `Applied by N members` (note-tagging #2). The count says *how many* members
applied the tag but not *who*. On the Members page the matching question, "who vouched for this
person?", is answered by pressing the vouch count to open a list of names
(trust-weighted-membership #2). This story gives the feed's count line the same behavior, so
members can see whose judgment put a post in a channel.

Everyone in the list is a verified member, because only verified members' tags count. The
names are the same ones the feed already uses elsewhere, such as for @-mentions.

## User-facing description

As a member reading the community feed, I want to see which members applied a topic tag to a
post, so that I can judge the curation by the people behind it, the same way I can see who
vouched for a member.

## Copy (binding on the criteria below)

- Count line: unchanged. `Applied by N members`, or `Applied by 1 member` at one.
- Each entry in the list is one of:
  - **`You`**, when the applier is the signed-in member;
  - the applier's **profile name**;
  - their **short npub**, when they have no profile name.

## Acceptance criteria

- [ ] **Opens the list.** Given a tag panel showing `Applied by N members`, when I press the count line (click, tap, Enter, or Space), then a list of the N appliers opens below it. Pressing it again closes the list.
- [ ] **Names.** Given an applier with a profile name, their entry shows that name. Given an applier with no profile name, their entry shows their short npub. Given I applied the tag, my entry shows `You`.
- [ ] **Count and list agree.** Given a tag's panel, the list has exactly as many entries as the count says, each applier listed once.
- [ ] **Order.** `You` comes first when present, then everyone else.
- [ ] **Just applied.** Given I just applied a tag to a post, when I open that tag's list without reloading, then `You` is in it and the count includes me.
- [ ] **Dismissal.** Given an open list, when I press Escape it closes and focus returns to the count line. When I press anywhere outside it, it closes.
- [ ] **Stays in the panel.** Pressing the count line or an entry in the list doesn't open the post in Primal and doesn't close the tag's panel.
- [ ] **Unchanged otherwise.** Given a tag pill with no description, it stays inert, with no panel and no list. Given a panel with no appliers, there's no count line and no list.
- [ ] **Safe text.** Given a profile name that contains markup, it's shown as plain text.

## Decisions

- **D1 — Expandable list on the count line** *(PO, 2026-11-19)*: chosen over showing appliers' avatars next to each pill.
- **D2 — Text only** *(PO, 2026-11-19)*: no avatars in the list, like the voucher list on member cards.
- **D3 — Order** *(engineering proposal)*: `You` first, then everyone else.
- **D4 — Same interaction as the voucher list** *(engineering proposal)*: press to open, with keyboard, Escape and press-outside-to-close, so the Hub has one pattern. Hover-to-open is not included, because the count already sits inside a panel the member opened on purpose.

## Concepts touched

No concept definition is added, changed, or removed, and no firmware reinstall is implied.

- The `nostr-event-tag` concept and the per-tag tagging headers: read only. Who applied a tag
  is already part of what the feed reads.
- Member profiles (kind 0): read only, already fetched for the feed.

The Concept Graph API was unreachable at planning time. The Architect should re-check.

## Out of scope

- Avatars in the list (D2).
- Lists of appliers anywhere other than a post's tag panel, such as the feed header's tagger count.
- Disputes or revoking a tag, or linking an entry to the applier's member card.
- Who counts as a member. That's trust-weighted-membership #3, and this list follows whatever
  verdict the feed uses.

## Open questions

None. D1–D2 were answered by the PO; D3–D4 stand unless the PO objects.

## Linked artifacts
- ADR: `engineering-team/decisions/0050-tag-appliers-list.md`
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
