# Story 1: "Home" rename + public "Solution" page

**Status:** Approved
**Created:** 2026-07-27
**Approved:** 2026-07-27 (PO, with copy delivery + two determinations — see Open questions)
**Type:** Feature

## Background
LFO Hub is heading to a v1 product release. The signed-out navigation currently shows a single
"About" tab (Members and Feed reveal on sign-in). Two shell changes prepare the public surface:
the landing tab becomes **"Home"** (a better name once it sits alongside a dedicated explainer),
and a new **"Solution"** tab presents prewritten PO copy explaining LFO Hub — the pain points it
addresses and the technologies that enable it — to visitors *before* they sign in. Prospective
members and the curious public are the audience; the copy is finished, so the engineering work is
navigation wiring, page structure, and styling only.

## User-facing description
As a visitor (signed in or not), I want a "Solution" page reachable from the navigation bar that
explains what LFO Hub is, the problems it solves, and how it works, so that I can understand the
product without needing an account. And as any user, I see the landing tab called "Home" rather
than "About".

## Acceptance criteria

Rename:
- [ ] Given any visitor (signed out or in), when the page loads, then the first nav tab reads **"Home"** and no tab reads "About".
- [ ] Given the rename, when the app opens or the user signs out, then the Home view still renders as the default view exactly as the About view did (same content, same `showView` behavior, hero CTA unchanged).

Solution tab & view:
- [ ] Given a **signed-out** visitor, when the page loads, then a "Solution" tab is visible in the nav bar (unlike Members/Feed, which stay hidden).
- [ ] Given any visitor, when they click "Solution", then the Solution view displays with the PO's copy, formatted with the app's existing typographic/section styling; nav active-state moves to the Solution tab.
- [ ] Given a signed-out visitor on the Solution view, when they do nothing else, then no sign-in prompt, membership check, or gated fetch is triggered by the view.
- [ ] Given a signed-in member, when they click "Solution", then the same view renders (content identical signed in vs out).
- [ ] Given the new tab, when a user navigates between Home/Solution/Members/Feed, then exactly one nav tab carries the active state at a time and each view swap behaves like the existing tabs.

Copy fidelity:
- [ ] Given the PO-provided copy, when the Solution view renders, then the copy appears **verbatim** (formatting/layout are engineering's; wording is not).

## Concepts touched
None — pure client shell (nav + a static public view in `public/index.html`). No concept-graph,
membership, relay, or API surface changes.

## Out of scope
- The Members-page user-guide video (story #2 of this epic — serving decision pending).
- Any change to sign-in flow, gating of Members/Feed, or the feed/tagging features.
- Rewriting or editing the PO's copy (typo fixes get flagged back to the PO, not silently applied).
- SEO/routing work (the app is a single-page shell; no URL-per-view routing exists today and none is added).

## Open questions
- **O1 — the copy itself: RESOLVED (2026-07-27).** PO delivered the copy as a PDF
  (`~/Downloads/Solution Copy (4).pdf`, 7 pp). Structure is normative:
  - Four top-level headers (largest font): **What is this app?**, **Online Communities Today are
    Broken**, **How the LFO Hub Fixes a Broken Model**, **Enabling Technologies** — the last with
    subheadings **Nostr Protocol** and **Tapestry Graph**.
  - Section 2 is a seven-item ✗ list, section 3 an eight-item ✔ list; each item opens with a
    **bold label**.
  - **Formatting fidelity is an acceptance requirement:** every underline, italic, and bold in the
    PDF must survive into the HTML (e.g. the underlined-italic terms *vouch*, *trust scores*,
    *Nostr ecosystem*; underline-only *Web of Trust*; italic-only *millions*, *how*, the closing
    sovereign-infrastructure tagline).
  - Sections are separated logically; the page adheres to LFO Hub's existing color scheme/styling.
- **O2 — tab order: RESOLVED (2026-07-27).** PO overrode the default: **"Solution" is the LAST tab
  on the left** — order is **Home | Members | Feed | Solution** (relative order of the existing
  tabs unchanged; Members/Feed still reveal only on sign-in, so a signed-out visitor sees
  **Home | Solution**).

## Linked artifacts
- ADR: *none — Architecture phase skipped by PO agreement (book's decided constraints)*
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
