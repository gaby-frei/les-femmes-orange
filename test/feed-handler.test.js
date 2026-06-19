// L3 — handler/contract integration tests (Story 5). Kind 1 ("plumbing"): every external
// dependency (members, relay fetch, classifier, metadata, KV) is faked. Written BEFORE
// implementation — RED until `api/feed.js` exports `buildFeedPayload(deps)` returning the
// ADR 0029 contract.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFeedPayload } = require('../api/feed.js');
const { GOLDEN, seededScores, noteFor } = require('./fixtures/golden-notes.js');

const NOTES = GOLDEN.map((g) => g.note);

function deps(overrides = {}) {
  return {
    computeMembers: async () => NOTES.map((n) => n.pubkey),
    fetchCandidates: async () => NOTES,
    classifyNotes: async () => seededScores(),
    fetchMetadata: async () => new Map(),
    kv: { async get() { return null; }, async set() {} },
    threshold: 0.3,
    candidateLimit: 500,
    displayLimit: 100,
    ...overrides,
  };
}

test('returns the ADR 0029 contract shape', async () => {
  const out = await buildFeedPayload(deps());
  assert.equal(typeof out.memberCount, 'number');
  assert.ok(Array.isArray(out.notes));
  const n = out.notes[0];
  for (const k of ['id', 'pubkey', 'created_at', 'content', 'author']) assert.ok(k in n, 'note has ' + k);
  for (const k of ['displayName', 'npubShort', 'picture']) assert.ok(k in n.author, 'author has ' + k);
});

test('excludes the off-topic note end-to-end', async () => {
  const out = await buildFeedPayload(deps());
  assert.ok(!out.notes.some((n) => n.id === noteFor('off-topic').id), 'dog post not in feed');
});

test('never returns an unjudged note (a candidate with no score)', async () => {
  const extra = { id: 'unscored', pubkey: 'ff'.repeat(32), created_at: 1_730_999_999, content: 'mystery', tags: [['t', 'bitcoin']] };
  const out = await buildFeedPayload(deps({
    fetchCandidates: async () => [...NOTES, extra],
    classifyNotes: async () => seededScores(), // no score for `unscored`
  }));
  assert.ok(!out.notes.some((n) => n.id === 'unscored'), 'unjudged note is never shown');
});

test('slices to displayLimit, newest-first', async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, pubkey: 'aa'.repeat(32), created_at: 2000 + i, content: 'c', tags: [['t', 'bitcoin']] }));
  const out = await buildFeedPayload(deps({
    fetchCandidates: async () => many,
    classifyNotes: async () => new Map(many.map((n) => [n.id, { bitcoin: 0.9, nostr: 0, lfo: 0 }])),
    displayLimit: 3,
  }));
  assert.equal(out.notes.length, 3);
  assert.deepEqual(out.notes.map((n) => n.id), ['m9', 'm8', 'm7']);
});

test('fallback path: pass-through scores yield an unfiltered (hashtag-only) feed', async () => {
  const out = await buildFeedPayload(deps({
    classifyNotes: async (notes) => new Map(notes.map((n) => [n.id, { bitcoin: 1, nostr: 1, lfo: 1 }])),
  }));
  assert.equal(out.notes.length, NOTES.length, 'all candidates pass when classification falls back');
});

test('memberCount counts distinct authors among the returned notes', async () => {
  const out = await buildFeedPayload(deps());
  const distinct = new Set(out.notes.map((n) => n.pubkey)).size;
  assert.equal(out.memberCount, distinct);
});
