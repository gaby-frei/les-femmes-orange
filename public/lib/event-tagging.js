/* eslint-disable */
// Browser-shared event-tagging assertion builder (note-tagging #2, ADR 0040 Decision 2).
// UMD so the SAME code runs in the browser (the "Add a tag" apply flow) and in Node
// (tests) with no build step — the membership.js pattern.
//
// PROVENANCE — adapted-verbatim from the Tapestry event-tagging SDK
// (github.com/nous-clawds4/tapestry, branch feat/tags, commit 42596656; files
// src/lib/event-tagging/{builders.js,handles.js}). The inner function bodies below are
// copied UNCHANGED; only this UMD wrapper and the export subset differ. Deliberately
// EXCLUDED: buildTagElement / buildTaggingHeader (minting is forbidden in this app —
// assertion-only, per story note-tagging #2) and the apply.js orchestrator (its
// mint-if-missing semantics are exactly what the story forbids). Drift guard:
// test/builder-parity.test.js asserts output parity against the upstream SDK in-repo.
// See also api/_lib/event-tagging/PROVENANCE.md.
;(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (require)
  if (typeof window !== 'undefined') { window.LFOEventTagging = api; }       // browser global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── handles.js (verbatim subset) ──────────────────────────────────────────
  function conceptNostrEventTag(taPubkey) {
    return `39998:${taPubkey}:nostr-event-tag`;
  }
  function taggingHeaderAddr(authorPubkey, slug) {
    return `39999:${authorPubkey}:tagging:${slug}-tagging`;
  }

  // ── builders.js (verbatim subset) ─────────────────────────────────────────
  const HEX64 = /^[0-9a-f]{64}$/;

  function requireHex64(value, label) {
    if (typeof value !== 'string' || !HEX64.test(value)) {
      throw new Error(`event-tagging: ${label} must be a 64-char lowercase hex pubkey (got: ${value})`);
    }
  }

  function conceptZTags(taPubkeys, conceptFn, label) {
    if (!Array.isArray(taPubkeys) || taPubkeys.length === 0) {
      throw new Error(`event-tagging: ${label} must be a non-empty array of TA pubkeys (the concept namespaces to join)`);
    }
    const seen = new Set();
    const out = [];
    for (const pk of taPubkeys) {
      requireHex64(pk, `${label}[] entry`);
      const handle = conceptFn(pk);
      if (!seen.has(handle)) { seen.add(handle); out.push(['z', handle]); }
    }
    return out;
  }

  function buildEventTaggingAssertion({ headerAuthorPubkey, slug, target, polarity, asserterPubkey, taPubkeys }) {
    // Both pubkeys end up as permanent, signed, published coordinates: asserterPubkey
    // into the deterministic d-tag (replaceability key), headerAuthorPubkey into the
    // descriptor z-coordinate (39999:<author>:tagging:<slug>-tagging). A malformed
    // either one mints an orphan event signed with the user's real key, so fail loud
    // (mirrors publishProfileTag.js:54). taPubkeys entries are validated in conceptZTags.
    requireHex64(asserterPubkey, 'asserterPubkey');
    requireHex64(headerAuthorPubkey, 'headerAuthorPubkey');

    const p = Number(polarity);
    if (p !== 1 && p !== -1) {
      throw new Error(`event-tagging: polarity must be 1 (apply) or -1 (dispute), got: ${polarity}`);
    }

    let targetTag;
    let target8;
    if (target && typeof target.id === 'string') {
      targetTag = ['e', target.id];
      // NIP-01 relay hint — lets read paths fetch an EXTERNAL target note on-demand
      // (view-time) from where it actually lives, instead of persisting other
      // people's notes into the local relay. Emitted only when the caller supplies
      // one (e.g. the "+ Tag a Note" modal forwards the pasted nevent's hints).
      const hint = Array.isArray(target.relays)
        ? target.relays.find((r) => typeof r === 'string' && /^wss?:\/\//.test(r))
        : null;
      if (hint) targetTag.push(hint);
      target8 = target.id.slice(0, 8);
    } else if (target && typeof target.address === 'string') {
      targetTag = ['a', target.address];
      target8 = (target.address.split(':')[1] || '').slice(0, 8); // the coord's author-pubkey segment
    } else {
      throw new Error('event-tagging: target must be { id } (event id) or { address } (a-coordinate)');
    }

    const dTag = `event-tag-${slug}-${target8}-${asserterPubkey.slice(0, 8)}`;

    return {
      kind: 39999,
      tags: [
        ['d', dTag],
        targetTag,
        ...conceptZTags(taPubkeys, conceptNostrEventTag, 'taPubkeys'),
        ['z', taggingHeaderAddr(headerAuthorPubkey, slug)],
        ['polarity', String(p)],
      ],
      content: '',
    };
  }

  return { buildEventTaggingAssertion, taggingHeaderAddr, conceptNostrEventTag };
});
