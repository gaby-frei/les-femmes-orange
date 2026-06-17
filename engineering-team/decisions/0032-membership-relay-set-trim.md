# ADR 0032: Trim the membership relay set to brainstorm + nos.lol

**Status:** Accepted
**Date:** 2026-06-17
**Story:** none — operational/configuration change raised directly (no story; doc + one-line config edit)

## Context

Membership is computed client-side in `public/index.html` by querying LFO tag
events (kind 9999/39999, `#e` = LFO concept event, `#z` = `nostr-user-tag`) from a
set of relays, deduplicating by event id, and running the verified-member closure
from `SEED_PUBKEY`. The rendered "Verified members" count is the output of that
closure, and it is the gate for access.

The relay set was four:

```
wss://tags.brainstorm.world/relay
wss://nos.lol
wss://relay.damus.io
wss://relay.primal.net
```

CLAUDE.md already noted brainstorm + nos.lol were "complete and up to date" as of
2026-06-01, which raised the question of whether damus and primal were earning
their place. We measured it with a throwaway probe,
`scripts/relay-coverage-brainstorm-only.mjs`, which queries each relay for the LFO
tag filter and compares raw items, unique tagged profiles, and the verified-member
closure for brainstorm-only vs. the full set.

Measured 2026-06-17 (two runs minutes apart; the dataset grew by one attestation
between them, confirming it is live):

| Relay | Tag items returned |
|---|---|
| `wss://tags.brainstorm.world/relay` | 58 (complete) |
| `wss://nos.lol` | 58 (complete) |
| `wss://relay.damus.io` | 49 (partial subset) |
| `wss://relay.primal.net` | 1 (effectively empty) |
| `wss://dcosl.brainstorm.world` | 0 (not synced) |

Union after dedup: 58 items / 53 tagged profiles / **50 verified members** — identical
to brainstorm alone, and identical to nos.lol alone. damus and primal contributed
**zero net coverage** after dedup; every event they returned was already present on
both complete relays. dcosl was confirmed reachable but holds 0 LFO tag events,
consistent with CLAUDE.md.

Constraints: this project is intentionally JS-without-build; the relay list is a
plain `const RELAYS` array consumed by a raw-WebSocket `queryRelay`/`queryRelays`
pair (no `SimplePool`). No concept-graph contracts are touched.

## Options considered

### Option A — Keep all four relays
No change. Pro: maximum redundancy. Con: two of the four (damus, primal) demonstrably
add nothing; every membership computation pays two extra WebSocket round-trips and
their timeouts for no coverage. Misleading to future readers about where the data
actually lives.

### Option B — Drop to brainstorm only (single relay)
Minimal. Pro: simplest, fastest. Con: removes all fallback. If brainstorm is down or
falls behind a sync, membership computation silently degrades — and membership is the
access gate, so degradation is high-impact. Not worth the marginal saving.

### Option C — Keep brainstorm + nos.lol, drop damus + primal
Pro: each of the two retained relays is *independently* complete, so we keep a true
hot spare at zero coverage cost — if either is down or stale, the other still returns
the full set. Drops the two relays that contribute nothing. Con: none material; the
dropped relays can be re-added in one line if their coverage ever improves.

## Decision

We chose **Option C** because the measurement shows brainstorm and nos.lol are each
independently complete while damus and primal add zero net coverage. This preserves
full redundancy (either relay alone reproduces the rendered 50-member set) while
removing dead weight. dcosl was never in the query set and stays out (0 events).

## Consequences

- **Enables:** faster, cleaner membership computation — two relays instead of four,
  no waiting on primal/damus timeouts; honest documentation of where events live.
- **Preserves:** redundancy. Either retained relay alone yields the full set, so one
  being down or stale is not user-visible.
- **Constrains:** if *both* brainstorm and nos.lol degrade simultaneously, there is no
  longer a third relay cushioning it. Mitigated by both being independently complete
  and by the one-line revert path.
- **Follow-up:** `scripts/relay-coverage-brainstorm-only.mjs` is the re-verification
  tool; re-run it if membership counts ever look wrong, or before re-adding a relay.
- **Firmware reinstall required?** No — no concept definitions changed.

## Implementation notes

- File: `public/index.html` — `RELAYS` reduced to `['wss://tags.brainstorm.world/relay',
  'wss://nos.lol']`, with a comment pointing here. The community feed (`FEED_RELAY`,
  nos.lol only, ADR 0029) is unaffected — it was always separate from `RELAYS`.
- File: `scripts/feed-hashtag-prevalence.mjs` — its `RELAYS` array mirrors the app's;
  trimmed to match so the diagnostic keeps reflecting production.
- File: `CLAUDE.md` — "Events live on" row, the membership-relay priority list, and
  the freshness note updated to the two-relay reality and this ADR.
- File: `scripts/relay-coverage-brainstorm-only.mjs` — left intact (still queries the
  full historical set incl. dcosl) so it remains a coverage-comparison tool, not a
  production mirror.

## Out of scope

- The community-feed relay choice (`FEED_RELAY` = nos.lol) — owned by ADR 0029.
- Any change to the membership algorithm or the verified-member closure itself.
- Re-adding relays for write/publish fan-out (publishing still targets the full
  `RELAYS` set, which is now these two — acceptable; broader publish targets are a
  separate question if ever raised).
