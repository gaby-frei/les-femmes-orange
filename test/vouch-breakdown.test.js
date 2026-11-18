// trust-weighted-membership #2 (ADR 0049) — voucherBreakdown + selfVouched in the shared
// closure module. Pure-function contract behind the member cards: who vouched, who counts,
// why the others don't, and the invariant that the card's number equals the non-dimmed list.
// RED until public/lib/membership.js exports voucherBreakdown and returns selfVouched.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../public/lib/membership.js');
const need = (name) => mod[name] || (() => { throw new Error(`public/lib/membership.js does not export ${name} yet (story #2 unimplemented)`); });
const buildTrustWeightedMemberSets = need('buildTrustWeightedMemberSets');
const voucherBreakdown = need('voucherBreakdown');

const SEED = 'e8'.repeat(32);
const ME = '11'.repeat(32), A = 'aa'.repeat(32), B = 'bb'.repeat(32), C = 'cc'.repeat(32), D = 'dd'.repeat(32), E = 'ee'.repeat(32);
const NOBODY = '99'.repeat(32);

let seq = 0;
const vouch = (tagger, target) => ({
  kind: 39999, pubkey: tagger, created_at: ++seq, id: String(seq).padStart(64, '0'),
  tags: [['d', `profile-tag-lfo-${target.slice(0, 8)}-${tagger.slice(0, 8)}`], ['p', target], ['polarity', '1']],
});

// The card fixture world (mirrors tests/vouch-counts-cards.spec.js):
//   ME  trusted, seed                 → verified, 1 counting
//   A   trusted, seed + ME            → verified, 2 counting
//   B   neutral, seed + A             → verified, 2 counting (needs 2)
//   C   trusted, self + D (unverified)→ pending, 0 of 1
//   D   low,     self                 → pending, 0 of 3
//   E   neutral, seed                 → pending, 1 of 2 (rolled back)
const ITEMS = [
  vouch(SEED, ME), vouch(SEED, A), vouch(ME, A), vouch(SEED, B), vouch(A, B),
  vouch(C, C), vouch(D, C), vouch(D, D), vouch(SEED, E),
];
const SCORES = new Map(Object.entries({ [ME]: 0.9, [A]: 0.9, [B]: 0.6, [C]: 0.9, [D]: 0.2, [E]: 0.6 }));
const world = () => buildTrustWeightedMemberSets(ITEMS, SEED, { scores: SCORES, extraPubkeys: [NOBODY] });
const pks = (list) => list.map((v) => v.pubkey);

// V1
test('the closure also returns selfVouched: exactly the pubkeys that vouched for themselves', () => {
  const sets = world();
  assert.ok(sets.selfVouched instanceof Set, 'selfVouched is returned as a Set');
  assert.deepEqual([...sets.selfVouched].sort(), [C, D].sort());
  assert.ok(!sets.vouchersByTarget.get(C).has(C), 'vouchersByTarget still excludes the self-vouch (story #1 contract unchanged)');
});

// V2
test('a verified member: every voucher counts, the number is the requirement row\'s counting, and the requirement is reported', () => {
  const sets = world();
  const a = voucherBreakdown(sets, A);
  assert.equal(a.counting, 2);
  assert.equal(a.required, 1, 'trusted → 1');
  assert.deepEqual(pks(a.vouchers).sort(), [SEED, ME].sort(), 'every distinct voucher is listed');
  assert.ok(a.vouchers.every((v) => v.counting === true && v.reason === null));

  const b = voucherBreakdown(sets, B);
  assert.deepEqual({ counting: b.counting, required: b.required }, { counting: 2, required: 2 }, 'neutral member with two counting vouches');
});

// V3
test('a pending pubkey: counting first, then unverified vouchers, then the self-vouch — each non-counting entry says why', () => {
  const sets = world();
  const c = voucherBreakdown(sets, C);
  assert.deepEqual({ counting: c.counting, required: c.required }, { counting: 0, required: 1 });
  assert.deepEqual(c.vouchers, [
    { pubkey: D, counting: false, reason: 'unverified' },
    { pubkey: C, counting: false, reason: 'self' },
  ]);

  // mixed: a counting voucher must come before the non-counting ones regardless of event order
  const items = [vouch(D, E), vouch(E, E), vouch(SEED, E)];
  const s2 = buildTrustWeightedMemberSets(items, SEED, { scores: new Map([[E, 0.6]]) });
  const e = voucherBreakdown(s2, E);
  assert.deepEqual(e.vouchers.map((v) => [v.pubkey, v.counting, v.reason]), [
    [SEED, true, null], [D, false, 'unverified'], [E, false, 'self'],
  ], 'counting → unverified → self, even though the seed vouched last');
  assert.deepEqual({ counting: e.counting, required: e.required }, { counting: 1, required: 2 });
});

// V4
test('a self-only applicant lists just themselves, dimmed as a self-vouch', () => {
  const d = voucherBreakdown(world(), D);
  assert.deepEqual({ counting: d.counting, required: d.required }, { counting: 0, required: 3 });
  assert.deepEqual(d.vouchers, [{ pubkey: D, counting: false, reason: 'self' }]);
});

// V5
test('a voucher who vouched twice (replaceable re-publish) is listed once', () => {
  const items = [vouch(SEED, ME), vouch(SEED, A), vouch(ME, A), vouch(ME, A), vouch(A, A), vouch(A, A)];
  const sets = buildTrustWeightedMemberSets(items, SEED, { scores: new Map([[ME, 0.9], [A, 0.9]]) });
  const a = voucherBreakdown(sets, A);
  assert.deepEqual(pks(a.vouchers).filter((p) => p === ME), [ME], 'ME once');
  assert.deepEqual(pks(a.vouchers).filter((p) => p === A), [A], 'self-vouch once');
  assert.equal(a.vouchers.length, 3);
});

// V6 — the AC "Count and list agree" + "Follows the live verdict", over every tagged pubkey
test('for every tagged pubkey: counting entries == the card number; verified ⇒ N ≥ M, pending ⇒ N < M', () => {
  const sets = world();
  const tagged = new Set([...sets.verifiedMap.keys(), ...sets.pendingMap.keys()]);
  tagged.delete(SEED);
  assert.ok(tagged.size >= 6, 'fixture covers the six cards');
  for (const pk of tagged) {
    const bd = voucherBreakdown(sets, pk);
    assert.equal(bd.vouchers.filter((v) => v.counting).length, bd.counting, `${pk.slice(0, 4)}: list agrees with the number`);
    assert.equal(bd.counting, sets.requirement.get(pk).counting, `${pk.slice(0, 4)}: number is story #1's counting`);
    if (sets.verifiedMap.has(pk)) assert.ok(bd.counting >= bd.required, `${pk.slice(0, 4)} verified with ${bd.counting} of ${bd.required}`);
    else assert.ok(bd.counting < bd.required, `${pk.slice(0, 4)} pending with ${bd.counting} of ${bd.required}`);
  }
});

// V7
test('the seed\'s vouch for the curator is listed and counted like any other', () => {
  const CUR = 'b8'.repeat(32);
  const items = [vouch(SEED, CUR), vouch(CUR, ME), vouch(ME, CUR)];
  const sets = buildTrustWeightedMemberSets(items, SEED, { scores: new Map([[CUR, 0.96], [ME, 0.9]]) });
  const cur = voucherBreakdown(sets, CUR);
  assert.equal(cur.counting, 2, 'seed + ME');
  assert.ok(cur.vouchers.some((v) => v.pubkey === SEED && v.counting), 'the seed appears as a counting voucher');
});

// V8
test('a pubkey nobody vouched for has an empty breakdown and no requirement', () => {
  assert.deepEqual(voucherBreakdown(world(), '77'.repeat(32)), { counting: 0, required: null, vouchers: [] });
});

// V9
test('voucherBreakdown is pure: calling it does not change the sets it reads', () => {
  const sets = world();
  const before = JSON.stringify([[...sets.verifiedMap], [...sets.pendingMap], [...sets.selfVouched]]);
  for (const pk of [ME, A, B, C, D, E]) voucherBreakdown(sets, pk);
  assert.equal(JSON.stringify([[...sets.verifiedMap], [...sets.pendingMap], [...sets.selfVouched]]), before);
});
