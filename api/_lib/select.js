'use strict';

// Layer 3 selection (ADR 0033): keep notes whose MAX per-topic score clears the
// threshold, order newest-first, slice to the display size. A note with no score is
// treated as unjudged and excluded (AC-6 at the filter level) — synchronous classify
// guarantees real candidates always have one; the fallback path supplies pass-through
// scores so nothing is dropped for being unjudged when the classifier is down.
function selectRelevant(notes, scores, opts) {
  const { threshold, displayLimit } = opts || {};
  const get = scores && typeof scores.get === 'function'
    ? (id) => scores.get(id)
    : (id) => (scores ? scores[id] : undefined);

  const kept = [];
  for (const n of notes) {
    const s = get(n.id);
    if (!s) continue; // unjudged → exclude
    const max = Math.max(s.bitcoin || 0, s.nostr || 0, s.lfo || 0);
    if (max >= threshold) kept.push(n);
  }
  kept.sort((a, b) => b.created_at - a.created_at);
  return typeof displayLimit === 'number' ? kept.slice(0, displayLimit) : kept;
}

module.exports = { selectRelevant };
