// Story note-tagging #2 (ADR 0040, D2) — the browser-shared builder module
// public/lib/event-tagging.js must be a faithful adaptation of the SDK: for identical
// inputs, its buildEventTaggingAssertion output must deep-equal the upstream CJS
// builder's (tapestry @ feat/tags, the same commit the read-side vendoring pins).
// This is the drift guard that "adapted-verbatim" hangs on. RED until the module exists.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TA, TAG_AUTHOR, MEMBER_1 } = require('./fixtures/event-tagging.js');

let browserLib = {};
try { browserLib = require('../public/lib/event-tagging.js'); } catch {}
const upstream = require('../tapestry/src/lib/event-tagging/builders.js');

const CASES = [
  { name: 'kind-1 note target (the story path)',
    args: { headerAuthorPubkey: TAG_AUTHOR, slug: 'lfo-community', target: { id: 'ab'.repeat(32) }, polarity: 1, asserterPubkey: MEMBER_1, taPubkeys: [TA] } },
  { name: 'note target with a relay hint',
    args: { headerAuthorPubkey: TAG_AUTHOR, slug: 'ask-lfo', target: { id: 'cd'.repeat(32), relays: ['wss://nos.lol'] }, polarity: 1, asserterPubkey: MEMBER_1, taPubkeys: [TA] } },
];

for (const c of CASES) {
  test(`buildEventTaggingAssertion parity with the upstream SDK — ${c.name}`, () => {
    assert.equal(typeof browserLib.buildEventTaggingAssertion, 'function',
      'public/lib/event-tagging.js exports buildEventTaggingAssertion (dual-environment, like membership.js)');
    assert.deepEqual(
      browserLib.buildEventTaggingAssertion(c.args),
      upstream.buildEventTaggingAssertion(c.args),
      'byte-for-byte identical unsigned event vs the SDK'
    );
  });
}

test('the browser builder validates like the SDK: bad polarity and malformed pubkeys throw', () => {
  assert.equal(typeof browserLib.buildEventTaggingAssertion, 'function');
  assert.throws(() => browserLib.buildEventTaggingAssertion(
    { headerAuthorPubkey: TAG_AUTHOR, slug: 'x', target: { id: 'ab'.repeat(32) }, polarity: 0, asserterPubkey: MEMBER_1, taPubkeys: [TA] }),
    /polarity/, 'neutral polarity is rejected loudly (fail before minting an orphan)');
  assert.throws(() => browserLib.buildEventTaggingAssertion(
    { headerAuthorPubkey: 'nothex', slug: 'x', target: { id: 'ab'.repeat(32) }, polarity: 1, asserterPubkey: MEMBER_1, taPubkeys: [TA] }),
    /headerAuthorPubkey/, 'malformed header author is rejected loudly');
});
