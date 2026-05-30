# Les Femmes Orange — Project Context

## What We're Building

A website gated by a curated, decentralized membership list. Access requires a Nostr keypair. A user is a verified member when their npub has been tagged with the **LFO tag** by another existing verified member. The canonical member list is a **NIP-51 kind 30000** event published and maintained by `tags.brainstorm.world` — **we consume it, we do not publish it**.

---

## The LFO Tag (Source of Truth)

The LFO tag is a DList item defined on the Tapestry protocol.

| Property | Value |
|---|---|
| Tag concept event ID | `4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795` |
| Tag concept kind | **39999** (a DList item — child of the "tag" concept) |
| Tag concept pubkey | `e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c` |
| Tag concept d-tag | `lfo` |
| Tag concept address | `39999:e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c:lfo` |
| Parent concept | `39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:tag` |
| Events live on | `wss://tags.brainstorm.world/relay`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://relay.damus.io` |
| DCoSL relay | `wss://dcosl.brainstorm.world` — reachable but holds **0** LFO tag events (not synced there) |

**Important:** The LFO concept event is kind **39999**, not 39998. It is an item within the broader "tag" taxonomy, not a standalone list header.

A user is "tagged LFO" when a kind 39999 DList item exists that:
1. Has an `#e` tag pointing to `4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795`
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

| Kind | Type | Role |
|------|------|------|
| 39998 | Replaceable List Header | Defines a named concept/list (has `d` tag, addressable) |
| 9998 | Non-replaceable List Header | Same, permanent, referenced by event ID |
| 39999 | Replaceable List Item | Entry in a list; references parent via `z` tag |
| 9999 | Non-replaceable List Item | Same, permanent |

### Key Tags on DList Items

| Tag | Meaning |
|-----|---------|
| `z` | Parent concept address: `39998:<pubkey>:<dtag>` (or `9998:<pubkey>:<dtag>`) |
| `p` | Pubkey of the person being tagged/listed |
| `name` | Human-readable name for the item |
| `d` | Deterministic identifier (replaceable items only) — derived as `slug(name)-hash8(parentRef)` |

### Querying LFO Tag Items

The concept is kind 39999, so tag items reference it via `#e` (event ID):

```js
// Fetch all events that tag a user with the LFO concept:
{ kinds: [9999, 39999], "#e": ["4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795"] }
```

**Relay priority order** (most complete first):
1. `wss://tags.brainstorm.world/relay` — 46 events (most complete)
2. `wss://nos.lol` — 46 events
3. `wss://relay.primal.net` — 44 events
4. `wss://relay.damus.io` — 39 events
5. `wss://dcosl.brainstorm.world` — 0 events (reachable but not synced)

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

The canonical member list is a **NIP-51 kind 30000 "Follow Set"** event, published by `tags.brainstorm.world`. **We only read this list — we never write to it.**

### What kind 30000 is (from NIP-51 spec + tapestry firmware)

- **Parameterized-replaceable** (addressable by `d` tag): `30000:<publisher-pubkey>:<d-tag>`
- Multiple follow sets per user are allowed (unlike kind 3, which is a single list)
- The `d` tag names the set
- Optional `title`, `image`, `description` tags for UI
- Members are listed as `p` tags in the `tags` array (public entries)
- Private entries, if any, are stored as a NIP-44-encrypted JSON array in `content` — we treat `content` as opaque since we have no key to decrypt it
- Items are appended in chronological order (oldest first) per NIP-51

### What we don't know yet (to confirm with tags.brainstorm.world operator)

- The exact **publisher pubkey** who signs the kind 30000 event
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

## Current Member List (queried 2026-05-30)

**46 tag events → 43 unique verified npubs.** All tagged on 2026-05-30.

The query script is at `/tmp/lfo-query/query2.mjs` (uses `nostr-tools` `SimplePool`).

| # | npub | hex pubkey | Tagged by | Time UTC |
|---|------|------------|-----------|----------|
| 1 | `npub1hz5alqscpp8yjrvgsdp2n4ygkl8slvstrgvmjca7e45w6644ew7sewtysa` | `b8a9df82...cbbd` | seed | 09:04 |
| 2 | `npub1xff8z42r7mjrhcyxgegjnvps637hdnuvat28nrjgsezk8seh2zpseqt6y0` | `32527155...3083` | curator | 09:38 |
| 3 | `npub1cxw2u3wuleask4ransck6dzxlf59m82ajtdqky8lpppn49p70lnqqznt7u` | `c19cae45...e7fe6` | curator | 09:45 |
| 4 | `npub1dg6es53r3hys9tk3n7aldgz4lx4ly8qu4zg468zwyl6smuhjjrvsnhsguz` | `6a359852...90d9` | curator | 09:46 |
| 5 | `npub1dlhn2xse6v40xk5qhw5zlsclsz7u47lg6cp0w3yvnawrs25gggzqudq2la` | `6fef351a...4204` | curator | 09:48 |
| 6 | `npub1tlacuxmtv2wqud9qz0ujnr4mqavmnz3ayspfj93jr40tgf2mvu6seax3y7` | `5ffb8e1b...6735` | curator | 09:49 |
| 7 | `npub1pzptxv5nwqnr8mvz88ll6sq3hwq2c3yv439pr9puguzvwn5qz8jsj3ax2p` | `0882b332...1e5` | curator | 09:51 |
| 8 | `npub19aftr8lpgz8knmswjz0d3l9vzwx97dcvqh0zfuxcxu9d57t4yv3sz4v28l` | `2f52b19f...2323` | curator | 09:52 |
| 9 | `npub1hwgw0uznr49t4gullpgfz4m5xnakl5a0l88m3k382xv7ys0tfmlsd503sg` | `bb90e7f0...4eff` | curator | 09:53 |
| 10 | `npub134d6jtyveg74cuuj7qun4v2m6r7x7c6ryk69z4q7pa7f43kran2sl2yggk` | `8d5ba92c...ecd5` | curator | 09:54 |
| 11 | `npub1tc4q7lfxgeet0d3afacnxrlgslcywgfgagtczxm764tx8ytww26s8g0f8j` | `5e2a0f7d...72b5` | curator | 10:09 |
| 12 | `npub16fnc3ehazd75xh6trr56jxjkw54qqwfvhfmjrktxv4e5tgg6a64schky0p` | `d26788e6...eeab` | curator | 10:10 |
| 13 | `npub1rldkmtrsysn7jhefzvp342e26ts7x3tp5ss5gq40c5tuqe0tn29qsr5mmt` | `1fdb6dac...98a` | curator | 10:10 |
| 14 | `npub1m5qx6mzmzmhpses6yjew92y6ym3flkj0vzw60mxgnr89dd28sksqhe8kza` | `dd006d6c...85a0` | curator | 10:11 |
| 15 | `npub1q069z7m4uxczvx2kxyzmxal96ur0jgu3qxkx2vw84ht6hucktu0ssnuq7f` | `03f4517b...5f1f` | curator | 10:11 |
| 16 | `npub14g7rl5htg84mk9xjcw39jduvx7ul9sz8qp8g9ppqqkrcc69gcx4s58esa0` | `aa3c3fd2...1ab` | curator | 10:12 |
| 17 | `npub1xfng4yxd75rky29fsex5l6pq84584x2tjxzkfmuu27d47y0luemqh6vjre` | `32668a90...e676` | curator | 10:13 |
| 18 | `npub1wfgm0h23q5qyjm3fqz2l4s023wpr409cagmmqjmq64ng7v5t9crqaysvmf` | `7251b7dd...2e06` | curator | 10:13 |
| 19 | `npub1fx9mlf74ecudxst6s7z8qle5h744wr3zg5yg9ppje6u96je6h2msqkf8p6` | `498bbfa7...ab7` | curator | 10:14 |
| 20 | `npub1r5suhx77973wggg5dk963nerx4dn9uc3d4qg3r6pfxtlhevnem0q82qj38` | `1d21cb9b...cede` | curator | 10:14 |
| 21 | `npub1t6lxpfhj4340828pxa600uv8h2pnxt6aqdppragv8yu0rhzw0wmq4quqvn` | `5ebe60a6...bb6` | curator | 10:15 |
| 22 | `npub1mpzs7pyj8kla58djajg09fkn68738356g772atg9u9qfnr5heqsqyycxhr` | `d8450f04...c820` | curator | 10:16 |
| 23 | `npub1lmlvp8pv9ltp3kj5zelqhq44zn88vn6y7jczuygvn8t5cynseg9qdda3qr` | `fefec09c...ca0a` | curator | 10:16 |
| 24 | `npub1q2sz9496kfdr2t2tpqgy6ecvrjgxcuhwfzcr898w7a5gw4ryt2ksg07zym` | `02a022d4...5aad` | curator | 10:17 |
| 25 | `npub1hn4lw24mft8wh84snar7cc2cknlz8paslna93q5jr996tvlsqyhskxqh76` | `bcebf72a...012f` | curator | 10:18 |
| 26 | `npub1q3awazf8mvms0l0jcqvrtwm7qpy2ns8gycy5y3erqsa638mawmlsqq0txx` | `047aee89...6ff` | curator | 10:18 |
| 27 | `npub1zsp6cd5z0l98my3sew3vnr8wq329f5pxjra08mag06aj8xvpq43qautech` | `1403ac36...0562` | curator | 10:19 |
| 28 | `npub12zxlmsyqug5kvtu946hef02v4r2ur3ednsr6vtn86vcchp8ex3gq7dz0n7` | `508dfdc0...3450` | curator | 10:20 |
| 29 | `npub14hkujl828uh5y07qgfre2nwdza5srm89mzeva795xj59y28a4x2s8xtrvg` | `adedc97c...a995` | curator | 10:21 |
| 30 | `npub1t57vsmc6xunf60ffhv2fjlgek3fusjx30509rmy6tq6teqpr47rsx68yqy` | `5d3cc86f...af87` | curator | 10:22 |
| 31 | `npub1kxr0kw6l630t2e67e6c4u5n9mpgavln0wcyjy5nwc67j6vnc9swq7e4atx` | `b186fb3b...2c1c` | curator | 10:22 |
| 32 | `npub12dhk96me2lyyh7k0u89esvjtp0l7j5fha04m92vegup7wecgfjnsrnq0ya` | `536f62eb...4ca7` | curator | 10:23 |
| 33 | `npub1vqzr5rh4lt9mcp53g9udlvs0r58x655vzsn8dw4rvg4wdk8zr9ssu8qgt9` | `60043a0e...1961` | curator | 10:23 |
| 34 | `npub1tf8ru3raq38mny3tvw5jmhdr7xtyk7qk0k593n47pe9fn797wn7qne82n4` | `5a4e3e44...74fc` | curator | 10:24 |
| 35 | `npub1d4mh033kek6zu0s9mzj4sfguskq97jtackyvpryncn4pkkgueznshyfnxu` | `6d7777c6...c8a7` | curator | 10:25 |
| 36 | `npub1dn5dztlcszugmy8y27qxrycgnr6rvhguqv2ut6tfj0du8hp46fxq9a0fp5` | `6ce8d12f...d24c` | curator | 10:25 |
| 37 | `npub1sk5k0gzuhj4szla5js3umv9s77mvqr6yenxkz0qvknsc7fhkrkusxvvw6s` | `85a967a0...1db9` | curator | 10:26 |
| 38 | `npub19rpnnah8wvn5ad6umdmryuevquuwcduxgxu77ej2t4wgwy0nda0scanj0f` | `28c339f6...6f5f` | curator | 10:27 |
| 39 | `npub1la68q3ntwefflw276er28hwuy8ag24t58zrv6nfuhzu9hv5j9knq3d286d` | `ff747046...2da6` | curator | 10:27 |
| 40 | `npub10n84zrtwuee397akzqpsgrhrvjn4afvlpxugzpx43lvdgccm0u5sut9yjc` | `7ccf510d...7f29` | curator | 10:28 |
| 41 | `npub1hj6d5rae0yypymy3wrksdtf0k2x9nz2yfrhxprwr68l4ce44qrns8ftm7r` | `bcb4da0f...00e7` | curator | 10:28 |
| 42 | `npub1h2mzyvc0h22fsmfru2d8pqgskv567nq6c26c4p40heaths5sggys6w4p6j` | `bab62233...4209` | curator | 10:29 |
| 43 | `npub1rzmgpryn39m37xadn5893vzks5p20dd8td8002zvemv6f6jmvt7q7pn6fz` | `18b6808c...62fc` | curator | 10:29 |

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
