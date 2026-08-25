# Design Guide: Perspective Availability

**Slug:** pov-availability
**Date:** 2026-08-24

> Visual rules, design tokens, component patterns, and wireframe references for the states the Members page enters when a trust perspective cannot be served. Binding during engineering review. Honors `product-team/guardrails/design.md` and `product-team/guardrails/language.md`.

**Scope.** The Members page only. Three surfaces: the Community/My view toggle, the search perspective indicator, and the search panel. Trust chips on member cards inherit the perspective rules but gain no new states.

**Inputs.** `engineering-team/audits/npub-search/prd-seed.md` §5 (as-built design rules) and §7 (open questions). ADR 0047 and branch `pr-1` as a reference implementation — followed on structure, departed from on copy, for the reasons recorded below.

**Wireframe.** `product-team/guides/wireframes/pov-availability-states.html`

---

## The reframe this guide rests on

The reference implementation treats an unservable perspective as an **error**: a warning symbol, the provider's own sentence, and the word "unavailable" in front of the member. That is the wrong category.

Nothing has gone wrong from the member's side. They asked to find someone on Nostr, and they will get ranked results. What changed is **whose judgment ordered them**. The app already has a name for that idea and a place to show it — the perspective indicator that reads *"— searching as Les Femmes Orange."*

So this guide models the fallback as a **third perspective**, not a failure:

| Perspective | Whose trust graph orders the results | How the member reaches it |
|---|---|---|
| Les Femmes Orange | The community's designated account, `npub1dlmgysu…65v2x2` | Default |
| You | The signed-in member's own | Opt-in, when their scores exist |
| Brainstorm's default | The provider's own house account — **not** personalized to this community | Automatic, when the chosen perspective can't be served |

Naming the third perspective satisfies the never-mix rule (`prd-seed` §5: *"One perspective per page… the active view is always visible"*) more completely than a warning does. A warning tells the member something is broken. A perspective label tells them what they are looking at, which is the thing they actually need to know and the thing that is actually true.

**The third perspective is not "the Nostr network."** When a personalized algorithm is refused, the provider's documented remedy is its *default* algorithm (`graperank` / `relevance`) — which is itself rooted in Brainstorm's own house account. Calling that "the whole network" would trade one inaccuracy for another. What a member can actually verify is the negative: these results are **not personalized to Les Femmes Orange**. That is what the copy says.

**This is the one substantive departure from ADR 0047.** Its decisions 2, 4, and 5 surface the provider's reason string verbatim. Decision D3 below reverses that.

---

## Design principles

Each is enforceable in review.

1. **A perspective is always named, and only one is named at a time.** Every trust surface on the page reflects the same perspective, and the active perspective appears in the indicator at all times. A member must never be able to read a number without being able to read whose view produced it.
2. **Protocol language never reaches a member.** Provider reason strings, algorithm names, status codes, hex pubkeys, and operator URLs are diagnostics. They belong in `console.warn`, never in the DOM. The app maps a machine state to its own plain sentence.
3. **Degrade to the best alternative that can be served, never to nothing and never to a lie.** Prefer a personalized perspective over an unpersonalized one: community first, the member's own second, unpersonalized last. Then say what the member is looking at, or — when the app cannot verify that — what it is not. Claim only what the app can verify: it knows the community's ranking was refused, so it says results aren't personalized to the community. It does not know whose ranking replaced it, so it does not name one. An unservable perspective is never rendered as "no matches" and never rendered as a generic failure.
4. **Reserve error styling for errors.** Warning color, warning symbols, and the word "unavailable" in the results area are for things the member can act on. A perspective substitution is a status, and it takes status styling: small, grey, quiet, above the content it describes.
5. **A wait is described in the member's units.** When the provider says scores are coming, translate `Retry-After` into a plain interval. "Check back in about 10 minutes" is a designed state. "Still computing" is a shrug.
6. **Recovery is silent; substitution is not.** When a perspective becomes servable again, the control re-enables without an announcement — no success toast, no "restored" banner. But when the page *moves* a member into a perspective they did not choose, it says so plainly. The distinction: restoring a choice needs no words, taking one does.

---

## Visual identity

The Members page has a shipped visual system. This guide adds **no new colors, faces, or radii** — every value below already exists in `public/index.html`. The work here is choosing which existing treatment each new state earns.

- **Color palette.** Accent `--orange #f5945c` for all interactive elements and for the perspective indicator, which is the accent's one non-interactive use (established in story #3 and kept). Semantic amber `#b45309` on `--amber-light` remains reserved for the input hint and the profile-less warning. Status text is grey. **No new color enters the page for these states** — that is the point of principle 4.
- **Typography.** System sans throughout, matching the app. Status lines at `0.75rem/1.5`, the same size as the existing `.pov-disabled-note`. The search input stays monospace, since it accepts keys.
- **Spacing.** The shipped scale: `0.45rem` inside panel rows, `0.6rem` around status lines, `1.5rem` under the toggle block.
- **Elevation.** Unchanged. The search panel keeps `0 14px 36px rgba(0,0,0,0.13)`; status lines are flat and never elevated, because they annotate rather than overlay.

## Design tokens

Existing tokens, unchanged, reproduced so components reference names rather than values:

```css
:root {
  /* color — shipped */
  --orange:       #f5945c;
  --orange-light: #fde8d8;
  --orange-dark:  #e0743a;
  --white:        #ffffff;
  --grey-mid:     #e0e0e0;
  --grey-text:    #777777;
  --dark:         #1c1c1c;
  --dark-mid:     #2e2e2e;
  --amber:        #f59e0b;
  --amber-light:  #fef3c7;

  /* color — one addition, for accessibility (see baseline below) */
  --grey-text-strong: #5f5f5f;

  /* spacing — shipped */
  --space-1: 0.45rem;
  --space-2: 0.6rem;
  --space-3: 1.5rem;

  /* radius — shipped */
  --radius-panel: 12px;
  --radius-input: 8px;
}
```

`--grey-text-strong` is the only new token. `--grey-text #777777` on white measures **4.48:1**, just under the 4.5:1 AA threshold for text below 18pt. Every status line in this design is 12px, so it must not use `--grey-text`. `#5f5f5f` measures **6.5:1**. Existing uses of `--grey-text` are out of scope here and unchanged.

---

## The state model

Three provider outcomes, resolved per perspective:

| Provider outcome | Perspective state | Persistence |
|---|---|---|
| Scores served | **Available** | — |
| Refused, no scores and none scheduled | **Unavailable** | Sticky for the session |
| Scheduled, still computing | **Preparing** | Transient; re-checked on the next call |

The two perspectives are resolved **independently**. Neither one's state is inferred from the other, and the page's default falls out of the pair.

### Resolution matrix

| Community perspective | Member's own | Page defaults to | Toggle | Status line |
|---|---|---|---|---|
| Available | Available | **Community view** | Both enabled | *(none)* |
| Available | Unavailable or Preparing | **Community view** | My view disabled | Registration gap, or the wait |
| **Unavailable** | **Available** | **My view** | Community disabled | Community refused, own view substituted |
| Unavailable | Unavailable | **Neither** — unpersonalized results | Both disabled | Not personalized to the community |

**The default is a preference order, not a constant.** ADR 0046 set "session-default community view," which was correct when the community perspective was the only one guaranteed servable. The rule generalizes: *the page shows the most community-specific perspective that can actually be served.* Community first, the member's own second, unpersonalized last. Community view remains the default in every case where it works, which is the overwhelming majority.

**A personalized alternative beats an unpersonalized one.** When the community's ranking is refused but the member's own works, showing their own ranking is strictly better than falling to Brainstorm's default account. The results stay personal to someone the member has a reason to trust — themselves.

### Rules the matrix implies

- **Resolve both perspectives before painting the toggle.** A member must never see Community view selected and then be moved out of it. If that costs a brief moment where the toggle is not yet interactive, take it — a silent switch under the member's eyes is worse than a short wait.
- **An unrequested switch is always explained.** Row 3 puts a member in a perspective they did not choose. The status line says so. This is the one case where a perspective change the member did not initiate is announced, and it is announced because they did not initiate it.
- **Switch at most once per session.** If the community perspective becomes servable again after a member was moved to My view, re-enable the Community segment and leave them where they are. They can switch back themselves. A second unrequested move would be worse than the first.
- **A disabled segment is dimmed, never removed.** In every row the member can still read which perspectives exist and which one the page is using.

---

## Copy

The complete set. No string outside this table reaches a member.

### Perspective indicator — `.pov-indicator`

| State | Copy |
|---|---|
| Community view active | `— searching as Les Femmes Orange` *(shipped, unchanged)* |
| My view active, chosen or substituted | `— searching as you` *(shipped, unchanged)* |
| Both unavailable | `— not personalized to the community` |

The indicator names the perspective and nothing else, so a substituted My view reads exactly like a chosen one. That is correct: the results are identical, and the *why* belongs to the status line. Only the last row drops "searching as" — there is no *who* to search as, and preserving the grammar would imply one.

### Toggle status line — `.pov-status-note`

Generalizes the shipped `.pov-disabled-note`. Same slot, same styling, one line at a time.

| Matrix row | Copy |
|---|---|
| Both available | *(no line)* |
| My view unavailable | `My view isn't available yet because your account isn't registered with Brainstorm.` |
| My view preparing | `My view is being set up. Check back in about {interval}.` |
| Community unavailable, own view served | `Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.` |
| Both unavailable | `Results aren't personalized to the community right now. Neither view is available.` |

`{interval}` comes from `Retry-After`, rounded to a plain unit: "a minute", "about 5 minutes", "about an hour". If the header is absent or unparseable, use `Check back in a few minutes.`

**"Brainstorm" is member-facing vocabulary in this product.** The shipped line — *"My view isn't available for your account yet"* — states a fact without a cause, which leaves a member with nothing to do and no idea why. Naming the registration gives the state a reason a person can act on, and it is the sentence a future provisioning flow attaches to. Brainstorm is a service the member can be registered with, not an implementation detail, so it earns a name in a way `graperank-pov` never does.

### Search panel notice — `.member-search-notice`

One line, above the result rows. It appears in **one** matrix row only — both perspectives unavailable — because that is the only state where the rows came from nobody the member chose.

| Matrix row | Copy |
|---|---|
| Both unavailable | `These results aren't personalized to the community.` |
| Community unavailable, own view served | *(no notice)* |

The third row of the matrix needs no notice: those results *are* personalized, to the member, and the indicator directly above says `— searching as you`. Adding a caveat there would imply something is wrong with rows that are in fact the best ones the page can produce.

Where the notice does appear it stays short, because the indicator above already carries the reason. The panel says what these rows *are*; the toggle status line says *why*. Neither repeats the other.

### Strings that are removed

The reference implementation's `⚠️ {server reason} — showing network-default results instead.` is deleted, along with the reason string's path into the DOM. Three guardrail violations in one line: emoji in product copy, an em-dash sentence join, and protocol vocabulary ("pov", "algorithm", "graperank-pov", a provisioning URL for an operator, a 64-character hex key). The reason still gets captured — `console.warn` — where a developer can read it and a member cannot.

---

## Component patterns

### Perspective toggle — `.pov-toggle`

- **Visual.** Unchanged. Pill container `#f2f2f4`, 1px `--grey-mid`, centered. Selected segment white with `0 1px 4px rgba(0,0,0,0.12)`. Community segment carries the orange bitcoin mark; My view carries the member's avatar.
- **Behavior.** A choice control, not a status display. Its labels never change to report a provider condition — a radio whose label mutates under the user destroys the meaning of the choice. Status goes in the line beneath.
- **Empty / loading / error.** Both perspectives resolve before the toggle becomes interactive, so the member never sees a selection move under them. During that moment the toggle renders in its resting shape with no status line — the checks are fast and a skeleton would flicker. Any disabled segment takes `opacity: 0.55` with `cursor: not-allowed`, as shipped, and the selected segment keeps its white pill whether or not it is disabled. The control is dimmed, never removed: a member must always be able to read which perspectives exist and which one the page is using.

### Toggle status line — `.pov-status-note`

- **Visual.** `0.75rem`, `--grey-text-strong`, centered, `margin: 0 0 var(--space-3)`. No color, no symbol, no border.
- **Behavior.** One line at a time, by priority: the active perspective's condition wins. When nothing applies the element stays in the DOM and is hidden, so no ghost gap remains. *(Amended 2026-08-25, PO-ratified via ADR 0047: this originally called for removing the element. A live region that is destroyed and recreated does not announce reliably, and announcing is what the accessibility baseline below requires, so the element persists and hides instead. The visual intent is unchanged.)*
- **Empty / loading / error.** Empty is the default and correct state. It has no loading state. It *is* the error state, in its quietest possible form.

### Perspective indicator — `.pov-indicator`

- **Visual.** Unchanged. `0.75rem`, weight 600, `--orange`, inline after the "Find someone on Nostr" label.
- **Behavior.** Always present, always current, updated in the same pass that updates the toggle so the two can never disagree. It is the single always-visible answer to "whose numbers am I reading."
- **Empty / loading / error.** Never empty. During fallback it states what the results are not, rather than blanking, because a missing label is worse than a modest one.

### Search panel notice — `.member-search-notice`

- **Visual.** `0.75rem/1.5`, `--grey-text-strong`, padding `var(--space-2) var(--space-1) var(--space-1)`, a `1px solid var(--grey-mid)` bottom rule. It mirrors `.member-search-footnote` inverted — that component sits below the rows with a top rule, this one sits above with a bottom rule. Same family, opposite anchor, so the panel reads as one designed object.
- **Behavior.** Renders above the rows, inside the panel, and scrolls with them. Present only on fallback.
- **Empty / loading / error.** The panel's shipped states are untouched: `.member-search-loading` (spinner plus "Searching profiles…"), `.member-search-empty` ("No profiles matched that search."), `.member-search-unavailable` ("Search is temporarily unavailable…"). **A refused perspective must never render as any of these three.** It has its own state, with rows.

### Trust chips — `.member-trust-chip`

- **Visual.** Unchanged.
- **Behavior.** Render during fallback, carrying network-perspective values. They are real numbers from a real, named perspective. They are never cached under the refused perspective's key.
- **Empty / loading / error.** Chipless remains the shipped degraded state for a pubkey with no score. Unchanged.

---

## Screen inventory

One screen, seven states.

| State | Purpose | Wireframe |
|---|---|---|
| Community available | The shipped default. Baseline for comparison. | `wireframes/pov-availability-states.html#s1` |
| My view available | The shipped opt-in perspective. | `wireframes/pov-availability-states.html#s2` |
| My view unavailable | The common case. Segment disabled, status line names the registration gap. | `wireframes/pov-availability-states.html#s3` |
| My view preparing | Scores are coming. A wait with a number on it. | `wireframes/pov-availability-states.html#s4` |
| Community unavailable, own view served | The page moves the member to their own perspective and says so. Community segment disabled. | `wireframes/pov-availability-states.html#s5` |
| Both unavailable | Both segments disabled; every surface says results aren't personalized. | `wireframes/pov-availability-states.html#s6` |
| Search panel, both unavailable | Result rows under a not-personalized notice. | `wireframes/pov-availability-states.html#s7` |

---

## Responsive behavior

- **Desktop (≥ 900px).** As shipped. Toggle centered above the grids; indicator inline with the search label on one row.
- **Tablet (600–899px).** Unchanged from shipped behavior. The status line wraps to two lines at the community-fallback string; it is centered, so wrapping stays balanced.
- **Mobile (< 600px).** The `.members-section-header` row wraps, putting the perspective indicator on its own line beneath "Find someone on Nostr". It keeps its accent color and left alignment, so it still reads as attached to the search. The toggle stays a single row — two segments at `0.45rem 1rem` fit within 320px. The panel notice wraps freely; no truncation, no ellipsis. **No status copy is ever shortened for narrow screens** — a perspective statement that only half-appears is worse than one that takes two lines.

## Accessibility baseline

- **Contrast.** Status lines and the panel notice use `--grey-text-strong` (6.5:1 on white). The orange indicator `#f5945c` on white measures **2.2:1** — it fails AA on its own. It is legible in the shipped design because it is 600-weight and paired with an adjacent label, but **color is never the only carrier**: every perspective statement is a complete sentence or phrase that reads correctly in monochrome. A member who cannot distinguish the orange still reads "not personalized to the community."
- **Announcement.** The status line and the panel notice carry `role="status"` with `aria-live="polite"`, on a persistent element (see the amendment under Toggle status line). A perspective change is a fact a screen-reader user needs, and it happens without their input. It must not be `assertive` — it is not urgent and must not interrupt typing.
- **Toggle semantics.** The shipped `role="radiogroup"` / `role="radio"` / `aria-checked` structure is unchanged. The status line is referenced by `aria-describedby` from the disabled segment, so the reason arrives with the control rather than as a stray line.
- **Touch targets.** The segments currently compute to roughly **34px** tall (`0.45rem` padding on `0.85rem` text). That is under the 44px minimum. Raise the vertical padding to `0.7rem` to reach 44px. This is a shipped defect surfaced by the review, not a new requirement.
- **Keyboard.** Unchanged: arrow keys move within the radiogroup, `Tab` leaves it. A disabled segment stays focusable so its `aria-describedby` reason can be read — `aria-disabled="true"` rather than the `disabled` attribute, which would remove it from the tab order and hide the explanation from exactly the members who need it most. This matters most in the community-fallback state, where **both** segments are disabled: with the `disabled` attribute the whole radiogroup would drop out of the tab order and a keyboard user would never reach the line explaining why.
- **Motion.** No new animation. Perspective changes swap text and re-order grids; the shipped re-order is not animated and should stay that way under `prefers-reduced-motion` or otherwise.

---

## What this guide does not decide

- Whether the community perspective should be a community-owned account at all. `prd-seed` §7 carries that question; it is a governance decision, not a design one.
- Whether trust chips need a "what is this?" explainer. Deliberately excluded from story #3 and still open in `prd-seed` §7. This guide does not add one, and the fallback state does not make the case more urgent.
- Any provider-side behavior. The 422/202 contract, `X-Reason` exposure, and reason wording belong to `nosfabrica/brainstorm_server`.
