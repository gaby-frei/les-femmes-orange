'use strict';

// GET /api/feed — the server-side feed data layer (ADR 0033, executing ADR 0029's planned
// migration). Per request: compute members → fetch a widened Provider-1 pool → KV-cached
// Haiku classification → keep max>=threshold → newest DISPLAY_LIMIT → ADR 0029 contract.
//
// `buildFeedPayload(deps)` is the pure orchestrator (all externals injected → unit-tested
// with fakes). `handler(req,res)` wires the REAL deps from env and is what Vercel runs.
const { selectRelevant } = require('./_lib/select.js');
const { classifyNotes, classifyOne } = require('./_lib/classify.js');

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
const FEED_HASHTAGS = ['nostr', 'asknostr', 'grownostr', 'bitcoin', 'btc', 'lightning', 'sats', 'lfo', 'LFO', 'lesfemmesorange'];
// Widened fetch (relay natural cap). Env-overridable so a preview deploy can pull a
// small pool (e.g. FEED_CANDIDATE_LIMIT=100) to make KV writes easy to review by hand;
// default stays ~500. Unset/invalid → 500.
const CANDIDATE_LIMIT = Number(process.env.FEED_CANDIDATE_LIMIT) || 500;
const DISPLAY_LIMIT = 100; // post-filter display size
const THRESHOLD = 0.3; // conservative / lean-inclusive; tunable

function defaultNpubShort(hex) { const s = String(hex); return 'npub1' + s.slice(0, 6) + '…' + s.slice(-4); }
function defaultPic(url) { return (typeof url === 'string' && /^https?:\/\//.test(url)) ? url : ''; }

// Pure orchestrator. deps: { computeMembers, fetchCandidates, classifyNotes, fetchMetadata,
// threshold, displayLimit, candidateLimit, encodeNpubShort?, sanitizePicture? }.
async function buildFeedPayload(deps) {
  const {
    computeMembers, fetchCandidates, classifyNotes: classify, fetchMetadata,
    threshold = THRESHOLD, displayLimit = DISPLAY_LIMIT, candidateLimit = CANDIDATE_LIMIT,
    encodeNpubShort = defaultNpubShort, sanitizePicture = defaultPic,
  } = deps;

  const memberPubkeys = await computeMembers();
  const candidates = await fetchCandidates(memberPubkeys, candidateLimit);
  const scores = await classify(candidates);
  const selected = selectRelevant(candidates, scores, { threshold, displayLimit });

  const authorPubkeys = [...new Set(selected.map((e) => e.pubkey))];
  const metaMap = await fetchMetadata(memberPubkeys);

  const notes = selected.map((ev) => {
    const m = metaMap.get(ev.pubkey) || {};
    return {
      id: ev.id,
      pubkey: ev.pubkey,
      created_at: ev.created_at,
      content: ev.content || '',
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

  return { memberCount: authorPubkeys.length, notes, memberNames };
}

// ── HTTP handler (Vercel) — wires the real deps. Not exercised by npm test (no real
// relays/Haiku/KV in CI); validated via `vercel dev` / preview and `npm run eval:relevance`.
async function handler(req, res) {
  try {
    const { nip19 } = await import('nostr-tools'); // ESM — dynamic import from CJS
    const { queryRelays, queryRelayStatus } = require('./_lib/relay.js');
    const { buildMemberSets } = require('../public/lib/membership.js');
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

    const payload = await buildFeedPayload({
      computeMembers,
      fetchCandidates,
      classifyNotes: (notes) => classifyNotes(notes, { kv, classifyOne, anthropic }),
      fetchMetadata,
      threshold: THRESHOLD,
      displayLimit: DISPLAY_LIMIT,
      candidateLimit: CANDIDATE_LIMIT,
      encodeNpubShort,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ...payload, relayStatus });
  } catch (err) {
    res.status(500).json({ memberCount: 0, notes: [], memberNames: {}, relayStatus: [], error: String(err && err.message || err) });
  }
}

module.exports = handler;
module.exports.buildFeedPayload = buildFeedPayload;
