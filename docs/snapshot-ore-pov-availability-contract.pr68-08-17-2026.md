# ORE unavailable-POV contract — 202/422 response shapes (pending production)

## ⚠️ PRE-PRODUCTION SNAPSHOT — extracted 2026-08-17 from source, not yet live on `api.brainstorm.world`

**Provenance.** Extracted 2026-08-17 from the **NosFabrica/brainstorm_server** repo,
branch `feat/ore-pov-availability` (PR **#66**, merged to staging 2026-08-16; promotion
to main pending PR **#68**, open as of 2026-08-17). Files read:

- `app/routers/open_ranking/availability.py` (new — the gate + reason strings)
- `app/routers/open_ranking/errors.py` (new — the 202/422 handlers + body shapes)
- `app/routers/open_ranking/common.py` (`ore_error_response` — the 422 body builder)

Raw URLs: `https://raw.githubusercontent.com/NosFabrica/brainstorm_server/feat/ore-pov-availability/app/routers/open_ranking/{availability,errors,common}.py`

**Wire-verified on staging** (`brainstormserver-staging.nosfabrica.com`, probes
2026-08-17): the 422 shape below observed live on `/rank/pubkeys` and
`/search/pubkeys` with an unprovisioned POV. The 202 branch was NOT observed live
(needs a POV with a run in the pipeline); its shape below is from source.
Production `api.brainstorm.world` same day: still the old contract (HTTP 200,
zero-filled ranks). Upstream spec: ORE-01 §"Point of View" as amended by
Open-Ranking/protocol PR #9.

## The contract

A personalized-algorithm request (`*-pov`) for a POV the provider cannot serve is
**never silently substituted** with the global/default perspective. Instead:

| POV state | Status | Body | Headers |
|---|---|---|---|
| Provisioned, scores ready | `200` | normal results (unchanged) | — |
| Provisioned, run still in pipeline | `202` | `{"status": "computing", "retry_after": 60}` | `X-Reason`, `Retry-After: 60` |
| Not provisioned / not servable | `422` | `{"error": "<reason>"}` | `X-Reason: <reason>` |

Notes:

- `X-Reason` appears on **all** ORE errors now (ORE-00 §Errors), not just POV ones;
  the JSON body keeps the exact reason string (header copy is latin-1-coerced).
- `retry_after` is advisory (`RETRY_AFTER_SECONDS = 60`); repeat the **identical**
  request after that many seconds.
- Global algorithms (`graperank`, `relevance`) and the house observer as POV are
  exempt — never gated.
- Requests **never provision** a POV (explicit anti-enumeration/DoS stance).
- Malformed JSON body on ORE paths → `400` `{"error": "request body is malformed or
  not valid JSON"}`; field-validation failures → `422` in the same `{"error": ...}`
  shape (so a 422 is NOT always a POV problem — discriminate on the reason text).

## The three 422 reason variants (verbatim templates from `availability.py`)

1. **No row for the POV at all** (the case LFO's readiness probe cares about):
   > `algorithm '<algo>' cannot be served for pov <observer>: no scores exist for
   > this point of view and none are scheduled (ranking requests never provision
   > new povs). Either fall back to the endpoint's default algorithm '<default>'
   > for a global view, or provision this pov at <frontend_url>`

2. **Provisioned, calc never completed, nothing in pipeline**:
   > `algorithm '<algo>' cannot be served for pov <observer>: scores have not been
   > computed for this point of view and no computation is in progress. Either
   > <fallback>, or trigger a run at <frontend_url>`

3. **`/search/pubkeys` only — calc done but search mirror never landed**:
   > `algorithm '<algo>' cannot be served for pov <observer>: scores exist but are
   > not yet available in the search index, and no publication is in progress.
   > Either <fallback>, or trigger a new run at <frontend_url>`

## Per-endpoint readiness sources (why 422/202 can differ across endpoints)

Availability is checked per data source, so the same POV can be ready on one
endpoint and not another:

- `/stats/pubkey`, `/rank/pubkeys`, `/followers`, `/muters` — ready once the POV's
  GrapeRank calc has completed at least once (Neo4j-backed).
- `/search/pubkeys` — ready once the score mirror has landed in Vespa.

## LFO impact (when PR #68 reaches production)

- `probeMyViewReadiness` (`public/index.html`) already treats non-2xx as not-ready →
  **safe on day one**, no urgent change.
- Follow-up story (`engineering-team/stories/_intake.md`, 2026-08-14 entry + 2026-08-17
  update): replace the interim "any rank > 0" heuristic with status-code
  discrimination — `200` ready / `202` "your view is being prepared" (poll with
  `Retry-After`) / `422` not provisioned (optionally surface the provisioning URL
  from the reason). A 422 from field validation is distinguishable from POV-422 only
  by reason text — match on the reason or send known-valid bodies.
