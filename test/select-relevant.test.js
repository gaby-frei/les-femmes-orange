// L1 — pure unit tests for the relevance filter (Story 5). Kind 1 ("plumbing"): the AI is
// not called; scores are seeded. Written BEFORE implementation — RED until
// `api/_lib/select.js` exports `selectRelevant(notes, scores, { threshold, displayLimit })`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectRelevant } = require('../api/_lib/select.js');
const { GOLDEN, seededScores, noteFor } = require('./fixtures/golden-notes.js');

const NOTES = GOLDEN.map((g) => g.note);
const SCORES = seededScores();
const THRESHOLD = 0.3;
const opts = { threshold: THRESHOLD, displayLimit: 100 };

test('drops a note whose max score is below threshold (off-topic dog post)', () => {
  const out = selectRelevant(NOTES, SCORES, opts);
  assert.ok(!out.some((n) => n.id === noteFor('off-topic').id), 'dog post excluded');
});

test('keeps a note scoring >= threshold on the bitcoin bucket (lightning is bitcoin-adjacent)', () => {
  const out = selectRelevant(NOTES, SCORES, opts);
  assert.ok(out.some((n) => n.id === noteFor('bitcoin-adjacent').id), 'lightning post kept');
});

test('filter uses the MAX of the three scores (an lfo-only note passes)', () => {
  const out = selectRelevant(NOTES, SCORES, opts);
  assert.ok(out.some((n) => n.id === noteFor('lfo').id), 'lfo-only note kept on its lfo score');
});

test('depth-neutral: the casual on-topic note is kept just like its technical twin', () => {
  const out = selectRelevant(NOTES, SCORES, opts);
  assert.ok(out.some((n) => n.id === noteFor('bitcoin-casual').id), 'casual kept');
  assert.ok(out.some((n) => n.id === noteFor('bitcoin-technical').id), 'technical kept');
});

test('keeps a note scoring exactly at the threshold (>= boundary)', () => {
  const n = { id: 'edge', pubkey: 'a'.repeat(64), created_at: 1, content: 'x', tags: [] };
  const s = new Map([[n.id, { bitcoin: THRESHOLD, nostr: 0, lfo: 0 }]]);
  assert.equal(selectRelevant([n], s, opts).length, 1);
});

test('sorts survivors newest-first and slices to displayLimit', () => {
  const many = [];
  const s = new Map();
  for (let i = 0; i < 10; i++) {
    const id = 'n' + i;
    many.push({ id, pubkey: 'aa'.repeat(32), created_at: 1000 + i, content: 'c', tags: [] });
    s.set(id, { bitcoin: 0.9, nostr: 0, lfo: 0 });
  }
  const out = selectRelevant(many, s, { threshold: THRESHOLD, displayLimit: 3 });
  assert.equal(out.length, 3, 'sliced to displayLimit');
  assert.deepEqual(out.map((n) => n.id), ['n9', 'n8', 'n7'], 'newest-first');
});

test('a note with no score is treated as unjudged and excluded (AC-6 at the filter level)', () => {
  const n = { id: 'unscored', pubkey: 'ff'.repeat(32), created_at: 1, content: 'c', tags: [] };
  assert.deepEqual(selectRelevant([n], new Map(), opts), []);
});

test('returns empty for empty input', () => {
  assert.deepEqual(selectRelevant([], new Map(), opts), []);
});
