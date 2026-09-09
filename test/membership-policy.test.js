// trust-weighted-membership #1 (ADR 0048) — the shared closure in public/lib/membership.js.
// Pure-function contract: policy table, chip-integer bucketing, counting-vouch rules, the
// seed-only root, single point of change, memorylessness, and the return shape stories #2/#3
// build on. RED until the module exports the trust-weighted closure.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../public/lib/membership.js');
const need = (name) => mod[name] || (() => { throw new Error(`public/lib/membership.js does not export ${name} yet (story #1 unimplemented)`); });
const buildTrustWeightedMemberSets = need('buildTrustWeightedMemberSets');
const scoreInteger = need('scoreInteger');
const requiredVouches = need('requiredVouches');

const SEED    = 'e8'.repeat(32);
const CURATOR = 'b8'.repeat(32);
const A = 'aa'.repeat(32), B = 'bb'.repeat(32), C = 'cc'.repeat(32), D = 'dd'.repeat(32), X = '99'.repeat(32);

let seq = 0;
const vouch = (tagger, target) => ({
  kind: 39999, pubkey: tagger, created_at: ++seq, id: String(seq).padStart(64, '0'),
  tags: [['d', `profile-tag-lfo-${target.slice(0, 8)}-${tagger.slice(0, 8)}`], ['p', target], ['polarity', '1']],
});
const scores = (obj) => new Map(Object.entries(obj));
const run = (items, sc, opts = {}) => buildTrustWeightedMemberSets(items, SEED, { scores: scores(sc), ...opts });

// ── Policy table ─────────────────────────────────────────────────────────────
test('MEMBERSHIP_POLICY is the PO table: trusted 75→1, neutral 50→2, low 0→3, defined once', () => {
  const p = mod.MEMBERSHIP_POLICY;
  assert.ok(p && Array.isArray(p.buckets), 'MEMBERSHIP_POLICY.buckets exported');
  const byName = Object.fromEntries(p.buckets.map((b) => [b.name, b]));
  assert.deepEqual({ min: byName.trusted.min, vouches: byName.trusted.vouches }, { min: 75, vouches: 1 });
  assert.deepEqual({ min: byName.neutral.min, vouches: byName.neutral.vouches }, { min: 50, vouches: 2 });
  assert.deepEqual({ min: byName.low.min, vouches: byName.low.vouches }, { min: 0, vouches: 3 });
  assert.ok(Object.isFrozen(p), 'the policy constant is frozen — edits happen in source, in one place');
});

test('scoreInteger is the chip integer: round(rank×100); missing or non-numeric → 0', () => {
  assert.equal(scoreInteger(0.745), 75, '0.745 rounds up to the trusted boundary, exactly as the chip shows it');
  assert.equal(scoreInteger(0.744), 74);
  assert.equal(scoreInteger(0.495), 50);
  assert.equal(scoreInteger(0.494), 49);
  assert.equal(scoreInteger(1), 100);
  assert.equal(scoreInteger(0), 0);
  assert.equal(scoreInteger(undefined), 0, 'no score → 0');
  assert.equal(scoreInteger(NaN), 0);
  assert.equal(scoreInteger('0.9'), 0, 'a string is not a score');
});

test('requiredVouches buckets the chip integer on both sides of each boundary', () => {
  assert.equal(requiredVouches(100), 1);
  assert.equal(requiredVouches(75), 1);
  assert.equal(requiredVouches(74), 2);
  assert.equal(requiredVouches(50), 2);
  assert.equal(requiredVouches(49), 3);
  assert.equal(requiredVouches(0), 3);
});

// ── AC: bucketed requirement ─────────────────────────────────────────────────
test('one verified vouch admits a trusted pubkey, but not a neutral or low one', () => {
  const items = [vouch(SEED, A), vouch(SEED, B), vouch(SEED, C)];
  const { verifiedMap, pendingMap } = run(items, { [A]: 0.8, [B]: 0.6, [C]: 0.2 });
  assert.ok(verifiedMap.has(A), 'trusted (80) with 1 vouch → verified');
  assert.ok(!verifiedMap.has(B) && pendingMap.has(B), 'neutral (60) with 1 vouch → pending');
  assert.ok(!verifiedMap.has(C) && pendingMap.has(C), 'low (20) with 1 vouch → pending');
});

test('a neutral pubkey verifies on the second distinct verified voucher; a low one on the third', () => {
  const items = [vouch(SEED, A), vouch(SEED, B), vouch(A, B), vouch(SEED, C), vouch(A, C)];
  const sc = { [A]: 0.9, [B]: 0.6, [C]: 0.1 };
  let r = run(items, sc);
  assert.ok(r.verifiedMap.has(B), 'neutral with 2 counting vouches → verified');
  assert.ok(!r.verifiedMap.has(C), 'low with 2 counting vouches → still pending');
  r = run([...items, vouch(B, C)], sc);
  assert.ok(r.verifiedMap.has(C), 'low with 3 counting vouches (seed, A, B) → verified');
});

test('an unscored pubkey is treated as 0 → low trust → 3 vouches', () => {
  const items = [vouch(SEED, A), vouch(SEED, B), vouch(A, B)];
  const r = run(items, { [A]: 0.9 }); // B absent from the score map
  assert.ok(!r.verifiedMap.has(B), 'unscored B with 2 vouches is not verified');
  assert.equal(r.requirement.get(B).required, 3);
  assert.equal(r.requirement.get(B).score, 0);
});

// ── AC: boundary on the displayed integer ────────────────────────────────────
test('0.745 verifies with one vouch (chip 75); 0.744 does not (chip 74)', () => {
  const items = [vouch(SEED, A), vouch(SEED, B)];
  const r = run(items, { [A]: 0.745, [B]: 0.744 });
  assert.ok(r.verifiedMap.has(A), '0.745 → trusted');
  assert.ok(!r.verifiedMap.has(B), '0.744 → neutral, needs 2');
  const r2 = run([vouch(SEED, C), vouch(SEED, D), vouch(A, C), vouch(A, D), vouch(SEED, A)], { [A]: 0.9, [C]: 0.495, [D]: 0.494 });
  assert.ok(r2.verifiedMap.has(C), '0.495 → neutral (50), 2 vouches suffice');
  assert.ok(!r2.verifiedMap.has(D), '0.494 → low (49), 2 vouches do not');
});

// ── AC: counting vouches ─────────────────────────────────────────────────────
test('self-vouch never counts, but does place the pubkey in the pending set', () => {
  const r = run([vouch(A, A)], { [A]: 0.99 });
  assert.ok(!r.verifiedMap.has(A), 'a trusted pubkey cannot admit itself');
  assert.ok(r.pendingMap.has(A), 'self-applied → pending');
  assert.equal(r.requirement.get(A).counting, 0);
  assert.equal(r.requirement.get(A).remaining, 1);
});

test('self-vouch plus one verified vouch = one counting vouch', () => {
  const r = run([vouch(B, B), vouch(SEED, B)], { [B]: 0.6 });
  assert.equal(r.requirement.get(B).counting, 1);
  assert.equal(r.requirement.get(B).remaining, 1);
  assert.ok(!r.verifiedMap.has(B));
});

test('two vouches from the same verified member count once', () => {
  const dup = vouch(SEED, B); dup.id = 'f'.repeat(64); dup.created_at = 999;
  const r = run([vouch(SEED, B), dup], { [B]: 0.6 });
  assert.equal(r.requirement.get(B).counting, 1, 'distinct vouchers, not events');
  assert.ok(!r.verifiedMap.has(B));
});

test('a vouch from a pending (unverified) account counts zero and leaves the target pending', () => {
  const r = run([vouch(A, A), vouch(A, B)], { [A]: 0.9, [B]: 0.9 });
  assert.ok(!r.verifiedMap.has(B), 'B vouched only by pending A');
  assert.ok(r.pendingMap.has(B));
  assert.equal(r.requirement.get(B).counting, 0);
  assert.ok(r.vouchersByTarget.get(B).has(A), 'the non-counting voucher is still listed (story #2 dims it)');
});

// ── AC: roots ────────────────────────────────────────────────────────────────
test('the seed is verified with no vouches and no score', () => {
  const r = run([], {});
  assert.ok(r.verifiedMap.has(SEED));
  assert.equal(r.verifiedMap.get(SEED), null, 'seed → null tagger, as today');
});

test('the curator is governed: 96 with the seed vouch → verified; 60 with only the seed vouch → pending, and her chain with her', () => {
  const items = [vouch(SEED, CURATOR), vouch(CURATOR, A), vouch(CURATOR, B)];
  const ok = run(items, { [CURATOR]: 0.96, [A]: 0.9, [B]: 0.9 });
  assert.ok(ok.verifiedMap.has(CURATOR) && ok.verifiedMap.has(A) && ok.verifiedMap.has(B));
  const dip = run(items, { [CURATOR]: 0.60, [A]: 0.9, [B]: 0.9 });
  assert.ok(!dip.verifiedMap.has(CURATOR), 'curator at 60 needs 2, has 1 → pending');
  assert.ok(!dip.verifiedMap.has(A) && !dip.verifiedMap.has(B), 'everyone whose chain runs solely through her is pending too');
  assert.ok(dip.pendingMap.has(A) && dip.pendingMap.has(B));
});

// ── AC: single point of change ───────────────────────────────────────────────
test('passing a different policy changes every verdict with no other change', () => {
  const items = [vouch(SEED, A), vouch(SEED, B)];
  const sc = { [A]: 0.6, [B]: 0.2 };
  const strict = run(items, sc);
  assert.ok(!strict.verifiedMap.has(A) && !strict.verifiedMap.has(B));
  const lax = { buckets: [{ name: 'anyone', min: 0, vouches: 1 }] };
  const relaxed = run(items, sc, { policy: lax });
  assert.ok(relaxed.verifiedMap.has(A) && relaxed.verifiedMap.has(B), 'a one-bucket policy admits both on one vouch');
  const harsh = { buckets: [{ name: 'trusted', min: 75, vouches: 1 }, { name: 'rest', min: 0, vouches: 5 }] };
  assert.equal(run(items, sc, { policy: harsh }).requirement.get(B).required, 5);
});

// ── AC: memoryless ───────────────────────────────────────────────────────────
test('the verdict follows the score handed in — nothing carries over between calls', () => {
  const items = [vouch(SEED, A)];
  assert.ok(run(items, { [A]: 0.9 }).verifiedMap.has(A), 'first call: trusted → verified');
  assert.ok(!run(items, { [A]: 0.6 }).verifiedMap.has(A), 'same events, lower score → pending; the earlier verdict is not remembered');
  assert.ok(run(items, { [A]: 0.9 }).verifiedMap.has(A), 'and back');
});

test('scores are mandatory — omitting them throws rather than silently building a 3-vouch world', () => {
  assert.throws(() => buildTrustWeightedMemberSets([vouch(SEED, A)], SEED, {}), TypeError);
  assert.throws(() => buildTrustWeightedMemberSets([vouch(SEED, A)], SEED), TypeError);
});

// ── Return shape (stories #2 and #3 build on it) ─────────────────────────────
test('return shape: verifiedMap → first counting voucher, pendingMap → first voucher, vouchersByTarget, requirement', () => {
  const items = [vouch(SEED, A), vouch(C, B), vouch(SEED, B), vouch(A, B)];
  const r = run(items, { [A]: 0.9, [B]: 0.6, [C]: 0.9 }, { extraPubkeys: [X] });
  assert.equal(r.verifiedMap.get(A), SEED);
  assert.equal(r.verifiedMap.get(B), SEED, 'B: seed is the first COUNTING voucher (C was pending)');
  assert.ok(!r.pendingMap.has(C) && !r.verifiedMap.has(C), 'C vouched B but nobody vouched C → neither pending nor verified');
  assert.deepEqual([...r.vouchersByTarget.get(B)].sort(), [SEED, A, C].sort(), 'all distinct non-self vouchers');
  assert.deepEqual(r.requirement.get(B), { score: 60, bucket: 'neutral', required: 2, counting: 2, remaining: 0 });
  assert.deepEqual(r.requirement.get(A), { score: 90, bucket: 'trusted', required: 1, counting: 1, remaining: 0 });
  assert.deepEqual(r.requirement.get(X), { score: 0, bucket: 'low', required: 3, counting: 0, remaining: 3 }, 'an untagged extra pubkey gets a requirement row');
  assert.ok(!r.pendingMap.has(X) && !r.verifiedMap.has(X), 'extraPubkeys never enter the sets');
});

test('a plain object works as the score map too', () => {
  const r = buildTrustWeightedMemberSets([vouch(SEED, A)], SEED, { scores: { [A]: 0.9 } });
  assert.ok(r.verifiedMap.has(A));
});

// ── Legacy export stays for the feed until story #3 ──────────────────────────
test('buildMemberSets (legacy 1-vouch closure) is still exported and unchanged for api/feed.js', () => {
  const { verifiedMap, pendingMap } = mod.buildMemberSets([vouch(SEED, A), vouch(A, B), vouch(C, C)], SEED);
  assert.ok(verifiedMap.has(A) && verifiedMap.has(B));
  assert.ok(pendingMap.has(C));
});
