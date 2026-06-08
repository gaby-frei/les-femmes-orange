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

---
---

# Team Harness & Community Foundation

> _Added during repo bootstrap. Les Femmes Orange is a Tapestry-based community app, so it runs the full product + engineering team harness and is built on the Tapestry community foundation. The sections below are the wiring for that harness — they sit alongside the project context above, not in place of it._

**Read these first** (copied into this repo during setup):

- [AGENTS.md](./AGENTS.md) — concept-graph orientation pattern. Read this BEFORE touching code.
- [BIBLE.md](./BIBLE.md) — protocol spec, architecture, and data model. Its **§22 Community-Reference Model, §23 Class-Thread Membership Tags, §24 Task Queue, §25 Inherit-From Tag**, and the `concept-graph` header pointer are the community substrate to design on.
- [docs/COMMUNITIES_PROTOCOL_DESIGN_HANDOFF.md](./docs/COMMUNITIES_PROTOCOL_DESIGN_HANDOFF.md) — the **current direction** for how Tapestry communities work (community as a concept, membership via a `nostr-user-tag` weighted by GrapeRank, definitional deference via the `b` inherit-from tag). **LFO should align to this**, not to any older community model. This is the primary community-design reference.

**Also check at session start:**

- [`engineering-team/stories/_intake.md`](./engineering-team/stories/_intake.md) — queued-but-unplanned work catalog (if present). See [engineering-team/README.md](./engineering-team/README.md) for the format. Scan before opening a fresh feature request.
- `engineering-team/*/done/community-reference/` — Tapestry's community build records, inherited read-only as protocol reference. Gaby's own epics/stories/decisions live outside `done/`.

## Product Team Mode (upstream — optional)

*Before* a feature is engineered, a product can be **discovered and designed** through a parallel harness in `product-team/`. It runs upstream of Engineering Team Mode and is optional: use it when starting a new product or a substantial feature area where the requirements aren't yet clear. A non-technical user describes what they want in natural language; the product team iterates through structured phases; the output is markdown artifacts the engineering team consumes.

The boundary is clean: **the product team produces markdown (PRD, guides, story queue). The engineering team writes code.** No source, no file paths, no library choices cross into the product artifacts.

- **`product-team/`** — roles, workflows, templates, guardrails, and accumulating discoveries/personas/journeys/scope/domain/prd/guides. Source of truth for product behavior. Read [product-team/README.md](./product-team/README.md) for the layout.
- **`.claude/`** — wiring only:
  - `.claude/commands/<phase>.md` — slash commands: `/discover`, `/model-users`, `/scope`, `/model-domain`, `/design-experience`, `/assemble-prd`, `/decompose-stories`, `/discuss-product`.
  - `.claude/agents/<role>.md` — product subagents; each can Write only into `product-team/`, and the Product Advisor cannot Write at all.

The seven phases — **Discovery → User Modeling → Scope → Domain Modeling → Experience Design → PRD Assembly → Story Decomposition** — each have a human approval gate and write a durable artifact. The flow ends by emitting `product-team/stories-queue.md`, an epic-aware backlog. **The handoff is doc-driven and one-directional:** the engineering Product Owner reads that queue, creates the matching epics under `engineering-team/`, and promotes each brief via `/plan-feature`. The product flow never writes into `engineering-team/`. See [product-team/README.md](./product-team/README.md) → "Handoff to the engineering team".

## Intent Detection (natural language is the primary interface)

Most people who use the product flow will never type a slash command. **Natural language is the default way in; slash commands are shortcuts for people who already know the flow.** Claude reads what the user says, infers which phase they mean, confirms it in plain language, and proceeds. The non-technical user never needs to know slash commands exist.

### Register — who am I talking to?

- **User spoke naturally** (no slash command) → treat them as non-technical. Enter the phase with the **plain-language entry message** from that phase's workflow file (its `## Natural language` section). Do **not** say "I'm acting as the UX Researcher. Phase 2: User Modeling" — role labels and phase numbers are internal machinery. Say what you're about to do in plain words, then ask "Ready?" before starting. Never use jargon like "persona," "acceptance criteria," or "entity" with this user — translate their words into structure silently.
- **User typed a slash command** → treat them as technical. Use the formal role announcement ("I'm acting as the Product Strategist. Phase: Discovery.") exactly as the command file specifies.

Between phases the gate is **conversational, never a command**: "I've captured the problem space. Next I'd map out who your users are and what their experience looks like. Want to continue?" The user says yes; the next phase begins. No `/model-users` required.

### Routing table

**Product flow — figuring out *what* to build** (enter the phase, confirm in plain language):

| The user says something like… | Phase to enter |
|---|---|
| "I have an idea," "I want to build," "what should we build," "help me figure out what to make" | Discovery (`/discover`) |
| "who are the users," "who is this for" | User Modeling (`/model-users`) |
| "what's in the first version," "what should we cut," "what's the scope" | Scope (`/scope`) |
| "what information do we need," "what are the things involved" | Domain Modeling (`/model-domain`) |
| "what should it look like," "design the screens" | Experience Design (`/design-experience`) |
| "put it all together," "write it up," "write the PRD" | PRD Assembly (`/assemble-prd`) |
| "break it into tasks," "what does engineering need" | Story Decomposition (`/decompose-stories`) |
| "let's start building," "hand off to engineering," "ready to build" | Story Decomposition → engineering handoff |

**Engineering flow — figuring out *how* to build it** (technical audience; formal announcements are fine here):

| The user says something like… | Where to go |
|---|---|
| "let's implement," "write the code," "build this story" | `/plan-feature` (new story) or `/implement-feature` (story with tests) |
| "review the code," "is this ready to ship" | `/review-changes` |
| "I think that's everything," "that's all I needed," "looks done," "we're done" | **Offer to close the book** → `/close-book` (don't auto-run; the user's "yes" is the trigger) |

**Advisory — thinking out loud** (no artifacts):

| The user says something like… | Where to go |
|---|---|
| "what do you think about," "help me think through" (product / users) | `/discuss-product` |
| "what do you think about," "help me think through" (stack / feasibility) | `/discuss` |

**When in doubt, ask one question:** "Are you exploring a product idea (figuring out *what* to build) or ready to start engineering (*how* to build it)?" Then route.

### The non-technical journey, end to end

A product person opens Claude Code and says *"I have an idea for a community feature and I want to figure out what to build."* Claude confirms it's the start of product discovery, explains in plain words that it'll ask about the problem, the people, and what exists today, and asks "Ready?" From there each phase flows into the next through conversational gates. The user talks in whatever words they have — *"the women in the community need a way to vouch for each other"* — and the harness translates that into structured artifacts behind the scenes. When the product work is done, Claude presents the PRD and guides and offers to break the work into engineering tasks. If the user says "let's start building," Claude decomposes the stories and either hands to the engineering flow or notes that the engineering side is best run by (or with) a technical teammate. The user never types a slash command, never hears "persona" or "acceptance criteria," and never sees a phase number.

## Engineering Team Mode

This project runs every change through a **Product Owner → Architect → Tester → Implementer → Reviewer** harness with explicit human approval gates between phases. Pattern adapted from Rob Conery's *Eliminate Crappy Slop Code* (https://bigmachine.io/articles/video/eliminate-crappy-slop-code/).

The harness lives in two places:

- **`engineering-team/`** — roles, workflows, templates, and accumulating decisions/stories/reviews. Source of truth for behavior. Read [engineering-team/README.md](./engineering-team/README.md) for the layout and phase wiring.
- **`.claude/`** — wiring only:
  - `.claude/commands/<phase>.md` — slash commands: `/plan-feature`, `/design-architecture`, `/design-tests`, `/implement-feature`, `/review-changes`, `/close-book`, `/discuss`.
  - `.claude/agents/<role>.md` — subagents with role-appropriate tool whitelists. The Architect cannot Edit source. The Reviewer cannot Edit source.

Phases 1–5 are the **per-story** cycle. Above them sits one **per-book** milestone, `/close-book` — see "Books of work and the return edge" below.

### How to operate

1. **Classify the request.** Ask: "Is this a new feature, a bug fix, a refactor, or a doc/typo change?" That answer determines which phases apply (Standard strictness):

   | Type | Phases that apply |
   |---|---|
   | Feature | All five phases |
   | Bug | Skip Architecture if obvious; otherwise all |
   | Refactor | Skip Tests if no behavior change |
   | Doc / typo / one-liner | Implementer + Reviewer only |

2. **Know which role you're in.** When a phase command is invoked, state at the top of your first response: "I'm acting as the {Role}. Phase: {Phase}."
3. **Stay in role.** The Architect doesn't write the implementation. The Implementer doesn't invent new requirements. If the inputs are unclear, kick back to the prior phase rather than drifting.
4. **Honor the gates.** End each phase by summarizing the output and asking the user to approve before moving on. Do not auto-advance.
5. **Use the templates.** Stories, ADRs, test plans, and reviews start from `engineering-team/templates/`.

### Project settings

| Setting | Value |
|---|---|
| Strictness | Standard |
| ADRs | enabled |
| Clean working tree before starting a feature | yes |
| Commit at each phase boundary | yes |

### Books of work and the return edge

The per-story cycle sits inside a larger unit — a **book of work**: a PRD, one roadmap phase of a PRD, or (with no PRD) a bounded ask. Books bracket the loop back to the product team:

- **Open (eager anchor).** At intake, a new book opens `engineering-team/audits/<book-slug>/book.md` recording its intent anchor — the PRD it realizes, or a short **acceptance frame** (the ask restated and confirmed) when there's no PRD. This is the durable definition of "done"; without it, completion can't be detected across sessions and the close drops to low confidence.
- **Detect completion (offer, don't auto-run).** After every per-story PASS — or when the user signals "I think that's everything" — check whether the book now looks complete (computed for PRD-backed books; judged against the acceptance frame otherwise). If it does, *offer* to close it. The system never declares done; it proposes done and the user ratifies. Their "yes" is the trigger for `/close-book`.
- **Close (`/close-book`).** The Reviewer, at book scope, writes two artifacts under `audits/<book-slug>/`: `audit.md` (the as-built record) and either `prd-addendum.md` (PRD-backed — deltas vs the PRD) or `prd-seed.md` (no PRD — a reconstructed baseline). These are the **return edge**: the product team reads them to scope the next phase. Engineering authors them under `engineering-team/` and never writes into `product-team/` — the mirror image of engineering reading the product team's `stories-queue.md`. See [engineering-team/README.md](./engineering-team/README.md) → "The return edge".

## House rules

- The Concept Graph API on the local control panel is the authoritative source for domain concepts. Always check there before reading source. See AGENTS.md §1–§3 for the port, TA pubkey, and three-call orientation pattern.
- Reinstall firmware after adding/changing concept definitions — see AGENTS.md §6 for the exact curl.
- Don't add new lint or typecheck tooling without an explicit ADR. This project is intentionally JS-without-build.
- **The stack runs in Docker.** The control panel, Neo4j, strfry, and Redis run *inside* containers — their logs and CLIs live in the container, not on the host (`docker exec <container> …`). Host paths like `/var/log/brainstorm/...` do **not** exist on the host.
  > **TODO (technical teammate): confirm LFO's instance URL, container names, and ports.** The values above are inherited from the Tapestry reference deployment; LFO's own deployment details are not yet set. The Tapestry reference implementation lives in `tapestry/` in this repo for lookup.
