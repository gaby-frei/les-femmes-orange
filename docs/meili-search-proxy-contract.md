# API contract — Brainstorm profile-search proxy (as observed)

 ## ⚠️ PRE-STORY-#6 DOCUMENT — describes the backend we are migrating OFF

**This document was written on 2026-08-02, BEFORE story #6
(`engineering-team/stories/npub-search/6-search-ore-migration.md`, Approved 2026-08-05),
which migrates free-text search off this meili proxy and onto ORE
`POST /search/pubkeys` (`relevance-pov`) — served from `api.brainstorm.world` per the
2026-08-14 settled host policy (CLAUDE.md § Brainstorm Hosts).**

```
GET https://tags.brainstorm.world/api/search/profiles/meili
```

**Provenance.** Compiled 2026-08-02 from (a) the reference source
`tapestry/src/api/search/profiles/meili/index.js:91-235` and (b) live probes of the deployed
endpoint (ADR 0042, Probe log P1–P3 + edge probes). **The deployment is newer than the
`tapestry/` checkout** — fields marked *(live)* were observed on the wire but are absent from
the checkout; fields marked *(source)* are read from code and probe-consistent. This is a
third-party service: none of this is versioned or guaranteed; treat as a snapshot.

The proxy fronts a Meilisearch index of ~750K kind-0 profiles with per-POV trust columns
pre-loaded (`wot_<metric>_<8-char suffix>`). It is the **single authority** for POV
resolution, filter/sort config, and field namespacing — the client never sends sort, filter,
or field names.

**CORS:** request `Origin` is reflected (`Access-Control-Allow-Origin: <origin>`,
`Vary: Origin`, credentials allowed) — direct browser calls work.

## Request (query string)

| Param | Type | Required | Semantics |
|---|---|---|---|
| `q` | string | yes* | Free-text query. *Missing/blank → `200 {success:true, hits:[], estimatedTotalHits:0, processingTimeMs:0}` (no error). |
| `limit` | int | no | Default 100, capped at 200 *(source)*. |
| `offset` | int | no | Default 0. Pagination offset into the match set. |
| `wotPov` | `house` \| `user` | no | Default `house`. Selects the POV-resolution path (below). |
| `userPubkey` | 64-hex | no | The POV **owner** whose stored prefs resolve the score namespace. Used only with `wotPov=user`. |
| `pubkeyLookup` | 64-hex | no | **Mode switch:** direct document fetch by pubkey. Bypasses search, WoT, sort, and filters entirely; returns 0–1 hits with `povSuffix: null`. Takes precedence over normal search (`q` still required but unused for matching). |
| `nip05Lookup` | NIP-05 id | no | Runs domain verification in parallel with normal search; verified profile returned in `nip05Result` and deduplicated out of `hits`. |

## POV resolution (`wotPov=user&userPubkey=<hex>`)

1. Read the deployment's stored prefs for that pubkey
   (`/var/lib/brainstorm/user-prefs/<pubkey>.json`) → `rankAuthor` (the delegated score
   author from the account's kind-10040), `filters`, `sortConfig`.
2. Any value missing → fall back to the instance's house prefs
   (`settings.json → grapevine.searchPreferences`), then to none.
3. `povSuffix` = first 8 hex chars of the resolved `rankAuthor`. This names the score
   columns on every hit: `wot_rank_<povSuffix>`, `wot_followers_<povSuffix>`.

**Hazard:** if no `rankAuthor` resolves, the fallback to the house (nosfabrica) POV is
**silent** at the ranking level — the response still succeeds with plausible scores.
Detection: `povResolution.fellBackToHouse` *(live)* and/or comparing `povSuffix` against the
expected delegate (ADR 0042 sub-decision 3).

**Sort/filter:** applied server-side from the resolved prefs (user prefs → house prefs →
none = Meilisearch text relevance). The client cannot influence them.

### Observed prefs of the placeholder house account (PO `6db8a13f…`, 2026-08-02)

Reconstructed from `povResolution` + served order, confirmed against the account's
tags.brainstorm.world settings panel. Updated same day after the PO applied the
recommended settings (ADR 0042 P14); wire-verified.

| Pref | Value (current) | Effect on our results |
|---|---|---|
| `rankAuthor` | `39945424…` (the account's delegated rank author) | Selects the score namespace we display and re-sort by. Load-bearing; losing it → silent nosfabrica fallback. |
| `sortConfig` | `rank` desc *(was `followers` desc before 2026-08-02)* | Server sort now agrees with the metric we display and rank by — the `limit=24` cut is the true rank top-24. The client re-sort stays as defense (prefs are externally mutable; equal-rank ties have unspecified secondary order). |
| `filters` | none active (rank ≥ 2 shown but disabled) → `mode: "unfiltered"`, `minRank: null` | Nothing hidden server-side today. Enabling a filter in the panel would silently narrow our results. |
| `selectedMetrics` | `rank` only — `followers` unchecked | Protects `wot_rank_39945424` freshness on future score re-loads. Mirror-image staleness risk now sits on `wot_followers_*`, which our client does not display — no UI impact. |

Contrast — the `wotPov=house` path resolves a different delegate (`78ed0837`, from
house prefs) and runs `mode: "filtered"` with `minRank: 2`: house searches hide profiles
below rank 2. Our user-POV path applies no such filter.

## Response — success envelope

`200`, `Content-Type: application/json`.

| Field | Type | Provenance | Notes |
|---|---|---|---|
| `success` | `true` | both | |
| `query` | string | both | Echo of trimmed `q`. |
| `hits` | Hit[] | both | See Hit object. Ordered per resolved sort. |
| `estimatedTotalHits` | int | both | Total matches (e.g. 43 for `"liz"` from the house POV). |
| `processingTimeMs` | int | both | Meilisearch timing (single-digit ms typical). |
| `povSuffix` | string \| null | both | Namespace of the resolved POV's score columns. `null` in `pubkeyLookup` mode. |
| `povResolution` | object | **live** | `{ mode, fellBackToHouse, requested, delegateSource, povSuffix, minRank, scoresExist }`. Observed: `mode: "unfiltered"`, `delegateSource: "user-prefs"`. The auditable POV echo. |
| `nip05Result` | Hit \| null | both | Verified NIP-05 profile (flagged `_nip05Verified`), deduped out of `hits`. |
| `_wotCount` | int | both | How many hits carry `wot_rank_<povSuffix>`. |
| `_filtered` | bool | both | Whether score cutoffs were applied. Observed `false`. |
| `_searchTooBroad`, `_notice` | bool, string | source | Graceful degradation on backend panic for too-broad queries; `_notice` is display prose. |
| `tagHits`, `tagHitsHasMore` | array, bool | **live** | Tag-concept matches (separate feature). Ignored by our client (ADR 0042). |

## Hit object

Flat Meilisearch document: kind-0 profile fields + provenance + one score-column pair **per
POV ever loaded** into the index.

| Group | Fields |
|---|---|
| Profile (kind-0) | `name`, `display_name`, `displayName`, `username`, `nip05`, `about`, `picture`, `banner`, `website`, `lud16`, `lud06` |
| Identity | `id`, `pubkey` (same value), `npub` |
| Event provenance | `event_id`, `event_sig`, `created_at` (profile event), `indexed_at` |
| Trust columns | `wot_rank_<suffix>`, `wot_followers_<suffix>` — repeated for each loaded POV namespace (five namespaces observed per document). Read **only** the pair named by the response's `povSuffix`; a hit may lack the pair (check `!= null`). |
| Score metadata | `wot_pov` (a POV owner pubkey), `wot_updated_at` (unix — score load time; staleness signal) |

`wot_rank_*` observed as 0–100 integers ("Verification Score"); `wot_followers_*` as
non-negative integers.

## Error modes

| Condition | Status | Body |
|---|---|---|
| Missing/blank `q` | 200 | `{success:true, hits:[], …}` (not an error) |
| Search backend returns non-OK | 502 | `{success:false, error:"Search service unavailable", detail:"nostr-search-api returned <status>"}` |
| Search backend unreachable | 503 | `{success:false, error:"Search service unavailable", detail:<message>}` |

Clients must treat non-2xx **and** `success:false` as the unavailable state.

## Client usage under ADR 0042

Our client sends only: `q`, `limit=24`, `offset=0`, `wotPov=user`,
`userPubkey=<HOUSE_POV.pubkey>`. It consumes `hits` (re-sorted by
`wot_rank_<povSuffix>` desc, cut to 6), `povSuffix`, and `povResolution.fellBackToHouse`
(warn-only guard); it ignores `nip05Result`, `tagHits`, `estimatedTotalHits`, and
`_searchTooBroad`'s `_notice` prose.
