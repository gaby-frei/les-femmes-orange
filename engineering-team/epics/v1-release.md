# Epic: v1-release

**Status:** Active
**Created:** 2026-07-27
**Book:** `engineering-team/audits/v1-release/book.md`

## Goal
Ship the UI-shell changes for LFO Hub's v1 product release: rename the "About" tab to "Home", add a
public "Solution" explainer page to the navigation, and embed a user-guide video on the Members
page. Pure presentation-layer work — no feed, tagging, or membership-engine changes.

## Why
The app is being productized as **LFO Hub** for a v1 release. Visitors who aren't yet members need
a public page that explains what LFO Hub is, the pain points it addresses, and the technology it's
built on (today the signed-out surface is only the About/Home landing). New members need an
orientation video where they land after sign-in. And "Home" describes the landing tab better than
"About" once a dedicated explainer exists alongside it.

## Stories

- #1 — `1-home-solution-nav` — Rename the "About" nav tab to **"Home"** (behavior unchanged) and add
  a new public **"Solution"** tab whose view formats the PO's prewritten copy (LFO Hub explainer:
  pain points + enabling technologies). Tab order per PO override: Home | Members | Feed |
  **Solution** (last). Copy rendered verbatim with underline/italic/bold fidelity; one flagged
  deviation (a missing space in the source PDF, rendered corrected) awaits PO ratification.
  *(Done — review PASS 2026-07-27)*
- #2 — `2-member-guide-video` — **(QUEUED — awaiting PO serving decision)** Pre-recorded user-guide
  video on the Members page, between the Telegram banner and the verified-member cards; signed-in
  users only; renders immediately upon sign-in. Blocked on how the video is served (repo asset vs
  Vercel Blob/Blossom vs unlisted YouTube/Vimeo embed) — the PO decides after #1 completes. *(Not
  started)*

**Execution order:** #1 (+ pending amendment) → #2. Harness-light per the book's decided
constraints: no Architecture phase unless #2's serving decision warrants a mini-ADR.

> **⛔ GATE (PO, 2026-07-27): #2 must NOT start until the #1 hover-definitions amendment ships.**
> The PO is authoring 1–2 sentence definitions for 10–15 terms in the Solution copy, delivered as
> an uploaded document; each term maps 1:1 to a word rendered *italic + underlined*. The UI shows
> the definition on hover of that specific term. Design note for when the doc arrives: three
> italic+underlined terms are ALSO links (Nostr, Nostr ecosystem, Web of Trust) — hover-definition
> and click-through must coexist there.

## Open questions (epic-level)
- **Video serving (#2):** repo static asset (rejected by default — permanent repo bloat, poor
  serving), Vercel Blob / Blossom + the story-7 native inline player, or an unlisted YouTube/Vimeo
  embed. PO determination pending; file size and bandwidth tolerance decide it.
