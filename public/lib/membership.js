/* eslint-disable */
// Shared web-of-trust membership closure (ADR 0033). UMD so the SAME code runs in the
// browser (gated members view) and in Node (the /api/feed serverless function) with no
// build step — avoiding a duplicated closure across client and server.
;(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (require)
  if (typeof window !== 'undefined') { window.buildMemberSets = api.buildMemberSets; } // browser global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Given LFO kind-9999/39999 tag items + the bootstrap seed pubkey, returns:
  //   verifiedMap: pubkey -> taggerPubkey  (seed -> null); transitive closure of the WoT.
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

  return { buildMemberSets };
});
