// Story 8 (ADR 0036) — feed-level integration: `buildFeedPayload(deps)` gains the
// injected Provider-2 dep `fetchTaggedCandidates` and merges its pool with Provider 1's.
// Covers the feed-facing ACs: classifier bypass, channel assignment, cross-provider
// dedupe with channel union, merged ordering/cap, unchanged payload contract,
// memberCount semantics, and Provider-2 degradation never failing the request.
// RED until api/feed.js implements ADR 0036's merge orchestration.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFeedPayload } = require('../api/feed.js');
const { MEMBER_1, MEMBER_2, NON_MEMBER } = require('./fixtures/event-tagging.js');

// Provider-1 candidates: members posting hashtagged notes.
const P1_A = { id: 'p1a', pubkey: MEMBER_1, created_at: 400, content: 'bitcoin talk #bitcoin', tags: [['t', 'bitcoin']] };
const P1_B = { id: 'p1b', pubkey: MEMBER_1, created_at: 250, content: 'nostr talk #nostr', tags: [['t', 'nostr']] };
const P1_NOTES = [P1_A, P1_B];
const P1_SCORES = new Map([
  ['p1a', { bitcoin: 0.9, nostr: 0, lfo: 0 }],
  ['p1b', { bitcoin: 0, nostr: 0.9, lfo: 0 }],
]);

// Provider-2 candidates: a member-tagged garden note by a NON-member (off-topic on
// purpose — the tag is the relevance judgment) and an older tagged note by a member.
const TAGGED_GARDEN = { id: 'p2a', pubkey: NON_MEMBER, created_at: 300, content: 'my garden this morning', tags: [] };
const TAGGED_OLD = { id: 'p2b', pubkey: MEMBER_2, created_at: 100, content: 'from the archive', tags: [] };
const TAGGED_WITH = [{ name: 'LFO Community', description: 'This tag denotes content relevant to the Les Femmes Orange community itself.' }];
const p2cand = (event, applications = 1) => ({
  event, channels: ['lfo'],
  vias: [{ provider: 'event-tag', tag: 'lfo-community', applications }],
  taggedWith: TAGGED_WITH,
});
const P2_POOL = [p2cand(TAGGED_GARDEN), p2cand(TAGGED_OLD)];

function deps(overrides = {}) {
  return {
    computeMembers: async () => [MEMBER_1, MEMBER_2],
    fetchCandidates: async () => P1_NOTES,
    classifyNotes: async () => P1_SCORES,
    fetchMetadata: async () => new Map(),
    fetchTaggedCandidates: async () => ({ candidates: P2_POOL, relayOk: true }),
    threshold: 0.3,
    candidateLimit: 500,
    displayLimit: 100,
    ...overrides,
  };
}

test('a member-tagged note appears in the feed alongside hashtag notes (S1, feed level)', async () => {
  const out = await buildFeedPayload(deps());
  assert.ok(out.notes.some((n) => n.id === 'p2a'), 'the tagged note is in the feed');
  assert.ok(out.notes.some((n) => n.id === 'p1a'), 'hashtag notes are still there');
});

test('the relevance classifier never sees nor excludes a Provider-2 note (R1)', async () => {
  const classifiedIds = [];
  const out = await buildFeedPayload(deps({
    classifyNotes: async (notes) => { classifiedIds.push(...notes.map((n) => n.id)); return P1_SCORES; },
  }));
  // No score exists for p2a/p2b — an unjudged P1 note would be dropped; a P2 note must not be.
  assert.ok(out.notes.some((n) => n.id === 'p2a'), 'off-topic tagged note is not dropped');
  assert.ok(!classifiedIds.includes('p2a') && !classifiedIds.includes('p2b'),
    'Provider-2 notes are never sent to the classifier');
});

test('a Provider-2 note carries the lfo channel (R2)', async () => {
  const out = await buildFeedPayload(deps());
  const n = out.notes.find((x) => x.id === 'p2a');
  assert.ok(n, 'tagged note present');
  assert.ok(n.channels.includes('lfo'), 'its channels contain lfo');
});

test('a note sourced by BOTH providers appears once with unioned channels (R3)', async () => {
  const both = p2cand(P1_A); // the bitcoin-scored P1 note is also member-tagged
  const out = await buildFeedPayload(deps({
    fetchTaggedCandidates: async () => ({ candidates: [both], relayOk: true }),
  }));
  const hits = out.notes.filter((n) => n.id === 'p1a');
  assert.equal(hits.length, 1, 'deduped by event id');
  assert.ok(hits[0].channels.includes('bitcoin'), 'keeps Provider 1 score-derived channel');
  assert.ok(hits[0].channels.includes('lfo'), 'gains Provider 2 lfo channel');
});

test('merged pool is deduped, strictly newest-first, and capped; an older tagged note does not displace a newer one (M1+M2)', async () => {
  const out = await buildFeedPayload(deps({ displayLimit: 3 }));
  assert.deepEqual(out.notes.map((n) => n.id), ['p1a', 'p2a', 'p1b'],
    'recency interleaves providers; the oldest tagged note falls outside the cap');
});

test('the payload contract is unchanged: memberCount, notes, memberNames, channelsAvailable (X2)', async () => {
  const out = await buildFeedPayload(deps());
  for (const k of ['memberCount', 'notes', 'memberNames', 'channelsAvailable']) {
    assert.ok(k in out, 'payload has ' + k);
  }
  const n = out.notes.find((x) => x.id === 'p2a');
  for (const k of ['id', 'pubkey', 'created_at', 'content', 'media', 'channels', 'author']) {
    assert.ok(k in n, 'Provider-2 note has ' + k);
  }
});

test('a non-member Provider-2 author is NOT added to memberNames', async () => {
  const meta = new Map([
    [MEMBER_1, { display_name: 'Member One' }],
    [NON_MEMBER, { display_name: 'Passer By' }],
  ]);
  const out = await buildFeedPayload(deps({ fetchMetadata: async () => meta }));
  assert.equal(out.memberNames[MEMBER_1], 'Member One', 'members keep their names');
  assert.ok(!(NON_MEMBER in out.memberNames), 'memberNames stays members-only');
});

test('memberCount counts the non-member author of a displayed tagged note (X3, deliberate per story)', async () => {
  const out = await buildFeedPayload(deps());
  // Displayed authors: MEMBER_1 (p1a, p1b), NON_MEMBER (p2a), MEMBER_2 (p2b) → 3 distinct.
  assert.equal(out.memberCount, 3, 'distinct authors of displayed notes, unfiltered');
});

test('Provider 2 degrading to zero notes leaves the Provider-1 feed intact (D1)', async () => {
  const out = await buildFeedPayload(deps({
    fetchTaggedCandidates: async () => ({ candidates: [], relayOk: false }),
  }));
  assert.deepEqual(out.notes.map((n) => n.id), ['p1a', 'p1b'], 'the status quo feed');
});

test('a THROWING fetchTaggedCandidates dep never fails the request (D1, defense in depth)', async () => {
  const out = await buildFeedPayload(deps({
    fetchTaggedCandidates: async () => { throw new Error('tagging pipeline exploded'); },
  }));
  assert.deepEqual(out.notes.map((n) => n.id), ['p1a', 'p1b'], 'Provider 2 absence is the status quo');
});

test('omitting the fetchTaggedCandidates dep preserves existing behavior (back-compat for stories 1–7)', async () => {
  const d = deps();
  delete d.fetchTaggedCandidates;
  const out = await buildFeedPayload(d);
  assert.deepEqual(out.notes.map((n) => n.id), ['p1a', 'p1b']);
});

test('a Provider-2 note carries taggedWith in the payload; a Provider-1-only note carries none (UI amendment)', async () => {
  const out = await buildFeedPayload(deps());
  const tagged = out.notes.find((n) => n.id === 'p2a');
  const plain = out.notes.find((n) => n.id === 'p1a');
  assert.deepEqual(tagged.taggedWith, TAGGED_WITH, 'pill metadata reaches the payload note');
  assert.ok(!plain.taggedWith || plain.taggedWith.length === 0,
    'a hashtag-only note carries no taggedWith (absent or empty)');
});

// ── Story 9 (ADR 0037): the ask-lfo channel is exclusively Provider-2-sourced ──

test('a Provider-1 note NEVER carries the ask-lfo channel — even on pass-through scores (Story 9 AC-4)', async () => {
  const out = await buildFeedPayload(deps({
    fetchTaggedCandidates: async () => ({ candidates: [], relayOk: true }),
    classifyNotes: async (notes) => new Map(notes.map((n) => [n.id, { bitcoin: 1, nostr: 1, lfo: 1 }])),
  }));
  for (const n of out.notes) {
    assert.ok(!n.channels.includes('ask-lfo'),
      'the classifier topic set must not grow ask-lfo; only a member tag assigns it');
  }
});

test('an ask-lfo tagged note also sourced by Provider 1 appears once with unioned channels (Story 9 AC-3)', async () => {
  const askCand = {
    event: P1_A, channels: ['ask-lfo'],
    vias: [{ provider: 'event-tag', tag: 'ask-lfo', applications: 1 }],
    taggedWith: [{ name: 'Ask LFO', description: 'Questions for the LFO community.' }],
  };
  const out = await buildFeedPayload(deps({
    fetchTaggedCandidates: async () => ({ candidates: [askCand], relayOk: true }),
  }));
  const hits = out.notes.filter((n) => n.id === 'p1a');
  assert.equal(hits.length, 1, 'deduped across providers');
  assert.ok(hits[0].channels.includes('bitcoin'), 'keeps the score-derived channel');
  assert.ok(hits[0].channels.includes('ask-lfo'), 'gains the tag-derived ask-lfo channel');
});

test('channelsAvailable stays a Provider-1-only classifier signal (ADR 0036 / 0034)', async () => {
  // Every P1 score is the {1,1,1} pass-through sentinel → classifier fell back →
  // channelsAvailable must be false EVEN THOUGH Provider-2 notes carry a real lfo channel.
  const out = await buildFeedPayload(deps({
    classifyNotes: async (notes) => new Map(notes.map((n) => [n.id, { bitcoin: 1, nostr: 1, lfo: 1 }])),
  }));
  assert.ok(out.notes.some((n) => n.id === 'p2a'), 'tagged notes still present');
  assert.equal(out.channelsAvailable, false, 'Provider 2 does not mask classifier degradation');
});
