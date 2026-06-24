'use strict';

// Content-relevance classification (ADR 0033). Two exports:
//   classifyNotes(notes, { kv, classifyOne }) — KV-cached orchestration (judge once).
//   classifyOne(note, { anthropic })          — the single Claude Haiku call.
// External deps (KV, the model) are injected so tests substitute fakes (no network in npm test).

const KEY_PREFIX = 'relevance:v2:'; // versioned: a prompt/model change re-scores under a new version
// v2 (2026-06-22): subject-vs-medium scoring rewrite — hashtags / being-on-Nostr no longer
// imply the nostr topic; added few-shot off-topic examples. Re-scores everything cached under v1.
// Fallback sentinel: when the classifier is unavailable, every note clears any threshold,
// i.e. the feed degrades to hashtag-only (no content filtering). NOT cached, so it retries.
const PASS_THROUGH = { bitcoin: 1, nostr: 1, lfo: 1 };
// Max model calls in flight at once (ADR 0033 cold-start mitigation). A cold cache can carry
// up to CANDIDATE_LIMIT (~500) misses; classifying them one-at-a-time would serialize ~500
// Haiku calls and time out the request. Bounded so we don't overwhelm the API / hit rate limits.
const CONCURRENCY = 5;

// Score one note: cache hit → reuse (skip model); miss → classifyOne once + persist;
// error → pass-through fallback (deliberately NOT persisted, so it retries next time).
async function scoreNote(note, deps) {
  const { kv, classifyOne } = deps || {};
  const key = KEY_PREFIX + note.id;
  const cached = kv ? await kv.get(key) : null;
  if (cached) return cached;
  try {
    const scores = await classifyOne(note, deps);
    if (kv) await kv.set(key, scores); // persist (write-once)
    return scores;
  } catch {
    return { ...PASS_THROUGH }; // graceful fallback; not persisted
  }
}

// KV-cached orchestration. Notes are independent, so we score them with bounded concurrency
// (CONCURRENCY workers draining a shared cursor) rather than sequentially. Return order is
// irrelevant — the feed sorts by recency downstream. Semantics are identical to one-at-a-time.
async function classifyNotes(notes, deps) {
  const out = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < notes.length) {
      const note = notes[cursor++]; // claim synchronously (single-threaded → no race)
      out.set(note.id, await scoreNote(note, deps));
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, notes.length) }, worker);
  await Promise.all(workers);
  return out;
}

const MODEL = 'claude-haiku-4-5';

// Moderate breadth + adjacency + depth-neutrality, per the story's relevance definition.
// v2: the post's SUBJECT is what's scored — not the network it rides on, not its hashtags.
const SYSTEM = [
  'You score how much a short social post relates to each of three topics, for a Bitcoin/Nostr community feed.',
  'Return ONLY compact JSON: {"bitcoin":<0..1>,"nostr":<0..1>,"lfo":<0..1>}. No prose.',
  'bitcoin: Bitcoin and clearly adjacent subjects — Lightning, mining, self-custody, wallets, sats, broader crypto/freedom-tech.',
  'nostr: the Nostr protocol and its ecosystem — clients, NIPs, relays, keys, npubs.',
  'lfo: the Les Femmes Orange community itself — its members, events, and community life.',
  'Judge TOPIC ONLY, never sophistication: a casual "going to a bitcoin meetup" post is as relevant as a deep technical thread. Off-topic posts (e.g. a pet photo) score low on all three.',
  'Score the SUBJECT of the post, not its hashtags. IGNORE hashtags entirely when scoring: #nostr, #asknostr — and the fact that the post lives on Nostr — are NOT evidence of the nostr topic. A question merely broadcast via #asknostr is about its actual subject (e.g. trees, movies), not about Nostr.',
  'A topic must be what the post is ABOUT, not a passing mention or a form of address. Name-dropping "nostr people" or addressing "#nostr" does not make a post about Nostr.',
  'Bare greetings and low-content posts (e.g. "GM", "good morning #nostr people") score low on all three, even when they mention the community.',
  'Examples that score near zero on all three: "Who can tell me what tree is this? #asknostr" (about a tree); "GM #nostr people, enjoy this beautiful day" (a greeting); "Listen #nostr, start a faith journey, may the grace of the Lord Jesus Christ be with you" (about religion).',
].join(' ');

async function classifyOne(note, { anthropic }) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 100,
    system: SYSTEM,
    messages: [{ role: 'user', content: (note.content || '').slice(0, 2000) }],
  });
  const text = (resp && resp.content && resp.content[0] && resp.content[0].text) || '';
  const match = text.match(/\{[\s\S]*\}/);
  const raw = JSON.parse(match ? match[0] : text);
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  return { bitcoin: clamp(raw.bitcoin), nostr: clamp(raw.nostr), lfo: clamp(raw.lfo) };
}

module.exports = { classifyNotes, classifyOne, KEY_PREFIX, PASS_THROUGH };
