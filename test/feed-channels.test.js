// L3 — channel-tagging contract tests (Story 6, ADR 0034). Kind 1 ("plumbing"): every external
// dependency is faked. Written BEFORE implementation — RED until `buildFeedPayload` attaches a
// per-note `channels` array (derived from the per-topic scores at the single shared threshold) and
// a top-level `channelsAvailable` boolean to the payload.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFeedPayload } = require('../api/feed.js');

const THRESHOLD = 0.3;

// One author so memberCount math is irrelevant to these tests; ids are unique per note.
const PK = 'a'.repeat(64);
const note = (id, created_at = 1_730_000_000) => ({ id, pubkey: PK, created_at, content: 'c', tags: [] });

// Build deps for a given set of {note, score} rows. classifierAvailable defaults to true.
function depsFor(rows, overrides = {}) {
  const notes = rows.map((r) => r.note);
  const scores = new Map(rows.map((r) => [r.note.id, r.score]));
  return {
    computeMembers: async () => [PK],
    fetchCandidates: async () => notes,
    classifyNotes: async () => scores,
    fetchMetadata: async () => new Map(),
    threshold: THRESHOLD,
    candidateLimit: 500,
    displayLimit: 100,
    ...overrides,
  };
}

const channelsOf = (out, id) => [...(out.notes.find((n) => n.id === id).channels || [])].sort();

test('tags a note with the single channel that clears the threshold', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('btc'), score: { bitcoin: 0.95, nostr: 0.05, lfo: 0.0 } },
  ]));
  assert.deepEqual(channelsOf(out, 'btc'), ['bitcoin'],
    'a bitcoin-only note should be tagged exactly ["bitcoin"]');
});

test('tags a note with every channel that clears the threshold (multi-label)', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('multi'), score: { bitcoin: 0.7, nostr: 0.5, lfo: 0.0 } },
  ]));
  assert.deepEqual(channelsOf(out, 'multi'), ['bitcoin', 'nostr'],
    'a note clearing threshold on bitcoin and nostr belongs to both channels');
});

test('omits a channel whose score is below the threshold', async () => {
  const out = await buildFeedPayload(depsFor([
    // nostr 0.29 is just under T=0.3 → excluded; lfo clears it.
    { note: note('lfo'), score: { bitcoin: 0.0, nostr: 0.29, lfo: 0.8 } },
  ]));
  assert.deepEqual(channelsOf(out, 'lfo'), ['lfo'],
    'a sub-threshold nostr score must not add the nostr channel');
});

test('a score exactly at the threshold is included (>= boundary)', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('edge'), score: { bitcoin: THRESHOLD, nostr: 0.0, lfo: 0.0 } },
  ]));
  assert.deepEqual(channelsOf(out, 'edge'), ['bitcoin'],
    'a note scoring exactly = threshold is in that channel');
});

test('a pass-through (fallback) note is tagged with all three channels', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('passthru'), score: { bitcoin: 1, nostr: 1, lfo: 1 } },
  ]));
  assert.deepEqual(channelsOf(out, 'passthru'), ['bitcoin', 'lfo', 'nostr'],
    'pass-through scores put a note in every channel so a filter never hides it');
});

test('channelsAvailable is true on the normal path', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('btc'), score: { bitcoin: 0.9, nostr: 0, lfo: 0 } },
  ]));
  assert.equal(out.channelsAvailable, true,
    'channelsAvailable defaults to true when scores were produced normally');
});

test('channelsAvailable is false when the classifier is unavailable', async () => {
  const out = await buildFeedPayload(depsFor(
    [{ note: note('btc'), score: { bitcoin: 1, nostr: 1, lfo: 1 } }],
    { classifierAvailable: false },
  ));
  assert.equal(out.channelsAvailable, false,
    'a degraded classifier must surface channelsAvailable=false so the UI disables the pills');
});

test('channelsAvailable is false when every note fell back to pass-through (classifier erroring with a key present)', async () => {
  // classifierAvailable defaults to true (key present), but all scores are the {1,1,1} sentinel
  // → classification degraded → the UI must still disable filtering (AC-9 / ADR 0034).
  const out = await buildFeedPayload(depsFor([
    { note: note('a', 1), score: { bitcoin: 1, nostr: 1, lfo: 1 } },
    { note: note('b', 2), score: { bitcoin: 1, nostr: 1, lfo: 1 } },
  ]));
  assert.equal(out.channelsAvailable, false,
    'all-pass-through scores mean the classifier degraded → channelsAvailable=false even with a key present');
});

test('a real score of exactly 1 on a single bucket is not mistaken for pass-through', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('btc', 1), score: { bitcoin: 1, nostr: 0, lfo: 0 } },
  ]));
  assert.equal(out.channelsAvailable, true,
    'only an all-three {1,1,1} score signals fallback; a genuine single-bucket 1.0 stays available');
});

test('the existing note/payload fields are unchanged (channels is additive)', async () => {
  const out = await buildFeedPayload(depsFor([
    { note: note('btc'), score: { bitcoin: 0.9, nostr: 0, lfo: 0 } },
  ]));
  assert.equal(typeof out.memberCount, 'number');
  assert.ok(Array.isArray(out.notes));
  const n = out.notes[0];
  for (const k of ['id', 'pubkey', 'created_at', 'content', 'author', 'channels']) {
    assert.ok(k in n, 'note still has ' + k);
  }
  assert.ok(Array.isArray(n.channels), 'channels is an array');
});
