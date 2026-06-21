'use strict';

// Content-relevance classification (ADR 0033). Two exports:
//   classifyNotes(notes, { kv, classifyOne }) — KV-cached orchestration (judge once).
//   classifyOne(note, { anthropic })          — the single Claude Haiku call.
// External deps (KV, the model) are injected so tests substitute fakes (no network in npm test).

const KEY_PREFIX = 'relevance:v1:'; // versioned: a prompt/model change re-scores under v2:
// Fallback sentinel: when the classifier is unavailable, every note clears any threshold,
// i.e. the feed degrades to hashtag-only (no content filtering). NOT cached, so it retries.
const PASS_THROUGH = { bitcoin: 1, nostr: 1, lfo: 1 };

async function classifyNotes(notes, deps) {
  const { kv, classifyOne } = deps || {};
  const out = new Map();
  for (const note of notes) {
    const key = KEY_PREFIX + note.id;
    const cached = kv ? await kv.get(key) : null;
    if (cached) { out.set(note.id, cached); continue; } // cache hit → skip the model
    try {
      const scores = await classifyOne(note, deps);
      if (kv) await kv.set(key, scores); // persist (write-once)
      out.set(note.id, scores);
    } catch {
      out.set(note.id, { ...PASS_THROUGH }); // graceful fallback; not persisted
    }
  }
  return out;
}

const MODEL = 'claude-haiku-4-5';

// Moderate breadth + adjacency + depth-neutrality, per the story's relevance definition.
const SYSTEM = [
  'You score how much a short social post relates to each of three topics, for a Bitcoin/Nostr community feed.',
  'Return ONLY compact JSON: {"bitcoin":<0..1>,"nostr":<0..1>,"lfo":<0..1>}. No prose.',
  'bitcoin: Bitcoin and clearly adjacent subjects — Lightning, mining, self-custody, wallets, sats, broader crypto/freedom-tech.',
  'nostr: the Nostr protocol and its ecosystem — clients, NIPs, relays, keys, npubs.',
  'lfo: the Les Femmes Orange community itself — its members, events, and community life.',
  'Judge TOPIC ONLY, never sophistication: a casual "going to a bitcoin meetup" post is as relevant as a deep technical thread. Off-topic posts (e.g. a pet photo) score low on all three.',
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
