'use strict';

// The provider merge seam (ADR 0036, Decision 4): flatten N pools of
// { event, channels, vias, taggedWith? } candidates, dedupe by event id
// (channels set-unioned, vias concatenated, taggedWith unioned by name),
// order strictly newest-first (id tie-break for determinism), cap.
// Pure and provider-count-agnostic: adding a provider is adding a pool —
// nothing here changes.
function mergeCandidatePools(pools, opts) {
  const { displayLimit } = opts || {};
  const byId = new Map();

  for (const pool of pools || []) {
    for (const c of pool || []) {
      const id = c && c.event && c.event.id;
      if (id == null) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, {
          event: c.event,
          channels: [...new Set(c.channels || [])],
          vias: [...(c.vias || [])],
          taggedWith: dedupeByName([], c.taggedWith),
          taggers: [...new Set(c.taggers || [])],
        });
      } else {
        for (const ch of c.channels || []) if (!prev.channels.includes(ch)) prev.channels.push(ch);
        prev.vias.push(...(c.vias || []));
        prev.taggedWith = dedupeByName(prev.taggedWith, c.taggedWith);
        for (const pk of c.taggers || []) if (!prev.taggers.includes(pk)) prev.taggers.push(pk);
      }
    }
  }

  const merged = [...byId.values()].sort((a, b) =>
    (b.event.created_at - a.event.created_at) || String(a.event.id).localeCompare(String(b.event.id)));
  return typeof displayLimit === 'number' ? merged.slice(0, displayLimit) : merged;
}

// taggedWith entry identity is the slug when present (note-tagging #2), else the
// display name (#8's original shape). Same-key entries union their appliers.
function dedupeByName(base, extra) {
  const keyOf = (t) => (t && t.slug != null ? `s:${t.slug}` : `n:${t && t.name}`);
  const out = base.map((t) => ({ ...t }));
  for (const t of extra || []) {
    if (!t) continue;
    const existing = out.find((x) => keyOf(x) === keyOf(t));
    if (!existing) { out.push({ ...t }); continue; }
    if (t.appliers || existing.appliers) {
      const merged = [...new Set([...(existing.appliers || []), ...(t.appliers || [])])];
      existing.appliers = merged;
    }
  }
  return out;
}

module.exports = { mergeCandidatePools };
