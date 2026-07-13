// Story note-tagging #2 (ADR 0040, D1) — the provider ARMS the write UI: alongside
// candidates it returns `writeConfig` { taPubkey, tags: [...] } listing only the tags
// whose discovered tagging header matches the SDK coordinate convention. The
// conformance gate at arming time IS the story's "never mint" guard. RED until
// tagged.js implements writeConfig.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TA, TAG_AUTHOR, MEMBER_1, MEMBER_2, MEMBERS,
  TAG, TAGS, TAGGING_RELAY, headerCoord, mkHeader, mkAssertion, mkNote, mkTagElement, fakeRelay, deadRelay,
} = require('./fixtures/event-tagging.js');

let mod = {};
try { mod = require('../api/_lib/tagged.js'); } catch {}
const fetchTaggedCandidates = mod.fetchTaggedCandidates
  || (() => { throw new Error('api/_lib/tagged.js does not export fetchTaggedCandidates yet'); });

function deps(events, overrides = {}) {
  const relay = overrides.relay || fakeRelay(events);
  return {
    getTaPubkey: async () => TA,
    queryRelayStatus: relay.queryRelayStatus,
    memberSet: MEMBERS,
    tags: TAGS,
    taggingRelay: TAGGING_RELAY,
    ...overrides.args,
  };
}

test('writeConfig lists the runtime TA and every tag with a conforming discovered header (ADR 0040 D1)', async () => {
  const events = [
    mkHeader({ slug: 'lfo-community' }), mkHeader({ slug: 'bitcoin' }),
    mkTagElement(), mkTagElement({ slug: 'bitcoin', name: 'Bitcoin', description: 'Bitcoin content.' }),
  ];
  const out = await fetchTaggedCandidates(deps(events));
  assert.ok(out.writeConfig, 'writeConfig is returned alongside candidates');
  assert.equal(out.writeConfig.taPubkey, TA, 'the runtime TA the client will compose handles from');
  const slugs = out.writeConfig.tags.map((t) => t.slug).sort();
  assert.deepEqual(slugs, ['bitcoin', 'lfo-community'], 'only tags with discovered headers are armed');
  const lfo = out.writeConfig.tags.find((t) => t.slug === 'lfo-community');
  assert.equal(lfo.authorPubkey, TAG_AUTHOR);
  assert.equal(lfo.headerAuthorPubkey, TAG_AUTHOR, 'the discovered header author (builder input)');
  assert.equal(lfo.headerCoord, headerCoord(TAG_AUTHOR, 'lfo-community'), 'the exact discovered coordinate');
  assert.equal(lfo.name, 'LFO Community', 'live display name rides along for the modal');
  assert.ok(lfo.description.length > 0);
});

test('a tag with NO discovered header is not armed — apply for it is impossible, nothing can mint', async () => {
  const events = [mkHeader({ slug: 'nostr' })]; // only nostr has a header
  const out = await fetchTaggedCandidates(deps(events));
  assert.deepEqual(out.writeConfig.tags.map((t) => t.slug), ['nostr'],
    'headerless tags are absent from the write UI');
  assert.equal(out.relayOk, true, 'not a pipeline failure');
});

test('a NONCONFORMING header d-tag arms nothing for that tag, but its assertions still COUNT on the read side', async () => {
  // Write requires the SDK-derivable coordinate; read honors discovered reality (ADR 0040 asymmetry).
  const weird = mkHeader({ slug: 'bitcoin', dTag: 'tagging:btc-alias-tagging' });
  const weirdCoord = `39999:${TAG_AUTHOR}:tagging:btc-alias-tagging`;
  const events = [
    weird,
    mkAssertion({ asserter: MEMBER_1, targetId: 'nA', slug: 'bitcoin', header: weirdCoord }),
    mkNote({ id: 'nA' }),
  ];
  const out = await fetchTaggedCandidates(deps(events));
  assert.deepEqual(out.candidates.map((c) => c.event.id), ['nA'],
    'the read path still admits the note via the discovered header');
  assert.ok(!out.writeConfig.tags.some((t) => t.slug === 'bitcoin'),
    'the write UI is NOT armed for a header the SDK builder could not reproduce');
});

test('provider degradation (TA unresolvable / dead relay) yields NO writeConfig', async () => {
  const noTa = await fetchTaggedCandidates(deps([], { args: { getTaPubkey: async () => null } }));
  assert.equal(noTa.writeConfig, undefined, 'no TA → cannot compose handles → not armed');
  const dead = await fetchTaggedCandidates(deps([], { relay: deadRelay() }));
  assert.equal(dead.writeConfig, undefined, 'dead tagging relay → not armed');
});

test('taggedWith entries carry per-(tag,note) appliers: two members applying the same tag are both listed', async () => {
  const events = [
    mkHeader(),
    mkAssertion({ asserter: MEMBER_1, targetId: 'nB', polarity: 1 }),
    mkAssertion({ asserter: MEMBER_2, targetId: 'nB', polarity: 1 }),
    mkNote({ id: 'nB' }),
  ];
  const out = await fetchTaggedCandidates(deps(events, { args: { tags: [TAG] } }));
  const entry = out.candidates[0].taggedWith[0];
  assert.equal(entry.slug, 'lfo-community');
  assert.deepEqual([...entry.appliers].sort(), [MEMBER_1, MEMBER_2].sort(),
    'appliers are per (tag, note) — the applied-state marking source');
});
