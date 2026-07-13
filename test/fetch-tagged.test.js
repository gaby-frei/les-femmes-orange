// Story 8 (ADR 0036) — Provider 2 pipeline: `fetchTaggedCandidates(deps)` in
// api/_lib/tagged.js. Covers the sourcing ACs (member gate on the TAGGER, polarity
// buckets, header discovery over pinning, single-tag scope) and the degradation ACs
// (dead relay, TA endpoint failure). All externals injected; the relay fake is
// filter-faithful so these tests exercise real filter composition. RED until
// api/_lib/tagged.js exists per ADR 0036.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TA, OTHER_TA, TAG_AUTHOR, MEMBER_1, MEMBER_2, NON_MEMBER, MEMBERS,
  TAG, TAGGING_RELAY, TAG_NAME, TAG_DESC,
  headerCoord, mkHeader, mkAssertion, mkNote, mkTagElement, fakeRelay, deadRelay, fakeRelaysByUrl,
} = require('./fixtures/event-tagging.js');

let mod = {};
try { mod = require('../api/_lib/tagged.js'); } catch {}
const fetchTaggedCandidates = mod.fetchTaggedCandidates
  || (() => { throw new Error('api/_lib/tagged.js does not export fetchTaggedCandidates yet (Story 8 unimplemented)'); });

// Story 9 (ADR 0037): the provider takes `tags` (an ARRAY of tag configs) instead of
// #8's single `tag`. These #8-behavior tests run against a one-entry array — the gates
// they pin are per-tag and must hold unchanged under the new signature.
function deps(events, overrides = {}) {
  const relay = overrides.relay || fakeRelay(events);
  return {
    relay, // exposed for call-inspection; not part of the dep contract
    args: {
      getTaPubkey: async () => TA,
      queryRelayStatus: relay.queryRelayStatus,
      memberSet: MEMBERS,
      tags: [TAG],
      taggingRelay: TAGGING_RELAY,
      ...overrides.args,
    },
  };
}

// Baseline store: one honored header, one member application on note n1.
function baseline() {
  const header = mkHeader();
  const note = mkNote({ id: 'n1' });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n1', polarity: 1 });
  return { header, note, assertion, events: [header, assertion, note] };
}

test('sources a note that a member tagged lfo-community (S1)', async () => {
  const { events } = baseline();
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.relayOk, true);
  assert.equal(out.candidates.length, 1, 'exactly one tagged note sourced');
  assert.equal(out.candidates[0].event.id, 'n1', 'the tagged note is the candidate');
});

test('keeps a tagged note whose AUTHOR is not a member — the gate is on the tagger (S2)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n2', author: NON_MEMBER });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n2', polarity: 1 });
  const { args } = deps([header, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.ok(out.candidates.some((c) => c.event.id === 'n2'),
    'a non-member-authored note tagged by a member is sourced');
});

test('drops an assertion applied by a non-member (S3)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n3' });
  const assertion = mkAssertion({ asserter: NON_MEMBER, targetId: 'n3', polarity: 1 });
  const { args } = deps([header, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'a non-member tagging admits nothing');
});

test('dispute polarity (≤ −0.5) does not admit the note (S4)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n4' });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n4', polarity: -1 });
  const { args } = deps([header, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'a disputed note is not sourced');
});

test('an absent polarity tag means apply (S4)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n5' });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n5' }); // no polarity tag
  const { args } = deps([header, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.ok(out.candidates.some((c) => c.event.id === 'n5'), 'polarity-less assertion counts as apply');
});

test('polarity in the open interval (−0.5, 0.5) is neutral — counted as neither (S4)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n6' });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n6', polarity: 0 });
  const { args } = deps([header, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'a neutral assertion admits nothing');
});

test('an assertion whose descriptor names an un-honored header is never sourced (S5)', async () => {
  // Header erected under a DIFFERENT authority's namespace: step 1 (filtered by the
  // honored TA) never discovers it, so its assertions are excluded at sourcing time.
  const rogueHeader = mkHeader({ author: MEMBER_2, ta: OTHER_TA });
  const note = mkNote({ id: 'n7' });
  const assertion = mkAssertion({
    asserter: MEMBER_1, targetId: 'n7',
    header: headerCoord(MEMBER_2, TAG.slug),
  });
  const { args } = deps([rogueHeader, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'an un-honored header admits nothing');
});

test('a different tag (stoicism) is never sourced — tag scope is exactly one tag (S6)', async () => {
  const { events } = baseline();
  const stoicHeader = mkHeader({ slug: 'stoicism' });
  const stoicNote = mkNote({ id: 'n8' });
  const stoicAssertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n8', slug: 'stoicism', header: headerCoord(TAG_AUTHOR, 'stoicism') });
  const d = deps([...events, stoicHeader, stoicAssertion, stoicNote]);
  const out = await fetchTaggedCandidates(d.args);
  assert.ok(!out.candidates.some((c) => c.event.id === 'n8'), 'a stoicism-tagged note is not sourced');
  assert.ok(out.candidates.some((c) => c.event.id === 'n1'), 'the lfo-community note still is');
});

test('unions assertions across ALL discovered headers — no pinned coordinate (S7)', async () => {
  // Second legitimate header for the same tag, authored by a different pubkey; the
  // member's assertion references the SECOND header. Discovery must pick it up.
  const header1 = mkHeader();
  const header2 = mkHeader({ author: MEMBER_2 });
  const note = mkNote({ id: 'n9' });
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n9', header: headerCoord(MEMBER_2, TAG.slug) });
  const { args } = deps([header1, header2, assertion, note]);
  const out = await fetchTaggedCandidates(args);
  assert.ok(out.candidates.some((c) => c.event.id === 'n9'),
    'an assertion referencing the second discovered header is admitted');
});

test('a target with one apply and one dispute (different members) is still admitted — ≥1 application rule', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n10' });
  const apply = mkAssertion({ asserter: MEMBER_1, targetId: 'n10', polarity: 1 });
  const dispute = mkAssertion({ asserter: MEMBER_2, targetId: 'n10', polarity: -1 });
  const { args } = deps([header, apply, dispute, note]);
  const out = await fetchTaggedCandidates(args);
  assert.ok(out.candidates.some((c) => c.event.id === 'n10'), 'kept: it has ≥ 1 member application');
});

test('candidates carry channel and provenance: channels [lfo], vias with provider/tag/applications', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n11' });
  const a1 = mkAssertion({ asserter: MEMBER_1, targetId: 'n11', polarity: 1 });
  const a2 = mkAssertion({ asserter: MEMBER_2, targetId: 'n11', polarity: 1 });
  const { args } = deps([header, a1, a2, note]);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates.length, 1, 'two applications on one note yield one candidate');
  const c = out.candidates[0];
  assert.deepEqual(c.channels, ['lfo'], 'candidate carries the pilot channel');
  assert.equal(c.vias.length, 1, 'one via per provider');
  assert.equal(c.vias[0].provider, 'event-tag');
  assert.equal(c.vias[0].tag, 'lfo-community');
  assert.equal(c.vias[0].applications, 2, 'applications = distinct member application count');
});

test('an assertion targeting an addressable event (a-tag target) is ignored — story scope is kind-1 notes', async () => {
  const header = mkHeader();
  const assertion = mkAssertion({ asserter: MEMBER_1, targetAddr: `30023:${MEMBER_2}:an-article`, polarity: 1 });
  const { args } = deps([header, assertion]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates, [], 'addressable targets are out of scope');
});

// ── Story 10 (ADR 0038): per-note applier identities ──

test('candidates carry taggers — distinct APPLIER pubkeys; a disputer is never listed (Story 10)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n16' });
  const a1 = mkAssertion({ asserter: MEMBER_1, targetId: 'n16', polarity: 1 });
  const d1 = mkAssertion({ asserter: MEMBER_2, targetId: 'n16', polarity: -1 });
  const { args } = deps([header, a1, d1, note]);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates.length, 1);
  assert.deepEqual(out.candidates[0].taggers, [MEMBER_1],
    'appliers only — the disputing member does not appear');
});

test('two appliers on one note → both pubkeys in taggers (Story 10)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n17' });
  const a1 = mkAssertion({ asserter: MEMBER_1, targetId: 'n17', polarity: 1 });
  const a2 = mkAssertion({ asserter: MEMBER_2, targetId: 'n17', polarity: 1 });
  const { args } = deps([header, a1, a2, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual([...out.candidates[0].taggers].sort(), [MEMBER_1, MEMBER_2].sort());
});

// ── Decision 3 revision (2026-07-11): note bodies from tagging relay ∪ noteRelays ──

test('a note body that lives ONLY on an external note relay is still sourced (D3 revision)', async () => {
  // Live-verified reality: the tagging relay holds the tagging events but NOT the
  // kind-1 bodies — those live on the feed relays (nos.lol / damus).
  const header = mkHeader();
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n14', polarity: 1 });
  const note = mkNote({ id: 'n14' });
  const relays = fakeRelaysByUrl({
    [TAGGING_RELAY]: [header, assertion],          // tagging events only — no bodies
    'wss://nos.example': [note],                   // the body lives here
    'wss://damus.example': [],
  });
  const out = await fetchTaggedCandidates({
    getTaPubkey: async () => TA,
    queryRelayStatus: relays.queryRelayStatus,
    memberSet: MEMBERS,
    tags: [TAG],
    taggingRelay: TAGGING_RELAY,
    noteRelays: ['wss://nos.example', 'wss://damus.example'],
  });
  assert.deepEqual(out.candidates.map((c) => c.event.id), ['n14'],
    'the body resolves via the external note relay');
  assert.equal(out.relayOk, true);
  const noteQueries = relays.calls.filter((c) => c.filter.kinds && c.filter.kinds.includes(1));
  assert.deepEqual(new Set(noteQueries.map((c) => c.url)),
    new Set([TAGGING_RELAY, 'wss://nos.example', 'wss://damus.example']),
    'bodies are requested from the tagging relay AND every configured note relay');
});

test('a dead external note relay does not fail the fetch when another relay resolves the body (D3 revision)', async () => {
  const header = mkHeader();
  const assertion = mkAssertion({ asserter: MEMBER_1, targetId: 'n15', polarity: 1 });
  const note = mkNote({ id: 'n15' });
  const relays = fakeRelaysByUrl({
    [TAGGING_RELAY]: [header, assertion],
    'wss://nos.example': [note],
    // 'wss://damus.example' absent → behaves dead (ok:false)
  });
  const out = await fetchTaggedCandidates({
    getTaPubkey: async () => TA,
    queryRelayStatus: relays.queryRelayStatus,
    memberSet: MEMBERS,
    tags: [TAG],
    taggingRelay: TAGGING_RELAY,
    noteRelays: ['wss://nos.example', 'wss://damus.example'],
  });
  assert.deepEqual(out.candidates.map((c) => c.event.id), ['n15'], 'any-relay-ok satisfies the fetch');
  assert.equal(out.relayOk, true, 'a partial note-relay outage is not a pipeline failure');
});

test('a tagged id whose note body resolves on NO relay is dropped silently (ADR 0036 D3)', async () => {
  const header = mkHeader();
  const note = mkNote({ id: 'n12' });
  const found = mkAssertion({ asserter: MEMBER_1, targetId: 'n12', polarity: 1 });
  const missing = mkAssertion({ asserter: MEMBER_2, targetId: 'n13', polarity: 1 }); // no kind-1 body in store
  const { args } = deps([header, found, missing, note]);
  const out = await fetchTaggedCandidates(args);
  assert.deepEqual(out.candidates.map((c) => c.event.id), ['n12'], 'only the resolvable body surfaces');
});

// ── Tag pill amendment (2026-07-11): display metadata from the tag-element ──

test('candidates carry taggedWith from the live tag-element (UI amendment)', async () => {
  const { events } = baseline();
  const { args } = deps([...events, mkTagElement()]);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates.length, 1);
  assert.deepEqual(out.candidates[0].taggedWith,
    [{ slug: 'lfo-community', name: TAG_NAME, description: TAG_DESC, appliers: [MEMBER_1] }],
    'entry carries slug + name/description from the element + this note\'s appliers (ADR 0040)');
});

test('tag-element missing → taggedWith falls back to the slug with empty description, sourcing unaffected', async () => {
  const { events } = baseline(); // no tag element in the store
  const { args } = deps(events);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates.length, 1, 'metadata failure never drops the note');
  assert.equal(out.relayOk, true, 'metadata is not pipeline-critical');
  assert.deepEqual(out.candidates[0].taggedWith,
    [{ slug: 'lfo-community', name: 'lfo-community', description: '', appliers: [MEMBER_1] }],
    'fallback is the slug as name, no description; appliers still carried');
});

test('tag-element with unparseable content → same slug fallback, no throw', async () => {
  const { events } = baseline();
  const broken = mkTagElement({ content: 'not json {' });
  const { args } = deps([...events, broken]);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates.length, 1);
  assert.deepEqual(out.candidates[0].taggedWith,
    [{ slug: 'lfo-community', name: 'lfo-community', description: '', appliers: [MEMBER_1] }]);
});

test('two tag-element versions → the latest created_at wins', async () => {
  const { events } = baseline();
  const older = mkTagElement({ name: 'Old Name', createdAt: 1_700_000_000 });
  const newer = mkTagElement({ createdAt: 1_752_000_000 });
  const { args } = deps([...events, older, newer]);
  const out = await fetchTaggedCandidates(args);
  assert.equal(out.candidates[0].taggedWith[0].name, TAG_NAME, 'the newest element supplies the metadata');
});

test('tagging relay down → zero candidates, relayOk false, and no throw (D1)', async () => {
  const relay = deadRelay();
  const { args } = deps([], { relay });
  const out = await fetchTaggedCandidates(args); // must resolve, never reject
  assert.deepEqual(out.candidates, [], 'dead relay contributes nothing');
  assert.equal(out.relayOk, false, 'outage is visible via relayOk');
});

test('TA pubkey unresolvable → degrades to zero candidates with NO relay query and NO hardcoded fallback (D2)', async () => {
  const { events } = baseline();
  const d = deps(events, { args: { getTaPubkey: async () => null } });
  const out = await fetchTaggedCandidates(d.args);
  assert.deepEqual(out.candidates, [], 'no TA → no candidates');
  assert.equal(out.relayOk, false, 'TA failure reads as a Provider-2 outage');
  assert.equal(d.relay.calls.length, 0, 'no relay query is attempted with a guessed/hardcoded TA');
});
