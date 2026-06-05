# Les Femmes Orange — Project Context

## What We're Building

A website gated by a community-managed, decentralized membership list. Access requires a Nostr keypair. A user is a verified member when their npub has been tagged with the **LFO tag** by another existing verified member. The canonical member list is a **NIP-51 kind 30000** event published and maintained by `tags.brainstorm.world` — **we consume it, we do not publish it**.

---

## The LFO Tag (Source of Truth)

The LFO tag is a DList item defined on the Tapestry protocol. 
The LFO concept event is kind **39999**, not 39998. It is an item within the broader "tag" taxonomy, not a standalone list header.
LFO tag items (kind 39999) use an e tag to point back to the LFO concept event ID (4ddde08a...).

The feilds of the LFO concept definition are as follows: 

| Property | Value |
|---|---|
| Tag concept event ID | `4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795` |
| Tag concept kind | **39999** (a DList item — child of the "tag" concept) |
| Tag concept pubkey | `e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c` |
| Tag concept d-tag | `lfo` |
| Tag concept address | `39999:e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c:lfo` |
| Parent concept | `39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:tag` |
| Events live on | `wss://tags.brainstorm.world/relay`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://relay.damus.io` |
| DCoSL relay | `wss://dcosl.brainstorm.world` — reachable but holds 0 LFO tag events (not synced there) |

**Note:** As of June 1, 10:00PM CET, `wss://tags.brainstorm.world/relay` and `wss://nos.lol` were complete and up to date. 

A user is "tagged LFO" when a kind 39999 DList item exists that:
1. Has an `#e` tag pointing to the tag concept event ID 
2. Has a `p` tag containing the tagged user's pubkey
3. Was signed (authored) by a user who is themselves a verified member

---

## Tapestry Protocol Reference

The `tapestry/` directory contains the full reference implementation (`tapestry/tapestry/`).
The live deployment relevant to this project is `tags.brainstorm.world` — branch `feat/pubkey-tagging-target`, stood up 2026-05-12, long-lived sandbox for the pubkey-tagging feature.

### Relay URL

The strfry relay WebSocket is at:
```
wss://tags.brainstorm.world/relay
```
Nginx proxies `/relay` → strfry WebSocket inside the Docker container. This is both the standard Nostr relay and the NIP-50 search entry point.

### DList Event Kinds

Kinds 39998, 9998, 39999, 9999 are custom to the Tapestry protocol and all fall within NIP-33's addressable range (30000–39999) and the general-purpose non-replaceable range.

| Kind | Type | Role |
|------|------|------|
| 39998 | Replaceable List Header | Defines a named concept/list (has `d` tag, addressable) |
| 9998 | Non-replaceable List Header | Same, permanent, referenced by event ID |
| 39999 | Replaceable List Item | Entry in a list; references parent via `z` tag |
| 9999 | Non-replaceable List Item | Same, permanent |

### Key Tags on DList Items

These fields define any DList item, including both concept-definition events and member-tagging events.

| Tag | Meaning |
|-----|---------|
| `z` | Parent concept address: `39998:<pubkey>:<dtag>` (or `9998:<pubkey>:<dtag>`) |
| `p` | Pubkey of the person being tagged/listed |
| `name` | Human-readable name for the item |
| `d` | Deterministic identifier (replaceable items only) — derived as `slug(name)-hash8(parentRef)` |

### Pubkey-Tagging Event Format (feat/pubkey-tagging-target)

The `feat/pubkey-tagging-target` branch on `tags.brainstorm.world` uses a **specific event format** for LFO pubkey-tagging that differs from the generic DList item structure. This is confirmed by inspecting events on the relay.

**Correct format for publishing an LFO attestation:**

```js
{
  kind: 39999,
  tags: [
    ['d',        `profile-tag-lfo-${targetHex.slice(0,8)}-${taggerHex.slice(0,8)}`],
    ['e',        '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795'],  // LFO concept event ID
    ['z',        '39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:nostr-user-tag'],
    ['p',        targetHex],
    ['polarity', '1'],
  ],
  content: '',
}
```

Key points:
- `z` is `nostr-user-tag` (NOT the direct LFO concept address `39999:e83fff7a...:lfo`)
- `d` is `profile-tag-lfo-<first8 of tagged>-<first8 of tagger>` — simple hex prefix, no hash
- `polarity: 1` signals a positive application
- No `name` tag

Brainstorm's profile UI and membership computation query by `z` = `nostr-user-tag`. Events using `z` = `39999:e83fff7a...:lfo` (the LFO concept address directly) are **not recognised** by brainstorm's profile display.

### Querying LFO Tag Items

Filter by both `#e` (concept event ID) and `#z` (parent concept) to match only the correct format:

```js
{
  kinds: [9999, 39999],
  "#e": ["4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795"],
  "#z": ["39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:nostr-user-tag"]
}
```

**Relay priority order** (most complete first):
1. `wss://tags.brainstorm.world/relay` 
2. `wss://nos.lol` 
3. `wss://relay.primal.net` 
4. `wss://relay.damus.io` 
5. `wss://dcosl.brainstorm.world`

Always query multiple relays in parallel via `SimplePool.querySync()` and deduplicate by event ID to get the full set.

For each result item:
- Tagged pubkey = `item.tags.find(t => t[0] === 'p')?.[1]`
- Tagger pubkey = `item.pubkey`

### Key tapestry source files to reference

- `tapestry/tapestry/src/lib/dtag.js` — d-tag derivation (`slug` + `hash8`)
- `tapestry/tapestry/src/api/trustedList/index.js` — event signing + strfry publish pattern
- `tapestry/tapestry/src/middleware/auth.js` — full challenge-sign auth flow
- `tapestry/tapestry/ui/src/utils/nostrPublish.js` — `SimplePool`, relay fetch/publish helpers
- `tapestry/tapestry/ui/src/pages/lists/NewDListItem.jsx` — DList item event structure
- `tapestry/tapestry/ui/src/pages/lists/DListItems.jsx` — `p` tag extraction pattern

---

## NIP-51 Kind 30000 — Constraints

The canonical member list is a **NIP-51 kind 30000 "Follow Set"** event, published by `tags.brainstorm.world`. 

**We only read this list — we never write to it.**

### What kind 30000 is (from NIP-51 spec + tapestry firmware)

- **Parameterized-replaceable** (addressable by `d` tag): `30000:<publisher-pubkey>:<d-tag>`
- Multiple follow sets per user are allowed (unlike kind 3, which is a single list)
- The `d` tag names the set
- Optional `title`, `image`, `description` tags for UI
- Members are listed as `p` tags in the `tags` array (public entries)
- Private entries, if any, are stored as a NIP-44-encrypted JSON array in `content` — we treat `content` as opaque since we have no key to decrypt it
- Items are appended in chronological order (oldest first) per NIP-51

### What we don't know yet (to confirm with tags.brainstorm.world operator)

- The exact **publisher pubkey** who signs the kind 30000 event on tags.brainstorm.world
- The exact **d-tag** used for the LFO members set
- Whether private entries exist (content encrypted) — if so, only public `p` tags are visible to us

Once confirmed, the list address will be:
```
30000:<publisher-pubkey>:<d-tag>
```

### How we consume the list

On server startup and on a recurring sync, fetch the latest kind 30000 event:
```js
{
  kinds: [30000],
  authors: ["<publisher-pubkey>"],
  "#d": ["<d-tag>"]
}
```

Cache the set of `p` tag pubkeys in memory. This is the gate: if a user's pubkey is in this set, they have access.

---

## Verification Algorithm (for reference / future re-sync)

This is how `tags.brainstorm.world` determines who belongs in the NIP-51 list. We don't run this — the tapestry instance does. Documented here so we understand the trust model:

A user `P` is a **verified member** if and only if:

1. There exists a kind 9999/39999 event (on public relays) where:
   - The `#e` tag references `4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795`
   - The `p` tag equals `P`'s pubkey
   - The event's `pubkey` (the tagger) is also a verified member
2. **Bootstrap seed**: `npub1aqll77sskvxups5kcc45gz4fquwfqnvqkxzzqdqm2sj6sx7ks4kq3zqr3p` — the account that bootstrapped the primary curator.

Iterative algorithm:
```
seed = { npub1aqll77sskvxups5kcc45gz4fquwfqnvqkxzzqdqm2sj6sx7ks4kq3zqr3p }
verified = seed

repeat:
  for each tag_item in all_lfo_tag_items:
    if tag_item.tagger ∈ verified AND tag_item.tagged ∉ verified:
      add tag_item.tagged to verified
until no changes
```

**Trust chain:** Bootstrap seed tagged the primary curator, who tagged 42 members.
- Seed: `npub1aqll77sskvxups5kcc45gz4fquwfqnvqkxzzqdqm2sj6sx7ks4kq3zqr3p`
- Primary curator: `npub1hz5alqscpp8yjrvgsdp2n4ygkl8slvstrgvmjca7e45w6644ew7sewtysa` (hex: `b8a9df8218084e490d888342a9d488b7cf0fb20b1a19b963becd68ed6ab5cbbd`)

---

## Authentication Flow (NIP-07)

1. Frontend calls `window.nostr.getPublicKey()` → user's hex pubkey
2. Backend generates a 32-byte random hex challenge, stores in session
3. Frontend signs a challenge event via `window.nostr.signEvent()` — event includes challenge in a tag
4. Backend verifies the event signature and challenge tag match
5. Backend checks if pubkey is in the cached NIP-51 kind 30000 member set
6. If yes: session marked authenticated; user sees gated content

---

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: React + Vite (or lightweight HTML/JS — TBD)
- **Nostr library**: `nostr-tools` (same as tapestry reference implementation)
- **Relay client**: `nostr-tools` `SimplePool` for querying `wss://tags.brainstorm.world/relay`
- **Session**: `express-session`

---

## Key Decisions

- We are a **read-only consumer** of the NIP-51 list — `tags.brainstorm.world` owns it
- The cached NIP-51 `p` tag set is the runtime gate (not a per-request relay query)
- Membership is binary: in the list = access, not in the list = denied
- Private/encrypted entries in the kind 30000 `content` field are ignored — we only read public `p` tags
- No GrapeRank or influence scoring
- The NIP-51 publisher pubkey and d-tag must be confirmed before implementation

---

## Open Questions (confirm before implementing)

1. What is the **publisher pubkey** of the kind 30000 list on `tags.brainstorm.world`?
2. What is the **d-tag** of the LFO members set?
3. How often should we re-sync the list from the relay? (startup only, on login, cron?)
4. Frontend: React + Vite or plain HTML/JS?

---

## Directory Layout (planned)

```
les-femmes-orange/
  CLAUDE.md              ← this file
  tapestry/              ← reference implementation (read-only)
    tapestry/            ← cloned repo (branch feat/pubkey-tagging-target context)
  src/
    server/
      auth.js            ← NIP-07 challenge-sign endpoints
      membership.js      ← NIP-51 list read + in-memory cache
      relay.js           ← nostr-tools SimplePool relay client
      index.js           ← Express app entry point
    client/
      pages/
        SignIn.jsx        ← NIP-07 login page
        Home.jsx          ← gated content
      components/
        AuthGate.jsx      ← membership check wrapper
```
