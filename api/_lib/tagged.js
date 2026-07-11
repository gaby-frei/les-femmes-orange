'use strict';

// Provider 2 — the event-tag source (Story 8, ADR 0036). Reads "which notes carry
// the lfo-community tag, applied by a verified member" from the tagging relay:
//
//   0. TA pubkey (injected, runtime-resolved; null → degrade, never a hardcoded fallback)
//   1. discover the tag's tagging header(s) — never pinned — and, in the same round
//      trip, the tag-element (pill display metadata; NOT pipeline-critical)
//   2. fetch assertions in ONE REQ: #z over every discovered header's real coordinate
//   3. resolve with the vendored groupTaggingsByTarget; the ONLY trust gate is
//      "asserter ∈ our member set" — keep targets with ≥1 application
//   4. fetch the kind-1 note bodies from the tagging relay ∪ noteRelays (nos.lol +
//      damus; ADR Decision 3 as revised 2026-07-11 — the tagging relay holds the
//      tagging events, NOT the note bodies, verified live 0/10)
//
// Returns { candidates, relayOk } and NEVER throws: any failure degrades to
// { candidates: [], relayOk: false }. relayOk reflects the pipeline-critical
// queries (headers → assertions → notes); tag-element failure only degrades
// the display metadata to a slug fallback.

const { filterTaggingHeadersForTag } = require('./event-tagging/filters.js');
const { groupTaggingsByTarget } = require('./event-tagging/classify.js');

function tagVal(ev, name) {
  const t = (ev.tags || []).find((x) => x[0] === name);
  return t ? t[1] : null;
}

// Display metadata from the tag-element (UI amendment, ADR A1): latest version
// wins; unparseable/missing → slug as name, empty description (inert pill).
function tagMetaFrom(elements, slug) {
  let best = null;
  for (const ev of elements || []) if (!best || ev.created_at > best.created_at) best = ev;
  if (best) {
    try {
      const t = JSON.parse(best.content).tag;
      if (t && typeof t.name === 'string' && t.name) {
        return [{ name: t.name, description: typeof t.description === 'string' ? t.description : '' }];
      }
    } catch {}
  }
  return [{ name: slug, description: '' }];
}

async function fetchTaggedCandidates(deps) {
  try {
    const { getTaPubkey, queryRelayStatus, memberSet, tag, taggingRelay, noteRelays = [] } = deps;

    const taPubkey = await getTaPubkey();
    if (!taPubkey) return { candidates: [], relayOk: false };

    // Step 1 — headers (critical) + tag-element (metadata), one parallel round trip.
    const [headersRes, elementRes] = await Promise.all([
      queryRelayStatus(taggingRelay, filterTaggingHeadersForTag({
        tagAuthorPubkey: tag.authorPubkey, slug: tag.slug, taPubkey,
      })),
      queryRelayStatus(taggingRelay, {
        kinds: [39999], authors: [tag.authorPubkey], '#d': [tag.slug],
      }),
    ]);
    if (!headersRes.ok) return { candidates: [], relayOk: false };
    const headers = headersRes.events;
    const taggedWith = tagMetaFrom(elementRes.ok ? elementRes.events : [], tag.slug);
    if (!headers.length) return { candidates: [], relayOk: true };

    // Step 2 — assertions, one REQ unioning every DISCOVERED header's real
    // coordinate (no pinning; robust even if a header's d strays from convention).
    const headerCoords = [...new Set(
      headers.map((h) => `39999:${h.pubkey}:${tagVal(h, 'd')}`).filter((c) => !c.endsWith(':null'))
    )];
    const assertionsRes = await queryRelayStatus(taggingRelay, { kinds: [39999], '#z': headerCoords });
    if (!assertionsRes.ok) return { candidates: [], relayOk: false };

    // Step 3 — resolve. Membership of the ASSERTER is the one trust gate; the
    // honored-authority gate is near-redundant here (step 1 already filtered)
    // but stays, per the story, as the guard for any future header source.
    const { targets } = groupTaggingsByTarget({
      candidates: assertionsRes.events,
      headers,
      honoredAuthorities: [taPubkey],
      isAsserterTrusted: (pk) => memberSet.has(pk),
      tag: { authorPubkey: tag.authorPubkey, slug: tag.slug },
    });
    const kept = targets.filter((t) => t.applications.length >= 1 && t.target && t.target.id);
    if (!kept.length) return { candidates: [], relayOk: true };

    // Step 4 — note bodies from the tagging relay ∪ noteRelays, in parallel,
    // deduped by id (kind-1 is non-replaceable so a multi-relay read is safe).
    // Satisfied if ANY relay responds; an id whose body resolves nowhere is
    // dropped silently.
    const ids = [...new Set(kept.map((t) => t.target.id))];
    const noteResults = await Promise.all(
      [...new Set([taggingRelay, ...noteRelays])].map((url) => queryRelayStatus(url, { kinds: [1], ids }))
    );
    if (!noteResults.some((r) => r.ok)) return { candidates: [], relayOk: false };
    const noteById = new Map();
    for (const r of noteResults) if (r.ok) for (const ev of r.events) if (!noteById.has(ev.id)) noteById.set(ev.id, ev);

    const candidates = [];
    for (const t of kept) {
      const event = noteById.get(t.target.id);
      if (!event) continue;
      candidates.push({
        event,
        channels: [tag.channel],
        vias: [{ provider: 'event-tag', tag: tag.slug, applications: t.applications.length }],
        taggedWith,
      });
    }
    return { candidates, relayOk: true };
  } catch {
    return { candidates: [], relayOk: false };
  }
}

module.exports = { fetchTaggedCandidates };
