'use strict';

// GET /api/feed — the server-side feed data layer (ADR 0033, executing ADR 0029's planned
// migration). Per request: compute members → fetch a widened Provider-1 pool → KV-cached
// Haiku classification → keep max>=threshold → newest DISPLAY_LIMIT → ADR 0029 contract.
//
// `buildFeedPayload(deps)` is the pure orchestrator (all externals injected → unit-tested
// with fakes). `handler(req,res)` wires the REAL deps from env and is what Vercel runs.
const { selectRelevant } = require('./_lib/select.js');
const { classifyNotes, classifyOne } = require('./_lib/classify.js');
const { extractImetaMedia } = require('./_lib/media.js');
const { mergeCandidatePools } = require('./_lib/merge.js');

// ── Config (mirrors public/index.html; see ADR 0029/0032/0033) ──────────────
const LFO_TAG_EVENT_ID = '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795';
const NOSTR_USER_TAG_ADDR = '39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:nostr-user-tag';
const SEED_PUBKEY = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const MEMBERSHIP_RELAYS = ['wss://tags.brainstorm.world/relay', 'wss://nos.lol'];
// nos.lol = primary/complete source. damus = INTERIM augment that is server-reachable
// and carries the write-blocked test npubs. The durable coverage fix is an epic-level open
// question (community-feed: coverage probe / NIP-65 outbox).
const FEED_RELAYS = [
  { url: 'wss://nos.lol', timeout: 12000 },
  { url: 'wss://relay.damus.io', timeout: 10000 },
];
// #grownostr dropped 2026-06-22: it was used as a generic lifestyle/reach tag (houses, horses,
// embroidery, pets), not a topic signal — net noise. #asknostr stays (legit Nostr Q&A); the
// classifier filters its off-topic broadcast uses. See classify.js v2 prompt.
const FEED_HASHTAGS = ['nostr', 'asknostr', 'bitcoin', 'btc', 'lightning', 'sats', 'lfo', 'LFO', 'lesfemmesorange'];
// Widened fetch (relay natural cap). Env-overridable so a preview deploy can pull a
// small pool (e.g. FEED_CANDIDATE_LIMIT=100) to make KV writes easy to review by hand;
// default stays ~500. Unset/invalid → 500.
const CANDIDATE_LIMIT = Number(process.env.FEED_CANDIDATE_LIMIT) || 500;
const DISPLAY_LIMIT = 100; // post-filter display size
const THRESHOLD = 0.3; // conservative / lean-inclusive; tunable

// Provider 2 — the event-tag source (Story 8, ADR 0036; multi-tag Story 9, ADR 0037).
// Tags are pinned by a-coordinate (that IS a tag's identity); the TA pubkey is NEVER
// pinned — resolved at runtime from TA_PUBKEY_URL and cached per process (api/_lib/ta.js).
// EVENT_TAGS is a static config deliberately shaped as the projection a curated
// tag-DList read would produce (`channels` arrays: 1:many-ready) — story #2's swap
// point. `ask-lfo` maps to a channel no other source populates: the classifier's
// topic set (CHANNELS below) does not grow, so Provider 1 can never assign it.
const TAGGING_RELAY = 'wss://tags.brainstorm.world/relay';
const TA_PUBKEY_URL = 'https://tags.brainstorm.world/api/assistant/pubkey';
const TAG_AUTHOR = '6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597';
const EVENT_TAGS = [
  { authorPubkey: TAG_AUTHOR, slug: 'lfo-community', channels: ['lfo'] },
  { authorPubkey: TAG_AUTHOR, slug: 'bitcoin', channels: ['bitcoin'] },
  { authorPubkey: TAG_AUTHOR, slug: 'nostr', channels: ['nostr'] },
  { authorPubkey: TAG_AUTHOR, slug: 'ask-lfo', channels: ['ask-lfo'] },
];

function defaultNpubShort(hex) { const s = String(hex); return 'npub1' + s.slice(0, 6) + '…' + s.slice(-4); }
function defaultPic(url) { return (typeof url === 'string' && /^https?:\/\//.test(url)) ? url : ''; }

// Pure orchestrator. deps: { computeMembers, fetchCandidates, classifyNotes, fetchMetadata,
// fetchTaggedCandidates?, threshold, displayLimit, candidateLimit, encodeNpubShort?,
// sanitizePicture? }. Provider 2 (fetchTaggedCandidates) is additive: absent, rejecting,
// or malformed → the status-quo Provider-1 feed (never fail the request; ADR 0036).
async function buildFeedPayload(deps) {
  const {
    computeMembers, fetchCandidates, classifyNotes: classify, fetchMetadata,
    fetchTaggedCandidates: fetchTagged = async () => ({ candidates: [] }),
    threshold = THRESHOLD, displayLimit = DISPLAY_LIMIT, candidateLimit = CANDIDATE_LIMIT,
    encodeNpubShort = defaultNpubShort, sanitizePicture = defaultPic,
    classifierAvailable = true,
  } = deps;

  const memberPubkeys = await computeMembers();
  const memberSet = new Set(memberPubkeys);

  // Both providers run in parallel; Provider 2 never sees the classifier and its
  // failure is caught here (defense in depth on top of tagged.js's own never-throw).
  const [{ candidates, scores }, p2Pool] = await Promise.all([
    (async () => {
      const c = await fetchCandidates(memberPubkeys, candidateLimit);
      return { candidates: c, scores: await classify(c) };
    })(),
    (async () => {
      try {
        const r = await fetchTagged(memberSet);
        return r && Array.isArray(r.candidates) ? r.candidates : [];
      } catch { return []; }
    })(),
  ]);
  const selected = selectRelevant(candidates, scores, { threshold, displayLimit });

  // Channel tagging (ADR 0034): tag each note with every topic channel whose per-topic
  // score clears the SAME shared threshold used for selection. The pass-through fallback
  // {1,1,1} therefore yields all three channels, so a filter never hides a degraded note.
  const getScore = scores && typeof scores.get === 'function'
    ? (id) => scores.get(id)
    : (id) => (scores ? scores[id] : undefined);
  const CHANNELS = ['bitcoin', 'nostr', 'lfo'];

  // Provider seam (ADR 0036): each provider yields { event, channels, vias } candidates;
  // the merge dedupes by id (channels unioned, provenance kept) and orders by recency.
  const p1Pool = selected.map((ev) => {
    const s = getScore(ev.id) || {};
    return { event: ev, channels: CHANNELS.filter((c) => (s[c] || 0) >= threshold), vias: [{ provider: 'hashtag' }] };
  });
  const merged = mergeCandidatePools([p1Pool, p2Pool], { displayLimit });

  const authorPubkeys = [...new Set(merged.map((c) => c.event.pubkey))];
  // Members ∪ displayed authors: a Provider-2 note by a non-member still renders
  // with a name/avatar when its kind-0 is reachable (falls back to npub-short).
  const metaMap = await fetchMetadata([...new Set([...memberPubkeys, ...authorPubkeys])]);

  const notes = merged.map((c) => {
    const ev = c.event;
    const m = metaMap.get(ev.pubkey) || {};
    return {
      id: ev.id,
      pubkey: ev.pubkey,
      created_at: ev.created_at,
      content: ev.content || '',
      // imeta-resolved media (Story 7, ADR 0035): lets the client embed extension-less
      // Blossom URLs it can't classify from the URL alone. [] when the note has no imeta.
      media: extractImetaMedia(ev.tags),
      channels: c.channels,
      // Tag pill (Story 8 UI amendment): display metadata for the event-tags this note
      // carries. Additive; absent on notes with none, so pre-#8 clients are unaffected.
      ...(c.taggedWith && c.taggedWith.length ? { taggedWith: c.taggedWith } : {}),
      // Applier pubkeys (Story 10, ADR 0038): feeds the header's live per-channel
      // "active content taggers" count. Additive; absent on untagged notes.
      ...(c.taggers && c.taggers.length ? { taggers: c.taggers } : {}),
      author: {
        displayName: m.display_name || m.name || encodeNpubShort(ev.pubkey),
        npubShort: encodeNpubShort(ev.pubkey),
        picture: sanitizePicture(m.picture),
      },
    };
  });

  // memberNames drives @-mention resolution (#4); keep it in the payload so the
  // render layer is unchanged after getFeed() moves behind /api/feed.
  const memberNames = {};
  for (const pk of memberPubkeys) {
    const m = metaMap.get(pk);
    const nm = m && (m.display_name || m.name);
    if (nm) memberNames[pk] = nm;
  }

  // channelsAvailable (ADR 0034): false when per-topic scores could not be produced, so the UI
  // disables the pills and shows everything rather than offering a filter it can't apply. Two
  // degradation signals: (1) the classifier was never available (e.g. no API key →
  // classifierAvailable=false); (2) it was available but every score is the {1,1,1} PASS_THROUGH
  // sentinel — i.e. classification errored at runtime and fell back for every note. Only an
  // all-three 1.0 counts as the sentinel, so a genuine single-bucket 1.0 is not misread.
  const isPassThrough = (s) => !!s && s.bitcoin === 1 && s.nostr === 1 && s.lfo === 1;
  const allFellBack = selected.length > 0 && selected.every((ev) => isPassThrough(getScore(ev.id)));
  const channelsAvailable = classifierAvailable && !allFellBack;

  return { memberCount: authorPubkeys.length, notes, memberNames, channelsAvailable };
}

// ── HTTP handler (Vercel) — wires the real deps. Not exercised by npm test (no real
// relays/Haiku/KV in CI); validated via `vercel dev` / preview and `npm run eval:relevance`.
async function handler(req, res) {
  try {
    const { nip19 } = await import('nostr-tools'); // ESM — dynamic import from CJS
    const { queryRelays, queryRelayStatus } = require('./_lib/relay.js');
    const { buildMemberSets } = require('../public/lib/membership.js');
    const { fetchTaggedCandidates } = require('./_lib/tagged.js');
    const { getTaPubkey } = require('./_lib/ta.js');
    const { Redis } = require('@upstash/redis');
    const Anthropic = require('@anthropic-ai/sdk');

    const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

    const encodeNpubShort = (hex) => {
      try { const f = nip19.npubEncode(hex); return f.slice(0, 10) + '…' + f.slice(-4); }
      catch { return String(hex).slice(0, 8) + '…'; }
    };

    const computeMembers = async () => {
      const tagItems = await queryRelays(MEMBERSHIP_RELAYS, { kinds: [9999, 39999], '#e': [LFO_TAG_EVENT_ID], '#z': [NOSTR_USER_TAG_ADDR] }, 10000);
      const { verifiedMap } = buildMemberSets(tagItems, SEED_PUBKEY);
      return [...verifiedMap.keys()].filter((pk) => pk !== SEED_PUBKEY);
    };

    let relayStatus = FEED_RELAYS.map((r) => ({ url: r.url, ok: false }));
    const fetchCandidates = async (memberPubkeys, limit) => {
      const filter = { kinds: [1], authors: memberPubkeys, '#t': FEED_HASHTAGS, limit };
      const settled = await Promise.allSettled(FEED_RELAYS.map((r) => queryRelayStatus(r.url, filter, r.timeout)));
      const seen = new Set();
      const raw = [];
      relayStatus = FEED_RELAYS.map((r, i) => {
        const s = settled[i];
        const ok = s.status === 'fulfilled' && s.value.ok === true;
        if (s.status === 'fulfilled') for (const ev of s.value.events) if (!seen.has(ev.id)) { seen.add(ev.id); raw.push(ev); }
        return { url: r.url, ok };
      });
      return raw;
    };

    const fetchMetadata = async (pubkeys) => {
      if (!pubkeys.length) return new Map();
      const evs = await queryRelays(FEED_RELAYS.map((r) => r.url), { kinds: [0], authors: pubkeys }, 12000);
      const map = new Map();
      for (const ev of evs) {
        const cur = map.get(ev.pubkey);
        if (!cur || ev.created_at > cur._ts) {
          try { const m = JSON.parse(ev.content); m._ts = ev.created_at; map.set(ev.pubkey, m); } catch {}
        }
      }
      return map;
    };

    // Provider 2 (Story 8, ADR 0036): per-request tagging read, no cache. relayOk is
    // captured so relayStatus reports the tagging relay (a Provider-2 outage is
    // visible, not silent) — ok:false covers TA-fetch failure, relay failure, timeout.
    let taggingRelayOk = false;
    const fetchTagged = async (memberSet) => {
      const r = await fetchTaggedCandidates({
        getTaPubkey: () => getTaPubkey({ url: TA_PUBKEY_URL }),
        queryRelayStatus,
        memberSet,
        tags: EVENT_TAGS,
        taggingRelay: TAGGING_RELAY,
        // Note-body sources (ADR 0036 Decision 3, revised 2026-07-11): the tagging relay
        // holds tagging events, not note bodies — bodies live on the feed relays.
        noteRelays: FEED_RELAYS.map((r) => r.url),
      });
      taggingRelayOk = r.relayOk === true;
      return r;
    };

    const payload = await buildFeedPayload({
      computeMembers,
      fetchCandidates,
      classifyNotes: (notes) => classifyNotes(notes, { kv, classifyOne, anthropic }),
      fetchMetadata,
      fetchTaggedCandidates: fetchTagged,
      threshold: THRESHOLD,
      displayLimit: DISPLAY_LIMIT,
      candidateLimit: CANDIDATE_LIMIT,
      encodeNpubShort,
      // Signal (1) of channelsAvailable: no AI key → classifier never available. Signal (2),
      // a key that's present but erroring at runtime, is detected in buildFeedPayload via the
      // all-PASS_THROUGH check, so both degradation modes disable the client-side filter.
      classifierAvailable: anthropic != null,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ...payload, relayStatus: [...relayStatus, { url: TAGGING_RELAY, ok: taggingRelayOk }] });
  } catch (err) {
    res.status(500).json({ memberCount: 0, notes: [], memberNames: {}, relayStatus: [], error: String(err && err.message || err) });
  }
}

module.exports = handler;
module.exports.buildFeedPayload = buildFeedPayload;
