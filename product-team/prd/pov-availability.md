# Perspective Availability — Product Requirements Document

**Slug:** pov-availability
**Date:** 2026-08-24
**Status:** Draft
**Companion guides:** `guides/pov-availability-style-guide.md`, `guides/pov-availability-design-guide.md`

> Self-contained. A reader understands this feature area without opening any other artifact.

**What this document covers.** One feature area inside the LFO Hub: what the Members page does when a trust perspective cannot be served. It is not a PRD for the whole product.

**Provenance, stated plainly.** Discovery, User Modeling, Scope, and Domain Modeling were never run for this product. Sections 1–4 and 6 are reconstructed from the build audit of the shipped work (`engineering-team/audits/npub-search/prd-seed.md`) and from Experience Design, which *was* run and approved on 2026-08-24. Where a section rests on inference rather than research, it says so, and the gap appears in §11 as a numbered question. Section 5 and the design rules throughout are firm — they come from the approved design guide.

---

## 1. Product Vision

The LFO Hub's Members page is a **web-of-trust lens**. Every person it shows — a search result or an existing member — carries a numeric trust score and is ranked by it. Those numbers are never presented as a global fact about a person. They are always *somebody's view*, and the page names whose.

That principle is the product's spine, and it creates an obligation this feature area exists to meet: **a member must never be able to read a trust number without being able to read whose judgment produced it.**

Trust scores come from an outside provider, Brainstorm, which computes them per perspective. A perspective only produces scores if it has been registered and calculated. So a perspective can be unavailable — and until now, an unavailable perspective returned zeros, which the page displayed as though they were real. The provider has since replaced that silence with an explicit refusal, and this feature area is the product's answer to it.

**The opportunity.** Handled carelessly, a refusal becomes an error message full of protocol vocabulary in front of community members. Handled well, it becomes something better than what shipped: the page stops guessing, tells the member what they are looking at, and picks the best perspective it can actually serve.

**The reframe this feature area rests on.** An unservable perspective is not a failure. Nothing has gone wrong from the member's side — they asked to find someone on Nostr, and they will get ranked results. What changed is whose judgment ordered them. So the page treats the fallback as a **third perspective**, named like the other two, in the same slot, in the same voice.

---

## 2. Positioning & Competitive Context

`[INFERRED — no competitive research was ever conducted for this product; see §11 Q2]`

**Structural position.** The Hub is not a general Nostr client and does not compete with one. It is the home of a specific community of roughly 2,000 Bitcoin and freedom advocates, and its distinguishing claim is that membership and visibility are decided by the community's own vouching, not by an algorithm's opinion.

**The advantage this feature area defends.** General Nostr clients that show trust or reputation scores present them as properties of a person. The Hub presents them as properties of a *relationship* — this account, seen from that perspective. Every competitor's version of "unavailable" is a spinner or a zero. Naming the perspective even when it fails is the product-level expression of the thing the Hub is actually for.

**The dependency to be honest about.** Trust scores are computed by Brainstorm, a third party the community does not control. The Hub can display, order, and explain them; it cannot compute them or guarantee their availability. Every requirement here is written so the page remains fully usable when that provider will not answer.

---

## 3. User Personas

Two personas are carried from the build audit, where they were inferred from shipped story definitions rather than from user research. The third was surfaced by Experience Design. **None has been validated with real members** — see §11 Q3.

### 3.1 The Connector — *primary for this feature area*
A verified member who knows someone who belongs in this community.

- **Goal.** Find that person and vouch them in, in one motion.
- **Core loop.** Open Members → search a name or paste an identity → recognize the right person among the candidates → vouch.
- **Friction this feature area addresses.** Recognition depends on ordering. When candidates arrive ranked by a perspective she trusts, the right person tends to be near the top. When that ordering silently changes, she has no way to know that the top result no longer means what it meant yesterday.

### 3.2 The Evaluator
A signed-in member reading the community through its trust scores.

- **Goal.** Judge who is who, and sanity-check the community's read against her own.
- **Core loop.** Scan the member grids → compare scores → switch perspective to see whether her own view agrees.
- **Friction this feature area addresses.** Her entire activity is comparison, so a number whose perspective is uncertain is worse than no number. She is the persona most damaged by a silent substitution and the one who most needs the perspective label to be exact.

### 3.3 The Unprovisioned Member — *surfaced by Experience Design; assumed, not validated*
A verified community member whose own trust scores have never been calculated, because her account is not registered with the provider. **This is the majority case today.**

*Status:* this persona is **assumed for now**, with User Modeling deferred to a later phase (§11 Q3, resolved 2026-08-25). Every requirement in §5 that serves her is a design judgment, not a researched one. The risk is carried into the registration phase, where it matters most.

- **Goal.** Not, initially, a goal at all — she encounters a control offering "My view" that she cannot use.
- **Core loop.** Sees the perspective control, finds her side of it dimmed, and needs to understand whether that is a fault, a wait, or something she can fix.
- **Friction this feature area addresses.** The shipped page tells her *"My view isn't available for your account yet"* — a fact with no cause, which leaves her nothing to do and no reason to come back. Naming the cause converts a dead end into the entry point for a future registration flow.

---

## 4. User Journeys

Each journey is written for the persona it primarily serves and traces to features in §5.

### Journey A — The Connector searches, and everything works *(§3.1)*
1. She opens Members. The perspective control shows **Community view** selected.
2. Beside the search label she reads *— searching as Les Femmes Orange*.
3. She types a name. Candidates arrive ordered highest-trust first, each with its score.
4. She recognizes the right person and vouches.

**This is the overwhelming majority of sessions and is entirely unchanged by this feature area.** It is stated here because every other journey is a departure from it, and any departure that damages this one is a failure.

### Journey B — The Unprovisioned Member meets the control *(§3.3)*
1. She opens Members. The **My view** side of the control is dimmed.
2. Beneath it she reads that her view isn't available yet *because her account isn't registered with Brainstorm*.
3. She now knows this is not a fault, not a wait, and not permanent — it is a registration she doesn't have.
4. She continues in Community view. Nothing else on the page is diminished.

**Step 3 is the whole point of the journey**, and it is where a future registration flow attaches.

### Journey C — Her scores are on their way *(§3.3)*
1. She opens Members having been registered since her last visit.
2. **My view** is still dimmed, but the line beneath now reads that her view is being set up, with roughly how long to wait.
3. She comes back later and the control is live.

**The only hopeful state in this feature area, and the only one with a number in it.**

### Journey D — The community's perspective is refused, hers works *(§3.2)*
1. She opens Members. The page has already determined that the community's ranking cannot be served and that hers can.
2. **My view** is selected — a perspective she did not choose — and **Community view** is dimmed.
3. The line beneath tells her the community's ranking isn't available and that she is seeing her own instead.
4. The indicator reads *— searching as you*. Scores and ordering are hers throughout.
5. She works normally. Her results are personal to someone she has a reason to trust: herself.

**She is never moved a second time in the session**, even if the community's perspective recovers. The control simply re-enables so she can switch back if she wants to.

### Journey E — Neither perspective can be served *(§3.1, §3.2)*
1. She opens Members. Both sides of the control are dimmed.
2. The line beneath says results aren't personalized to the community right now.
3. Search still works. Results still arrive, still ranked, still scored.
4. Opening a search panel, she sees one line above the rows repeating that these results aren't personalized to the community.
5. She can still find people and still vouch them. Only the ordering's provenance has changed, and the page says so on every surface that shows it.

**The rarest journey, and the one that must not read as a broken page.**

---

## 5. Feature Specification

One screen. Its behavior is fully determined by the availability of two perspectives, resolved independently.

### 5.1 The Members page — perspective resolution

- **Purpose.** Decide which perspective orders every trust surface on the page, and make that decision legible.
- **Content.** A perspective control with two sides (Community view, My view); a status line beneath it; a perspective indicator beside the search label; trust scores and trust ordering on the search panel and both member grids.
- **Behavior.** The page shows **the most community-specific perspective that can actually be served**: the community's first, the member's own second, unpersonalized last. The two perspectives are resolved independently — neither one's state is inferred from the other.

| Community perspective | Member's own | Page shows | Perspective control | Status line |
|---|---|---|---|---|
| Available | Available | Community view | Both sides live | *(none)* |
| Available | Unavailable | Community view | My view dimmed | Registration gap |
| Available | Preparing | Community view | My view dimmed | The wait, with an interval |
| **Unavailable** | **Available** | **My view** | Community dimmed | Community refused, own view substituted |
| Unavailable | Unavailable | Unpersonalized | Both dimmed | Not personalized to the community |

- **Actions (verified members).** Choose either perspective that is available. Search. Vouch. All unchanged from what ships today.

**Rules that govern the table:**

1. **Both perspectives are resolved before the control becomes usable.** A member must never see one perspective selected and then be moved out of it. A brief moment where the control is not yet interactive is acceptable; a selection moving under the member's eyes is not.
2. **A perspective the member did not choose is always explained.** Row 4 places her somewhere she didn't ask to be, so the status line says so. This is the only case in the product where a perspective change is announced.
3. **At most one unrequested move per visit.** Within a single visit to the Members page, the page moves her at most once. If the community's perspective recovers while she is there, the control re-enables and she stays where she is. She can switch back herself.
4. **A dimmed side is never removed.** In every row she can still read which perspectives exist and which one the page is using.
5. **A refused perspective is re-checked each time she returns to the Members page.** A refusal holds for the rest of that visit — the page does not re-ask a provider that has just declined — but it does not outlive the visit. Returning to Members re-resolves both perspectives from scratch, so a perspective that has since become available is offered again without her needing to reload the Hub.
6. **An explicit choice outranks the preference order.** The order in the table decides the *default*. If she has chosen a perspective herself during this session, that choice stands for as long as it can be served. The page only re-resolves for her when her chosen perspective becomes unservable, and then rule 2 applies and it tells her.

*Rule 6 was **ratified by the PO on 2026-08-26** and is a settled requirement, no longer a reading. It is the reading implied by rule 5: once perspectives are re-resolved on every visit, the page needs a stated answer for what happens to a member who already picked one. Choosing for her again would undo a decision she made deliberately.*

### 5.2 The perspective indicator

- **Purpose.** State whose judgment ordered what is on screen. It is the page's single always-visible answer to "whose numbers am I reading."
- **Content.** One short phrase beside the search label.

| Page is showing | Reads |
|---|---|
| Community view | `— searching as Les Femmes Orange` |
| My view, chosen or substituted | `— searching as you` |
| Unpersonalized | `— not personalized to the community` |

- **Behavior.** Always present, always current, never empty. It names the perspective and nothing else, so a substituted My view reads exactly like a chosen one — the results are identical, and the reason belongs to the status line.

### 5.3 The status line

- **Purpose.** Say why a perspective is missing, in language a member can act on.
- **Content.** One line at a time, beneath the perspective control.

| Situation | Reads |
|---|---|
| Both perspectives available | *(nothing — the element is absent, not empty)* |
| Her account isn't registered | `My view isn't available yet because your account isn't registered with Brainstorm.` |
| Her scores are being calculated | `My view is being set up. Check back in about {interval}.` |
| Community refused, hers served | `Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.` |
| Neither can be served | `Results aren't personalized to the community right now. Neither view is available.` |

- **Behavior.** `{interval}` is the provider's own estimate, rounded to a plain unit a person would say out loud: "a minute," "about 5 minutes," "about an hour." With no estimate available, the line reads `Check back in a few minutes.`

**"Brainstorm" is deliberately member-facing.** It is a service a member can *be registered with*, so it is a fact about her. The provider's internal vocabulary is not, and never appears — see §5.5.

### 5.4 The search panel

- **Purpose.** Show candidates. Unchanged in every respect except one added line.
- **Content.** When and only when **neither** perspective can be served, one line sits above the result rows: `These results aren't personalized to the community.`
- **Behavior.** The line appears in that single situation. When a member is on her own substituted perspective the results *are* personalized — to her — and a caveat there would disparage the best results the page can produce.
- **Empty / loading / error.** The page's existing three panel states are untouched: searching, no matches, and search temporarily unavailable. **A refused perspective is never rendered as any of them.** It has results, so "no matches" would be false; it is not a failure, so "temporarily unavailable" would be false too.

### 5.5 What is never shown

The provider explains its refusals in its own words. Those words name an algorithm, quote a 64-character key, and link an operator to a registration console. **No part of that reaches a member.** The page reads it, records it where a developer can find it, and says its own sentence instead.

The fallback is also **never described as "the whole Nostr network."** When a personalized ranking is refused, the provider substitutes its own default, which is rooted in Brainstorm's house account. The page cannot verify whose ranking replaced the community's, so it claims only what it knows: these results are not personalized to Les Femmes Orange.

---

## 6. Data Model

`[INFERRED — Domain Modeling was never run; carried from the build audit and Experience Design]`

- **Identity.** A person on Nostr, addressed by a single public key. Reachable as an npub, a raw key, or an nprofile.
- **Profile.** Display name, picture, verified address, and bio for an identity. Sourced from the network, newest wins, shared across every surface that shows a person.
- **Perspective.** An identity whose judgment can order other identities. Three roles exist: **the community's** (a designated account), **a member's own** (the signed-in member), and **the provider's default** (used when neither of the first two can be served, and never named to a member).
- **Perspective state.** What the provider will do for a given perspective right now. Three values:
  - **Available** — scores exist and are served.
  - **Unavailable** — no scores exist and none are scheduled. Holds for the remainder of the current visit to the Members page, and is re-checked on the next one.
  - **Preparing** — scores are scheduled and being calculated, with an estimated wait. Transient; re-checked on the next request.
- **Trust score.** A number from 0 to 100 expressing how one identity relates to a perspective. It is meaningless without its perspective, and the two are never separated. A score computed under one perspective is never shown under another's label.
- **Wait estimate.** The provider's estimate of how long a *Preparing* perspective will take, expressed to the member as a rounded plain-language interval.

**Lifecycle.** A perspective begins Unavailable. Registration moves it to Preparing. Calculation moves it to Available. The Hub only ever reads these states; it cannot cause a transition. *(The in-app flow that would let a member start that transition herself is out of scope — see §8.3.)*

---

## 7. Trust & Perspective Architecture

**What the Hub owns and what it does not.** Membership in this community is decided entirely by the community's own vouching — a member is verified when an existing verified member has vouched for them. **Trust scores play no part in that decision and never have.** They are a lens for reading the community, not a gate on entering it. Nothing in this feature area touches membership.

Trust scores are computed by Brainstorm from follows, mutes, and reports. Vouches are not an input to them. The two systems are independent and must stay that way.

**Enhancement-only, without exception.** Every trust surface is an enhancement over a page that already works. If the provider is slow, wrong, or silent, the Members page still lists members, still searches, still vouches. No provider condition may block rendering, and none may block a vouch.

**The verified provider contract** *(probed on the live production provider, 2026-08-24 — recorded here because engineering needs the mapping; no other section uses this vocabulary)*:

| Provider response | Perspective state | Carries |
|---|---|---|
| Success | Available | The scores |
| Refusal (`422`) | Unavailable | A reason, in a header and in the body, both readable by the page |
| Accepted (`202`) | Preparing | A retry estimate, readable by the page |

A successful response does not name the perspective that produced it. The page relies instead on the contract's own guarantee: **the provider serves the perspective it was asked for, or it refuses — it never substitutes one silently.** A success therefore means the requested perspective was honored. This is accepted as sound (§11 Q6, resolved 2026-08-25). The only case it does not cover is an unannounced provider regression that resumed substituting silently, which would be invisible to the page; that is a monitoring concern, not a design one, and it does not affect any requirement here.

**The community's perspective belongs to a Buzz agent account** (`npub1dlmgysu…65v2x2`) — an automated account intended to pass to community management. It is not a stand-in for an individual, and it is the community's perspective by design rather than by expedience (§11 Q7, resolved 2026-08-25).

---

## 8. Scope Boundaries

### 8.1 In Scope (must ship)
- Resolving both perspectives independently, and choosing the page's perspective by the preference order in §5.1.
- All five status-line messages in §5.3, including the registration cause and the wait interval.
- The three indicator phrasings in §5.2.
- The search-panel line in §5.4, in its single situation.
- Suppressing every provider-authored string from the interface (§5.5).
- Never rendering a refused perspective as "no matches" or as a search failure.
- Re-checking a refused perspective on each return to the Members page, so recovery does not require a reload (§5.1 rule 5).
- The two accessibility corrections the design review surfaced: status text that meets contrast minimums, and perspective-control targets that meet size minimums.

### 8.2 Stretch
None. Re-checking was the only candidate and has been promoted into scope.

### 8.3 Out of Scope (Phase 2+)
- **The registration flow.** Letting a member register with the provider and start her own score calculation from inside the Hub. **Confirmed as the next phase**, to be built as a separate story on its own branch. This feature area names the gap and ends Journey B at an explanation; the next one closes it.
- Personalizing the community feed. This feature area is the Members page only.
- Explaining what a trust score means. Deliberately excluded when scores shipped, and still excluded.
- Any change to how membership is decided.
- Any provider-side change, including the wording of provider reasons.

---

## 9. Phase Roadmap

| Phase | Theme | Milestone |
|---|---|---|
| **This phase** | Honest perspectives | Every state in §5.1 renders correctly with its own copy. No provider vocabulary reaches a member. No member sees a number without its perspective. |
| **Next** *(confirmed)* | Closing the registration gap | A member reading "your account isn't registered with Brainstorm" can act on it without leaving the Hub. Journey B ends in a registration rather than an explanation. Built as a separate story on its own branch. **Run User Modeling before designing it** — it is an onboarding flow, and §3.3 is currently assumed. |
| **Later** | Trust legibility | Scores explain themselves; perspective reaches surfaces beyond the Members page. Gated on §11 Q1. |

---

## 10. Success Metrics

Observable, and checkable against a running page.

1. **No unlabeled number.** In every state in §5.1, a trust score is on screen only when the perspective that produced it is also on screen. Target: no exceptions.
2. **No provider vocabulary.** No provider-authored string, algorithm name, status code, key, or operator link appears anywhere in the interface, in any state. Target: zero occurrences.
3. **No silent substitution.** Whenever the page selects a perspective the member did not choose, the status line explains it in the same render. Target: no exceptions.
4. **No selection moves under the member.** Across repeated loads in every state, the perspective control never shows one side selected and then switches. Target: zero occurrences.
5. **The common path is untouched.** With both perspectives available, the page is identical to what ships today — same default, same copy, same ordering, same time to first result.
6. **A refusal never reads as an absence.** In every refusal state, results still render and no empty-state or failure copy appears.
7. **Recovery needs no reload.** A perspective refused during one visit to the Members page is offered again on the next visit, once the provider will serve it.
8. **Contrast and target minimums met** on the status line and both sides of the perspective control.

---

## 11. Questions & Decisions

Resolved by the Product Owner on 2026-08-25 unless marked open. Resolved entries stay in the document — a decision with its options visible is worth more than a deleted question.

### Open

1. **Do trust scores need an explainer?** A score expresses a relationship to a perspective, not a reputation. Whether that reads clearly enough without a "what is this?" affordance is untested. *Options:* add one; test comprehension first; continue to omit it. *Status:* open. Carried unresolved from the build audit. Gates the "Trust legibility" phase in §9.
2. **No competitive research exists for this product.** §2 is reasoned from the product's own structure rather than from evidence. *Options:* run Discovery properly if positioning is going to drive investment; accept §2 as orientation only. *Status:* open. Nothing in §5 depends on it.

### Resolved

3. **The personas have never been validated.** → **Proceed on the assumed personas; run User Modeling later.** §3.3 is explicitly marked assumed. The risk is carried, and §9 places User Modeling before the registration flow is designed, since that phase is an onboarding flow built for a persona nobody has interviewed.
4. **Should the registration gap be closable in-app?** → **Yes.** Confirmed as the next phase, built as a separate story on its own branch. Journey B ends at an explanation in this phase and at a registration in the next. §8.3 and §9 updated.
5. **Should a refused perspective be re-checked during a session?** → **Yes, on each return to the Members page.** A refusal holds for the rest of the current visit; it does not outlive it. Recovery no longer requires reloading the Hub. **This moved re-checking from Stretch into scope** (§8.1) and added §5.1 rules 5 and 6, §6's revised persistence, and §10 metric 7.
6. **The page cannot verify a perspective was honored.** → **Accepted.** The provider serves the requested perspective or refuses; it never substitutes silently. A success therefore means the request was honored. The only uncovered case is an unannounced provider regression, which is a monitoring concern rather than a design one. §7 rewritten accordingly.
7. **Whose perspective should "the community" be?** → **Keep the current account indefinitely.** It is a Buzz agent account, intended to pass to community management — an automated community account by design, not an individual's account used as a stand-in. No interface change: members are not told whose view they are seeing. §7 records the ownership.
