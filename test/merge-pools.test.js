// Story 8 (ADR 0036) — the generic merge seam: `mergeCandidatePools(pools, { displayLimit })`
// in api/_lib/merge.js. Pure: flatten N pools of { event, channels, vias } → dedupe by
// event id (channels unioned, vias concatenated) → newest-first → cap. Provider-agnostic:
// adding/removing a pool never changes this logic (seam AC). RED until merge.js exists.
const { test } = require('node:test');
const assert = require('node:assert/strict');

let mod = {};
try { mod = require('../api/_lib/merge.js'); } catch {}
const mergeCandidatePools = mod.mergeCandidatePools
  || (() => { throw new Error('api/_lib/merge.js does not export mergeCandidatePools yet (Story 8 unimplemented)'); });

const cand = (id, createdAt, channels = [], vias = []) => ({
  event: { id, pubkey: 'aa'.repeat(32), created_at: createdAt, content: 'c', tags: [] },
  channels, vias,
});

test('merges any number of pools — 1, 2, or 3 — with the same logic (seam AC)', () => {
  const a = cand('a', 300), b = cand('b', 200), c = cand('c', 100);
  assert.deepEqual(mergeCandidatePools([[a]], {}).map((x) => x.event.id), ['a']);
  assert.deepEqual(mergeCandidatePools([[a], [b]], {}).map((x) => x.event.id), ['a', 'b']);
  assert.deepEqual(mergeCandidatePools([[a], [b], [c]], {}).map((x) => x.event.id), ['a', 'b', 'c']);
});

test('dedupes by event id: channels unioned, vias concatenated (R3)', () => {
  const fromHashtag = cand('x', 500, ['bitcoin'], [{ provider: 'hashtag' }]);
  const fromTag = cand('x', 500, ['lfo'], [{ provider: 'event-tag', tag: 'lfo-community', applications: 1 }]);
  const out = mergeCandidatePools([[fromHashtag], [fromTag]], {});
  assert.equal(out.length, 1, 'the note appears once');
  assert.deepEqual([...out[0].channels].sort(), ['bitcoin', 'lfo'], 'channels are the union');
  assert.deepEqual(out[0].vias.map((v) => v.provider), ['hashtag', 'event-tag'], 'provenance from both providers is kept');
});

test('orders the merged pool strictly newest-first (M1)', () => {
  const out = mergeCandidatePools([[cand('old', 100), cand('new', 300)], [cand('mid', 200)]], {});
  assert.deepEqual(out.map((x) => x.event.id), ['new', 'mid', 'old']);
});

test('equal created_at orders deterministically regardless of pool order', () => {
  const p = cand('p', 200), q = cand('q', 200);
  const one = mergeCandidatePools([[p], [q]], {}).map((x) => x.event.id);
  const two = mergeCandidatePools([[q], [p]], {}).map((x) => x.event.id);
  assert.deepEqual(one, two, 'tie-break does not depend on input order');
});

test('caps at displayLimit; an older Provider-2 note does not displace a newer Provider-1 note (M2)', () => {
  const p1 = [cand('p1-new', 400, ['bitcoin']), cand('p1-mid', 250, ['nostr'])];
  const p2 = [cand('p2-new', 300, ['lfo']), cand('p2-old', 100, ['lfo'])];
  const out = mergeCandidatePools([p1, p2], { displayLimit: 3 });
  assert.deepEqual(out.map((x) => x.event.id), ['p1-new', 'p2-new', 'p1-mid'],
    'recency alone orders the pool; the older tagged note falls outside the cap');
});

test('empty pools merge to an empty list', () => {
  assert.deepEqual(mergeCandidatePools([[], []], { displayLimit: 100 }), []);
});

test('dedupe unions taggers by pubkey — cross-tag appliers combine on one note (Story 10)', () => {
  const alice = '11'.repeat(32), bob = '22'.repeat(32);
  const viaBitcoin = { ...cand('x', 500, ['bitcoin']), taggers: [alice] };
  const viaNostr = { ...cand('x', 500, ['nostr']), taggers: [bob, alice] };
  const out = mergeCandidatePools([[viaBitcoin], [viaNostr]], {});
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].taggers].sort(), [alice, bob].sort(),
    'union by pubkey, deduped — alice counted once despite applying two tags');
});

test('dedupe unions taggedWith by name — a both-provider note keeps its pill metadata (UI amendment)', () => {
  const fromHashtag = cand('x', 500, ['bitcoin'], [{ provider: 'hashtag' }]); // no taggedWith
  const fromTag = {
    ...cand('x', 500, ['lfo'], [{ provider: 'event-tag', tag: 'lfo-community', applications: 1 }]),
    taggedWith: [{ name: 'LFO Community', description: 'the community tag' }],
  };
  const out = mergeCandidatePools([[fromHashtag], [fromTag]], {});
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].taggedWith, [{ name: 'LFO Community', description: 'the community tag' }],
    'taggedWith survives the dedupe regardless of which pool the note was seen in first');
  const swapped = mergeCandidatePools([[fromTag], [fromHashtag]], {});
  assert.deepEqual(swapped[0].taggedWith, out[0].taggedWith, 'order-insensitive');
});
