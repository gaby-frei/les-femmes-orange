/* eslint-disable */
// Shared vouch-graph membership closure. UMD so the SAME code runs in the browser (gated
// members view) and in Node (the /api/feed serverless function) with no build step —
// avoiding a duplicated closure across client and server.
//
// Two closures live here:
//   buildTrustWeightedMemberSets — the policy in force (trust-weighted-membership #1,
//     ADR 0048): a pubkey needs N distinct verified vouchers, N set by its house-POV
//     trust standing per MEMBERSHIP_POLICY. Self-vouches never count.
//   buildMemberSets — LEGACY 1-vouch closure (ADR 0033). Feed-only until story #3 moves
//     api/feed.js onto the trust-weighted closure and deletes this.
;(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (require)
  if (typeof window !== 'undefined') {                                       // browser globals
    window.buildMemberSets = api.buildMemberSets;
    window.buildTrustWeightedMemberSets = api.buildTrustWeightedMemberSets;
    window.MEMBERSHIP_POLICY = api.MEMBERSHIP_POLICY;
    window.scoreInteger = api.scoreInteger;
    window.requiredVouches = api.requiredVouches;
    window.voucherBreakdown = api.voucherBreakdown;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── THE POLICY (single point of change) ─────────────────────────────────
  // Buckets are matched on the trust-chip integer (0–100, house point of view), highest
  // `min` first. Edit the numbers here and every verdict in the Hub follows — sign-in,
  // the Members grids, and (story #3) the feed. PO table, 2026-09-04.
  var MEMBERSHIP_POLICY = Object.freeze({
    buckets: Object.freeze([
      Object.freeze({ name: 'trusted', min: 75, vouches: 1 }),
      Object.freeze({ name: 'neutral', min: 50, vouches: 2 }),
      Object.freeze({ name: 'low',     min: 0,  vouches: 3 }),
    ]),
  });

  // The provider's 0–1 rank → the integer the trust chip displays. Anything that is not
  // a finite number (missing row, NaN, a string) is "unscored" and reads as 0.
  function scoreInteger(rank) {
    return (typeof rank === 'number' && Number.isFinite(rank)) ? Math.round(rank * 100) : 0;
  }

  function bucketFor(scoreInt, policy) {
    var buckets = (policy && policy.buckets) || MEMBERSHIP_POLICY.buckets;
    var sorted = buckets.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < sorted.length; i++) if (scoreInt >= sorted[i].min) return sorted[i];
    return sorted[sorted.length - 1];
  }

  function requiredVouches(scoreInt, policy) {
    return bucketFor(scoreInt, policy).vouches;
  }

  function pTagOf(ev) {
    var t = ev && ev.tags ? ev.tags.find(function (t) { return t[0] === 'p'; }) : null;
    return t ? t[1] : undefined;
  }

  function lookupScore(scores, pk) {
    if (!scores) return undefined;
    if (typeof scores.get === 'function') return scores.get(pk);
    return Object.prototype.hasOwnProperty.call(scores, pk) ? scores[pk] : undefined;
  }

  // Trust-weighted closure (ADR 0048).
  //   tagItems   — kind-9999/39999 LFO vouch events.
  //   seedPubkey — the ONLY root: verified by definition, exempt from the policy.
  //   opts.scores       — Map or object: pubkey → provider rank (0–1). REQUIRED.
  //   opts.policy       — defaults to MEMBERSHIP_POLICY.
  //   opts.extraPubkeys — pubkeys to include in `requirement` even when untagged
  //                       (e.g. the signing-in user), never added to the sets.
  // Returns { verifiedMap, pendingMap, vouchersByTarget, requirement }:
  //   verifiedMap:      pubkey → first COUNTING voucher (seed → null)   — today's shape
  //   pendingMap:       pubkey → first voucher of any kind              — today's shape
  //   vouchersByTarget: pubkey → Set of distinct non-self vouchers (counting or not)
  //   requirement:      pubkey → { score, bucket, required, counting, remaining }
  function buildTrustWeightedMemberSets(tagItems, seedPubkey, opts) {
    if (!opts || opts.scores == null) {
      throw new TypeError('buildTrustWeightedMemberSets: opts.scores is required (a Map/object of pubkey → rank)');
    }
    var scores = opts.scores;
    var policy = opts.policy || MEMBERSHIP_POLICY;
    var extra = opts.extraPubkeys || [];

    // Distinct non-self vouchers per target, in first-seen order (for "first voucher").
    var vouchersByTarget = new Map();
    var firstVoucher = new Map();
    var selfVouched = new Set();   // story #2 (ADR 0049): listed on cards, never counted
    for (var i = 0; i < tagItems.length; i++) {
      var ev = tagItems[i];
      var target = pTagOf(ev);
      if (!target || !ev.pubkey) continue;
      if (!firstVoucher.has(target)) firstVoucher.set(target, ev.pubkey);   // any voucher, self included
      if (ev.pubkey === target) { selfVouched.add(target); continue; }       // self-vouch never counts
      if (!vouchersByTarget.has(target)) vouchersByTarget.set(target, new Set());
      vouchersByTarget.get(target).add(ev.pubkey);
    }

    var required = function (pk) { return requiredVouches(scoreInteger(lookupScore(scores, pk)), policy); };

    var verifiedMap = new Map();
    verifiedMap.set(seedPubkey, null);
    var changed = true;
    while (changed) {
      changed = false;
      vouchersByTarget.forEach(function (vs, target) {
        if (verifiedMap.has(target)) return;
        var counting = 0, first = null;
        vs.forEach(function (v) { if (verifiedMap.has(v)) { counting++; if (first === null) first = v; } });
        if (counting >= required(target)) { verifiedMap.set(target, first); changed = true; }
      });
    }

    var pendingMap = new Map();
    firstVoucher.forEach(function (voucher, target) {
      if (!verifiedMap.has(target)) pendingMap.set(target, voucher);
    });

    var requirement = new Map();
    var describe = function (pk) {
      if (requirement.has(pk)) return;
      var score = scoreInteger(lookupScore(scores, pk));
      var bucket = bucketFor(score, policy);
      var vs = vouchersByTarget.get(pk);
      var counting = 0;
      if (vs) vs.forEach(function (v) { if (verifiedMap.has(v)) counting++; });
      requirement.set(pk, {
        score: score, bucket: bucket.name, required: bucket.vouches,
        counting: counting, remaining: Math.max(0, bucket.vouches - counting),
      });
    };
    firstVoucher.forEach(function (_, target) { describe(target); });
    extra.forEach(function (pk) { if (pk && pk !== seedPubkey) describe(pk); });

    return {
      verifiedMap: verifiedMap, pendingMap: pendingMap, vouchersByTarget: vouchersByTarget,
      requirement: requirement, selfVouched: selfVouched,
    };
  }

  // Who vouched for `pubkey`, who counts, and why the others don't (ADR 0049) — what a
  // member card renders. Counting vouchers first, then unverified ones, then the self-vouch;
  // first-seen event order within each group. Invariant: the number of counting entries
  // equals requirement.counting, so the card's number and its list can never disagree.
  //   → { counting, required, vouchers: [{ pubkey, counting, reason: null|'unverified'|'self' }] }
  function voucherBreakdown(sets, pubkey) {
    var req = sets.requirement.get(pubkey);
    if (!req) return { counting: 0, required: null, vouchers: [] };
    var counted = [], unverified = [];
    var vs = sets.vouchersByTarget.get(pubkey);
    if (vs) vs.forEach(function (v) {
      if (sets.verifiedMap.has(v)) counted.push({ pubkey: v, counting: true, reason: null });
      else unverified.push({ pubkey: v, counting: false, reason: 'unverified' });
    });
    var self = sets.selfVouched && sets.selfVouched.has(pubkey)
      ? [{ pubkey: pubkey, counting: false, reason: 'self' }] : [];
    return { counting: req.counting, required: req.required, vouchers: counted.concat(unverified, self) };
  }

  // LEGACY (ADR 0033): 1-vouch closure. Feed-only until story #3. Do not extend.
  //   verifiedMap: pubkey -> taggerPubkey  (seed -> null); transitive closure.
  //   pendingMap:  pubkey -> taggerPubkey  (tagged only by a not-yet-verified account).
  function buildMemberSets(tagItems, seedPubkey) {
    const verifiedMap = new Map();
    verifiedMap.set(seedPubkey, null);
    let changed = true;
    while (changed) {
      changed = false;
      for (const ev of tagItems) {
        const pTag = ev.tags?.find((t) => t[0] === 'p')?.[1];
        if (pTag && verifiedMap.has(ev.pubkey) && !verifiedMap.has(pTag)) {
          verifiedMap.set(pTag, ev.pubkey);
          changed = true;
        }
      }
    }

    const pendingMap = new Map();
    for (const ev of tagItems) {
      const pTag = ev.tags?.find((t) => t[0] === 'p')?.[1];
      if (pTag && !verifiedMap.has(pTag) && !pendingMap.has(pTag)) {
        pendingMap.set(pTag, ev.pubkey);
      }
    }

    return { verifiedMap, pendingMap };
  }

  return {
    MEMBERSHIP_POLICY: MEMBERSHIP_POLICY,
    scoreInteger: scoreInteger,
    requiredVouches: requiredVouches,
    voucherBreakdown: voucherBreakdown,
    buildTrustWeightedMemberSets: buildTrustWeightedMemberSets,
    buildMemberSets: buildMemberSets,
  };
});
