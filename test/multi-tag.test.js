// Story 9 (ADR 0037) — multi-tag fan-out over the #8 pipeline: `fetchTaggedCandidates`
// with a FOUR-entry `tags` config. Covers per-tag channel assignment, the multi-tag
// union through the merge, per-tag gate independence, per-tag metadata fallback, and
// the batched wire contract (one headers REQ carrying every tag coord, one assertions
// REQ, one bodies REQ per relay). RED until tagged.js accepts the `tags` array.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TA, TAG_AUTHOR, MEMBER_1, MEMBER_2, NON_MEMBER, MEMBERS,
  TAG, BITCOIN_TAG, NOSTR_TAG, ASK_TAG, TAGS, TAGGING_RELAY,
  tagCoord, headerCoord, mkHeader, mkAssertion, mkNote, mkTagElement, fakeRelay,
} = require('./fixtures/event-tagging.js');

let mod = {};
try { mod = require('../api/_lib/tagged.js'); } catch {}
const fetchTaggedCandidates = mod.fetchTaggedCandidates
  || (() => { throw new Error('api/_lib/tagged.js does not export fetchTaggedCandidates yet'); });
let mergeMod = {};
try { mergeMod = require('../api/_lib/merge.js'); } catch {}
const mergeCandidatePools = mergeMod.mergeCandidatePools
  || (() => { throw new Error('api/_lib/merge.js does not export mergeCandidatePools yet'); });

const hdr = (slug) => mkHeader({ slug });
const asrt = (slug, asserter, targetId, polarity = 1) =>
  mkAssertion({ asserter, targetId, slug, header: headerCoord(TAG_AUTHOR, slug), polarity });

function deps(events, overrides = {}) {
  const relay = fakeRelay(events);
  return {
    relay,
    args: {
      getTaPubkey: async () => TA,
      queryRelayStatus: relay.queryRelayStatus,
      memberSet: MEMBERS,
      tags: TAGS, // all four: lfo-community, bitcoin, nostr, ask-lfo
      taggingRelay: TAGGING_RELAY,
      ...overrides,
    },
  };
}

test('each tag sources into its own channel: bitcoin→bitcoin, nostr→nostr, ask-lfo→ask-lfo (AC-1)', async () => {
  const events = [
    hdr('bitcoin'), hdr('nostr'), hdr('ask-lfo'),
    asrt('bitcoin', MEMBER_1, 'nb'), asrt('nostr', MEMBER_1, 'nn'), asrt('ask-lfo', MEMBER_2, 'na'),
    mkNote({ id: 'nb' }), mkNote({ id: 'nn' }), mkNote({ id: 'na' }),
  ];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.relayOk, true);
  const byId = (id) => out.candidates.find((c) => c.event.id === id);
  assert.deepEqual(byId('nb').channels, ['bitcoin'], 'bitcoin-tagged note carries the bitcoin channel');
  assert.deepEqual(byId('nn').channels, ['nostr'], 'nostr-tagged note carries the nostr channel');
  assert.deepEqual(byId('na').channels, ['ask-lfo'], 'ask-lfo-tagged note carries the new ask-lfo channel');
});

test('a note tagged bitcoin AND nostr merges to ONE entry with both channels, both pills, both provenance vias (AC-2)', async () => {
  const events = [
    hdr('bitcoin'), hdr('nostr'),
    mkTagElement({ slug: 'bitcoin', name: 'Bitcoin', description: 'Bitcoin content for LFO.' }),
    mkTagElement({ slug: 'nostr', name: 'Nostr', description: 'Nostr content for LFO.' }),
    asrt('bitcoin', MEMBER_1, 'nx'), asrt('nostr', MEMBER_2, 'nx'),
    mkNote({ id: 'nx' }),
  ];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  const merged = mergeCandidatePools([out.candidates], {});
  assert.equal(merged.length, 1, 'one note, despite two tags');
  assert.deepEqual([...merged[0].channels].sort(), ['bitcoin', 'nostr'], 'channels are the union');
  assert.deepEqual(merged[0].taggedWith.map((t) => t.name).sort(), ['Bitcoin', 'Nostr'],
    'one pill entry per tag, each with its own name');
  assert.deepEqual(merged[0].vias.map((v) => v.tag).sort(), ['bitcoin', 'nostr'],
    'provenance records both admitting tags');
});

test('a tag with no relay data contributes nothing and leaves the others unaffected (AC-5)', async () => {
  // Only lfo-community has data; bitcoin/nostr/ask-lfo are silent.
  const events = [hdr('lfo-community'), asrt('lfo-community', MEMBER_1, 'n1'), mkNote({ id: 'n1' })];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.relayOk, true, 'silent tags are not a failure');
  assert.deepEqual(out.candidates.map((c) => c.event.id), ['n1'], 'the active tag still sources');
  assert.deepEqual(out.candidates[0].channels, ['lfo']);
});

test('gates hold per tag: a non-member nostr assertion admits nothing (AC-6)', async () => {
  const events = [hdr('nostr'), asrt('nostr', NON_MEMBER, 'n2'), mkNote({ id: 'n2' })];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'the member-tagger gate applies per tag');
});

test('per-tag independence: a member dispute on bitcoin does not suppress the same note\'s nostr application (AC-6)', async () => {
  const events = [
    hdr('bitcoin'), hdr('nostr'),
    asrt('bitcoin', MEMBER_2, 'ny', -1),   // disputed under bitcoin
    asrt('nostr', MEMBER_1, 'ny', 1),      // applied under nostr
    mkNote({ id: 'ny' }),
  ];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  const merged = mergeCandidatePools([out.candidates], {});
  assert.equal(merged.length, 1, 'the note is admitted (nostr application stands)');
  assert.deepEqual([...merged[0].channels].sort(), ['nostr'],
    'bitcoin (0 applications) assigns no channel; nostr does');
});

test('per-tag metadata fallback: a missing bitcoin element degrades only bitcoin\'s pill to the slug (AC pills)', async () => {
  const events = [
    hdr('bitcoin'), hdr('nostr'),
    mkTagElement({ slug: 'nostr', name: 'Nostr', description: 'Nostr content for LFO.' }), // bitcoin element absent
    asrt('bitcoin', MEMBER_1, 'nb2'), asrt('nostr', MEMBER_1, 'nn2'),
    mkNote({ id: 'nb2' }), mkNote({ id: 'nn2' }),
  ];
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  const btc = out.candidates.find((c) => c.event.id === 'nb2');
  const nos = out.candidates.find((c) => c.event.id === 'nn2');
  assert.deepEqual(btc.taggedWith,
    [{ slug: 'bitcoin', name: 'bitcoin', description: '', appliers: [MEMBER_1] }], 'slug fallback, per tag');
  assert.deepEqual(nos.taggedWith,
    [{ slug: 'nostr', name: 'Nostr', description: 'Nostr content for LFO.', appliers: [MEMBER_1] }],
    'the healthy tag keeps its real metadata');
});

test('wire contract: one headers REQ carrying every tag coordinate, one elements REQ, one assertions REQ, one bodies REQ (ADR 0037)', async () => {
  const events = [
    hdr('bitcoin'), hdr('nostr'),
    asrt('bitcoin', MEMBER_1, 'nz'), asrt('nostr', MEMBER_2, 'nz'),
    mkNote({ id: 'nz' }),
  ];
  const d = deps(events);
  await fetchTaggedCandidates(d.args);
  const headerReqs = d.relay.calls.filter((c) => c.filter['#a']);
  const elementReqs = d.relay.calls.filter((c) => c.filter['#d']);
  const assertionReqs = d.relay.calls.filter((c) => c.filter['#z'] && !c.filter['#a']
    && c.filter['#z'].every((z) => z.includes(':tagging:')));
  const bodyReqs = d.relay.calls.filter((c) => c.filter.kinds && c.filter.kinds.includes(1));
  assert.equal(headerReqs.length, 1, 'ONE headers REQ for all tags');
  assert.deepEqual(new Set(headerReqs[0].filter['#a']),
    new Set(TAGS.map((t) => tagCoord(t.authorPubkey, t.slug))),
    'the headers REQ names every configured tag coordinate');
  assert.equal(elementReqs.length, 1, 'ONE tag-elements REQ for all slugs');
  assert.equal(assertionReqs.length, 1, 'ONE assertions REQ across all discovered headers');
  assert.equal(bodyReqs.length, 1, 'ONE bodies REQ (per relay; single relay configured here)');
});
