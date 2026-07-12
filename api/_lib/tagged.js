'use strict';

// Provider 2 — the event-tag source (Story 8, ADR 0036; multi-tag fan-out Story 9,
// ADR 0037). Reads "which notes carry a configured tag, applied by a verified member"
// from the tagging relay, for the WHOLE tag config in one batched pipeline pass:
//
//   0. TA pubkey (injected, runtime-resolved; null → degrade, never a hardcoded fallback)
//   1. one round trip, two parallel REQs: every tag's tagging header(s) — never pinned —
//      and every tag-element (pill display metadata; NOT pipeline-critical)
//   2. ONE assertions REQ: #z over every discovered header's real coordinate
//   3. resolve PER TAG in memory with the vendored groupTaggingsByTarget (its
//      tag-identity gate partitions a shared candidate pool safely); the ONLY trust
//      gate is "asserter ∈ our member set" — keep targets with ≥1 application
//   4. one bodies fetch for the union of kept ids across tags, from the tagging
//      relay ∪ noteRelays (nos.lol + damus; ADR 0036 Decision 3 as revised — the
//      tagging relay holds the tagging events, NOT the note bodies)
//   5. emit one candidate per (tag, kept note): the merge layer unions same-note
//      entries (channels ∪, vias concat, taggedWith ∪ by name) — that contract is
//      what makes multi-tagged notes come out right with no union code here
//
// Returns { candidates, relayOk } and NEVER throws: any failure degrades to
// { candidates: [], relayOk: false }. relayOk reflects the pipeline-critical
// queries (headers → assertions → bodies); tag-element failures only degrade
// display metadata to the per-tag slug fallback.

const { conceptTaggingWithSpecificTag, tagElementAddr } = require('./event-tagging/handles.js');
const { groupTaggingsByTarget } = require('./event-tagging/classify.js');

function tagVal(ev, name) {
  const t = (ev.tags || []).find((x) => x[0] === name);
  return t ? t[1] : null;
}

// Display metadata from a tag's element (UI amendment, ADR 0036 A1): latest version
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
    const { getTaPubkey, queryRelayStatus, memberSet, tags, taggingRelay, noteRelays = [] } = deps;
    if (!Array.isArray(tags) || !tags.length) return { candidates: [], relayOk: false };

    const taPubkey = await getTaPubkey();
    if (!taPubkey) return { candidates: [], relayOk: false };

    // Step 1 — all tags' headers (critical) + all tag-elements (metadata), one
    // parallel round trip. Headers REQ: multi-#a over every tag coordinate.
    const [headersRes, elementRes] = await Promise.all([
      queryRelayStatus(taggingRelay, {
        kinds: [39999],
        '#a': tags.map((t) => tagElementAddr(t.authorPubkey, t.slug)),
        '#z': [conceptTaggingWithSpecificTag(taPubkey)],
      }),
      queryRelayStatus(taggingRelay, {
        kinds: [39999],
        authors: [...new Set(tags.map((t) => t.authorPubkey))],
        '#d': tags.map((t) => t.slug),
      }),
    ]);
    if (!headersRes.ok) return { candidates: [], relayOk: false };

    // Partition headers per tag by their `a` pointer; elements per (author, slug).
    const headersByCoord = new Map(tags.map((t) => [tagElementAddr(t.authorPubkey, t.slug), []]));
    for (const h of headersRes.events) {
      const a = tagVal(h, 'a');
      if (a != null && headersByCoord.has(a)) headersByCoord.get(a).push(h);
    }
    const elements = elementRes.ok ? elementRes.events : [];
    const metaFor = (tag) => tagMetaFrom(
      elements.filter((ev) => ev.pubkey === tag.authorPubkey && tagVal(ev, 'd') === tag.slug),
      tag.slug
    );

    const allHeaders = [...headersByCoord.values()].flat();
    if (!allHeaders.length) return { candidates: [], relayOk: true };

    // Step 2 — ONE assertions REQ unioning every discovered header's real coordinate
    // (no pinning; robust even if a header's d strays from convention).
    const headerCoords = [...new Set(
      allHeaders.filter((h) => tagVal(h, 'd') != null).map((h) => `39999:${h.pubkey}:${tagVal(h, 'd')}`)
    )];
    const assertionsRes = await queryRelayStatus(taggingRelay, { kinds: [39999], '#z': headerCoords });
    if (!assertionsRes.ok) return { candidates: [], relayOk: false };

    // Step 3 — per-tag resolution over the shared pools. Membership of the ASSERTER
    // is the one trust gate; the honored-authority gate stays as the guard that makes
    // the header input trustworthy for any caller (near-redundant here, per story #8).
    const keptByTag = tags.map((tag) => {
      const headers = headersByCoord.get(tagElementAddr(tag.authorPubkey, tag.slug));
      if (!headers || !headers.length) return [];
      const { targets } = groupTaggingsByTarget({
        candidates: assertionsRes.events,
        headers,
        honoredAuthorities: [taPubkey],
        isAsserterTrusted: (pk) => memberSet.has(pk),
        tag: { authorPubkey: tag.authorPubkey, slug: tag.slug },
      });
      return targets.filter((t) => t.applications.length >= 1 && t.target && t.target.id);
    });

    // Step 4 — one bodies fetch for the union of kept ids across ALL tags, in
    // parallel across the tagging relay ∪ noteRelays, deduped by id (kind-1 is
    // non-replaceable). Satisfied if ANY relay responds; an id whose body resolves
    // nowhere is dropped silently.
    const ids = [...new Set(keptByTag.flat().map((t) => t.target.id))];
    if (!ids.length) return { candidates: [], relayOk: true };
    const noteResults = await Promise.all(
      [...new Set([taggingRelay, ...noteRelays])].map((url) => queryRelayStatus(url, { kinds: [1], ids }))
    );
    if (!noteResults.some((r) => r.ok)) return { candidates: [], relayOk: false };
    const noteById = new Map();
    for (const r of noteResults) if (r.ok) for (const ev of r.events) if (!noteById.has(ev.id)) noteById.set(ev.id, ev);

    // Step 5 — one candidate per (tag, kept note); the merge unions same-note entries.
    const candidates = [];
    tags.forEach((tag, i) => {
      if (!keptByTag[i].length) return;
      const taggedWith = metaFor(tag);
      for (const t of keptByTag[i]) {
        const event = noteById.get(t.target.id);
        if (!event) continue;
        candidates.push({
          event,
          channels: [...tag.channels],
          vias: [{ provider: 'event-tag', tag: tag.slug, applications: t.applications.length }],
          taggedWith,
          // Story 10 (ADR 0038): APPLIER identities for the header's active-tagger
          // count — appliers only; the resolver keeps disputes in a separate bucket.
          taggers: [...new Set(t.applications.map((a) => a.authorPubkey))],
        });
      }
    });
    return { candidates, relayOk: true };
  } catch {
    return { candidates: [], relayOk: false };
  }
}

module.exports = { fetchTaggedCandidates };
