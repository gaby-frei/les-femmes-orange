// L2 — orchestration unit tests for classification caching/fallback (Story 5). Kind 1
// ("plumbing"): the model is a stub; KV is an in-memory fake. Written BEFORE implementation —
// RED until `api/_lib/classify.js` exports `classifyNotes(notes, { kv, classifyOne })`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyNotes } = require('../api/_lib/classify.js');

const KEY = (id) => 'relevance:v2:' + id;

function fakeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    sets: [],
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async set(key, val) { this.sets.push([key, val]); store.set(key, val); },
  };
}

test('cache hit: an already-scored note is NOT re-classified', async () => {
  const note = { id: 'aaa', content: 'x', tags: [] };
  const kv = fakeKV({ [KEY('aaa')]: { bitcoin: 0.9, nostr: 0, lfo: 0 } });
  let calls = 0;
  const classifyOne = async () => { calls++; throw new Error('model should not be called on a cache hit'); };
  const scores = await classifyNotes([note], { kv, classifyOne });
  assert.equal(calls, 0, 'model not called on cache hit');
  assert.deepEqual(scores.get('aaa'), { bitcoin: 0.9, nostr: 0, lfo: 0 });
});

test('cache miss: classifies exactly once and persists under relevance:v2:<id>', async () => {
  const note = { id: 'bbb', content: 'lightning stuff', tags: [] };
  const kv = fakeKV();
  let calls = 0;
  const classifyOne = async () => { calls++; return { bitcoin: 0.8, nostr: 0.1, lfo: 0 }; };
  const scores = await classifyNotes([note], { kv, classifyOne });
  assert.equal(calls, 1, 'model called exactly once');
  assert.deepEqual(scores.get('bbb'), { bitcoin: 0.8, nostr: 0.1, lfo: 0 });
  assert.ok(kv.sets.some(([k, v]) => k === KEY('bbb') && v.bitcoin === 0.8), 'persisted under versioned key');
});

test('mixed cache: only the uncached notes hit the model', async () => {
  const a = { id: 'a', content: '...', tags: [] };
  const b = { id: 'b', content: '...', tags: [] };
  const kv = fakeKV({ [KEY('a')]: { bitcoin: 0.5, nostr: 0, lfo: 0 } });
  let calls = 0;
  const classifyOne = async () => { calls++; return { bitcoin: 0.7, nostr: 0, lfo: 0 }; };
  const scores = await classifyNotes([a, b], { kv, classifyOne });
  assert.equal(calls, 1, 'only the uncached note is classified');
  assert.equal(scores.get('a').bitcoin, 0.5, 'cached value reused');
  assert.equal(scores.get('b').bitcoin, 0.7, 'fresh value computed');
});

test('fallback: when classifyOne throws, the note gets a pass-through score and is NOT cached', async () => {
  const note = { id: 'ccc', content: '...', tags: [] };
  const kv = fakeKV();
  const classifyOne = async () => { throw new Error('haiku down'); };
  const scores = await classifyNotes([note], { kv, classifyOne });
  const s = scores.get('ccc');
  assert.ok(s, 'a score object is returned even on failure');
  assert.ok(Math.max(s.bitcoin, s.nostr, s.lfo) >= 1 - 1e-9, 'pass-through sentinel clears any threshold (hashtag-only fallback)');
  assert.equal(kv.sets.length, 0, 'a failed classification is not persisted, so it retries next time');
});

test('classifies cache-misses with bounded concurrency (parallel, capped at 5) — ADR 0033 cold-start mitigation', async () => {
  const notes = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, content: 'x', tags: [] }));
  const kv = fakeKV();
  let inFlight = 0, peak = 0;
  const classifyOne = async () => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10)); // hold the slot so overlap is observable
    inFlight--;
    return { bitcoin: 0.9, nostr: 0, lfo: 0 };
  };
  const scores = await classifyNotes(notes, { kv, classifyOne });
  assert.equal(scores.size, 12, 'every note is scored');
  assert.ok(peak > 1, 'more than one classification runs at a time (not sequential)');
  assert.ok(peak <= 5, 'in-flight calls never exceed the concurrency cap of 5');
});
