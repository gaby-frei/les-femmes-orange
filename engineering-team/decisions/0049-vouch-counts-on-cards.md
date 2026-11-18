# ADR 0049: Vouch counts on member cards — pure voucher breakdown in the shared module + in-card disclosure list

**Status:** Accepted (PO, 2026-11-18)
**Date:** 2026-11-18
**Story:** `engineering-team/stories/trust-weighted-membership/2-vouch-counts-on-cards.md`
**Builds on:** ADR 0048 (trust-weighted closure: `vouchersByTarget`, `requirement`), ADR 0044
(trust-ordered grids, `patchGridTrustScores`), note-tagging's tag-pill disclosure
(`index.html:3762-3800`).

## Context

**Acceptance criteria (abbreviated):**
- Verified cards read `N vouches` (`1 vouch`). This replaces "by …" / "Founding curator".
- Pending cards read `N of M vouches`.
- The count opens a list of **every** distinct voucher. It opens on hover, tap, or
  Enter/Space, and closes on pointer leave, an outside tap, or Escape. Non-counting vouchers
  (unverified, or self) come after the counting ones, dimmed and marked in text.
- The number of non-dimmed entries equals N.
- Verified cards get a Vouch button, except on your own card or a card you've already
  vouched for. A vouch updates the card in place, or moves a now-verified pending card to the
  verified grid.
- No card's count contradicts its grid. Search rows are unchanged.

**As built** (`public/index.html`, `public/lib/membership.js` at `c1f79ad`):
- `buildTrustWeightedMemberSets` returns `verifiedMap`, `pendingMap`, `vouchersByTarget`
  (distinct **non-self** vouchers), and `requirement: pk → {score, bucket, required,
  counting, remaining}` (`membership.js:73-135`). **Self-vouches are dropped before
  `vouchersByTarget`** (`:92`), so the client can't currently list them.
- `loadMembersPage` (`index.html:2838-2925`) fetches kind-0 metadata only for members and
  each card's *first* voucher (`verifiedMap.values()` / `pendingMap.values()`). It renders
  through `makeMemberCard(hex, metaMap, type, taggerHex, options)` (`:2670`). The verified
  footer holds the badge plus the by-line (`:2761-2767`). Vouch is pending-only, gated by
  `showAttestBtn = canAttest && !alreadyAttested` (`:2889`, `getMyAttestedPubkeys` `:2423`).
- `applyLFOTag` (`:2494-2570`): `res.verified` → removes the card and prepends a fresh
  verified card. Otherwise it shows `Vouched — M more …`. This assumes the card was pending,
  so on a verified card the `verified` branch would **duplicate** the card.
- Existing disclosure pattern: the feed's tag pill is a `<button aria-expanded>` toggling a
  sibling panel (`:3762-3800`). Existing hover-only pattern: `.solution-term::after`
  (`:1194-1228`). It is CSS text only, with no per-entry styling and no tap.
- Grid cards have `transform` on hover (`.member-card:hover`, `:818`), which creates a
  stacking context. An overlay inside a card is drawn under the next card unless that card's
  stacking is raised.

**Constraints:** no build step. The shared module stays pure and browser/Node-identical, and
`api/feed.js` keeps working unchanged (it still uses the legacy export). No new
dependencies. Text from relays (profile names) goes into the DOM through
`textContent`/`escHtml` only. Concept Graph API unreachable at design time; no concept
definition is touched.

## Options considered

### Option A — Pure `voucherBreakdown` in the shared module + an in-card disclosure button *(chosen)*
- Add `selfVouched: Set<pubkey>` to the closure's return value (additive).
- Add a pure `voucherBreakdown(sets, pubkey)` that returns the ordered list
  `[{ pubkey, counting, reason }]`: counting first, then non-counting, with `reason` set to
  `'unverified'` or `'self'`. It also returns `{ counting, required }` from `requirement`.
- The card renders the count as a `<button class="vouch-count" aria-expanded>` controlling
  an absolutely positioned list panel inside the card footer. Hover opens it on
  hover-capable pointers, and click/tap toggles it, which also covers Enter/Space on a
  button. Escape and an outside `pointerdown` close it.
- Pros:
  - "Count and list agree" and "never contradicts the grid" hold because both numbers come
    from one pure function over the same closure output. That function is unit-testable in
    Node, and story #3 can reuse it if the feed ever shows vouchers.
  - A native `<button>` gives keyboard and touch behaviour for free.
  - Reuses the tag-pill disclosure idiom the page already has.
- Cons:
  - Adds one more export to the module.
  - An absolutely positioned panel inside a transformed card needs a small stacking fix (see
    implementation notes).

### Option B — Build the breakdown in `index.html` from `tagItems` + the sets
- The client walks the tag events itself to find self-vouches and orders the list.
- Pros: the shared module doesn't change.
- Cons: it duplicates closure knowledge ("what counts") outside the module that ADR 0048
  made the single owner, so the two could drift. It's also testable only through Playwright.
  Rejected: the module already owns this, and the change there is additive.

### Option C — CSS-only hover tooltip (the `.solution-term` pattern, or `title=`)
- Pros: almost no JS.
- Cons:
  - Can't dim individual entries or add a text marker per entry: `::after` content is one
    string, and `title` is plain text.
  - No tap toggle on touch screens (PO D2) and no Escape handling.
  - The list wouldn't be readable as a list by assistive tech.
  - Rejected: fails AC "Voucher list opens from the count" and AC "Non-counting vouchers
    dimmed".

## Decision

We chose **Option A**. The shared module owns *who counts and why*. The page owns only
*how it's shown*, and it renders a native disclosure button whose number and list both come
from `voucherBreakdown`.

### `voucherBreakdown` (normative)
```
voucherBreakdown(sets, pk) → {
  counting: requirement(pk).counting,
  required: requirement(pk).required,
  vouchers: [ ...[v ∈ vouchersByTarget(pk) | v ∈ verifiedMap] → {pubkey:v, counting:true,  reason:null},
              ...[v ∈ vouchersByTarget(pk) | v ∉ verifiedMap] → {pubkey:v, counting:false, reason:'unverified'},
              ...(pk ∈ selfVouched ? [{pubkey:pk, counting:false, reason:'self'}] : []) ]
}
```
Invariant (unit-tested): `vouchers.filter(v => v.counting).length === counting`. Within each
group, entries keep first-seen event order (no promised ordering beyond D6).

## Consequences
- **Enables** every card AC from one data call per card. Story #3 is unaffected (additive
  exports, and the feed still uses the legacy closure).
- **More profile fetches:** the Members page now asks for kind-0 profiles of *all* vouchers,
  not only the first. Today that is about 57 pubkeys total, all of whom already appear as
  members or taggers, so the added cost is close to zero.
- **The post-vouch flow changes:** instead of patching text, `applyLFOTag` re-renders the one
  affected card from the fresh sets. That removes the duplicate-card bug the new verified
  Vouch button would otherwise trigger.
- **Debt:** none new. The by-line code paths are deleted, not left in place.
- **Firmware reinstall required?** No.

## Implementation notes

**`public/lib/membership.js`**
- In `buildTrustWeightedMemberSets`, record `selfVouched.add(target)` where self-vouches are
  skipped (`:92`), and return `selfVouched` alongside the existing four fields.
- Export `voucherBreakdown(sets, pubkey)` per the normative block. For a pubkey with no
  `requirement` row it returns `{ counting: 0, required: null, vouchers: [] }`, which only
  happens to pubkeys nobody vouched for. Add `window.voucherBreakdown`.

**`public/index.html`**
- `loadMembersPage` (`:2864-2868`): add every voucher in `sets.vouchersByTarget` to
  `allPubkeys` before `fetchMetadata`.
- Pass `vouch: voucherBreakdown(sets, pk)` in `options` to `makeMemberCard` for both grids.
- Compute the Vouch gate once for both grids:
  `showAttestBtn = canAttest && pk !== currentPubkey && !myAttestedPubkeys.has(pk)`.
- `makeMemberCard`, grid branch only (candidates untouched, D3):
  - Delete the by-line / "Founding curator" ternary (`:2763-2765`).
  - In its place, when `options.vouch` is present, render
    `<button type="button" class="vouch-count" aria-expanded="false" aria-controls="…">`
    with the copy below, then a sibling `<ul class="vouch-list" hidden>`.
  - Each `<li>` holds the voucher's name (`display_name || name || hexToNpubShort`), set with
    `textContent`. A non-counting `<li>` gets class `not-counting` (dimmed via `opacity`)
    plus a text suffix: ` — not verified yet` for `unverified` or ` — self-vouch` for `self`.
  - `showVouch` for a grid card becomes `options.showAttestBtn` for both `verified` and
    `pending` types.
- **Count copy:**
  - Verified: `${n} ${n === 1 ? 'vouch' : 'vouches'}`.
  - Pending: `${n} of ${m} ${m === 1 ? 'vouch' : 'vouches'}`.
  - Reuse `vouchWord` (`:2262`).
- **Disclosure behaviour** (one helper, `wireVouchCount(btn, list)`):
  - Click toggles `hidden` and `aria-expanded`. This covers mouse, tap, and Enter/Space.
  - `mouseenter`/`mouseleave` open and close it only when
    `matchMedia('(hover: hover)').matches`.
  - Escape on the button or list closes it and returns focus to the button.
  - A single document-level `pointerdown` listener closes any open list when the target is
    outside its card. Mirror the search panel's detached-target guard (`:2934-2940`).
- **Stacking:** while a list is open, add class `vouch-open` to its card (`position:
  relative; z-index: 5`). The list is `position:absolute` under the count, inside the card,
  with `max-height` + `overflow:auto` for long lists.
- **`applyLFOTag` post-vouch** (`:2526-2555`): after `res.ok`, await `getMemberSets()` (it
  is cached, and `publishVouch` just rebuilt it) and `fetchMetadata` for the target's
  vouchers.
  - **Card was verified** (`card.closest('#verified-members-grid')`): replace the card with a
    fresh verified card (`showAttestBtn: false`), and put a `Vouched` note where the button
    was. The count updates, and the viewer appears in the list as counting.
  - **Card was pending, now verified:** keep today's move to the verified grid, but build the
    moved card with `vouch` data. The `pending-count` / `verified-count` updates and
    `patchGridTrustScores()` are unchanged.
  - **Card was pending, still short:** replace it in place with a fresh pending card that has
    the `vouchedFeedbackCopy(res.remaining)` note where the button was.
  - **Scores unreachable after publish** (`res.remaining === null`, no sets): keep the old
    card and show the `Vouched` note, as today. Re-chip replaced cards with
    `patchGridTrustScores()` (not awaited).
- No change to `runMemberSearch` / the free-text panel / `makeMemberCard`'s candidate branch.

**Test seams:** `voucherBreakdown` and `selfVouched` are `require`-able in Node
(`test/membership-policy.test.js` fixtures). New DOM hooks: `.vouch-count`, `.vouch-list`,
`.vouch-list li.not-counting`, and `.attest-btn` on `#verified-members-grid` cards. Playwright
can emulate touch with `hasTouch` and `page.tap`, and hover with `.hover()`.

## Out of scope
- Search-result rows (story D3).
- Grid ordering by vouch count. ADR 0044 trust ordering is unchanged.
- Server-side use of `voucherBreakdown` (story #3 decides).
- Profile pictures in the voucher list. Names only.
