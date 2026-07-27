# Book of Work: v1 release — LFO Hub shell polish

**Slug:** v1-release
**Status:** Open
**Opened:** 2026-07-27

## Intent anchor

No PRD. Completion is *judged* against the acceptance frame below.

### Acceptance frame

> **Context:** the application now goes by **LFO Hub** and is heading toward a v1 product release.
> This book covers the release's UI-shell work — navigation naming, a public explainer page, and an
> onboarding video — none of which touches the feed/tagging engines (those live in the
> `community-feed` and `note-tagging` books, both still open). Copy for the explainer page is
> prewritten by the PO; only formatting and UI design are engineering work.

- [ ] The navigation tab currently labeled "About" reads **"Home"**, with no change in behavior (public, default view).
- [ ] A new **"Solution"** tab appears in the navigation bar. Its view is public — no sign-in required — and presents the PO's prewritten copy explaining LFO Hub, the pain points it addresses, and its enabling technologies, formatted and styled to match the app.
- [ ] The Members page shows a pre-recorded **user-guide video** between the Telegram banner and the "verified member" cards — visible only to signed-in users, rendering immediately upon sign-in. *(Serving/hosting decision pending — see epic.)*

## Epics in this book
- `v1-release` — the three UI-shell changes above, run at the harness's lightest setting (no ADRs anticipated; the tab/view and gating patterns already exist).

## Provenance
- **Mode:** Acceptance-frame
- **Confidence at open:** high — the ask is bounded, enumerated by the PO in one message (2026-07-27), and reuses existing UI patterns throughout.

## Decided constraints (carried into Architecture)
- **Harness-light by PO agreement (2026-07-27):** Architecture phase skipped (no decisions of record expected); tests cover only silently-regressable behavior — gating semantics and nav wiring. One exception flagged in advance: how the video is *served* (repo asset vs blob vs embed) is a real decision and gets recorded if it proves non-obvious.
- Work happens on the short-lived branch `feat/v1-ui`, one commit per change, merged to `main` (auto-deploys production) only when the book's stories pass review — one prod release, no intermediate states live.
- The Solution page's copy is **PO-authored verbatim content** — engineering formats and styles it but does not rewrite it.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/v1-release/audit.md`
- Product feedback: `engineering-team/audits/v1-release/prd-seed.md`
