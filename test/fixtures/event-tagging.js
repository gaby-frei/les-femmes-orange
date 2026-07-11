'use strict';

// Fixtures for Story 8 (event-tag source, ADR 0036). Event shapes mirror the live
// `lfo-community` data on tags.brainstorm.world: per-tag tagging headers and tagging
// assertions (kind 39999, indirect via descriptor z), plus kind-1 note bodies and a
// filter-faithful in-memory relay fake so provider tests exercise real NIP-01 filter
// composition instead of stub dispatch.

const TA = 'ad'.repeat(32);            // the deployment TA (honored authority)
const OTHER_TA = 'ee'.repeat(32);      // an un-honored authority
const TAG_AUTHOR = '6d'.repeat(32);    // author of the lfo-community tag element
const MEMBER_1 = '11'.repeat(32);
const MEMBER_2 = '22'.repeat(32);
const NON_MEMBER = '99'.repeat(32);
const MEMBERS = new Set([MEMBER_1, MEMBER_2]);

const TAG = { authorPubkey: TAG_AUTHOR, slug: 'lfo-community', channel: 'lfo' };
const TAGGING_RELAY = 'wss://tags.example/relay';

const tagCoord = (author, slug) => `39999:${author}:${slug}`;
const headerCoord = (author, slug) => `39999:${author}:tagging:${slug}-tagging`;

let seq = 0;
function eventId() { return (++seq).toString(16).padStart(64, '0'); }

// Per-tag tagging header: d = tagging:<slug>-tagging, a → tag element, z → the
// tagging-with-specific-tag concept under `ta` (honored only when ta === the runtime TA).
function mkHeader({ author = TAG_AUTHOR, slug = TAG.slug, tagAuthor = TAG_AUTHOR, ta = TA, createdAt = 1_750_000_000 } = {}) {
  return {
    id: eventId(), kind: 39999, pubkey: author, created_at: createdAt, content: '',
    tags: [
      ['d', `tagging:${slug}-tagging`],
      ['a', tagCoord(tagAuthor, slug)],
      ['z', `39998:${ta}:tagging-with-specific-tag`],
    ],
  };
}

// Tagging assertion: e (or a) → target, z → nostr-event-tag concept, z → the header's
// coordinate (the descriptor). `polarity` omitted ⇒ no polarity tag (spec: means apply).
function mkAssertion({ asserter, targetId, targetAddr, header, slug = TAG.slug, polarity, ta = TA, createdAt = 1_751_000_000 }) {
  const desc = header || headerCoord(TAG_AUTHOR, slug);
  const tags = [
    ['d', `event-tag-${slug}-${String(targetId || targetAddr).slice(0, 8)}-${asserter.slice(0, 8)}`],
    targetId != null ? ['e', targetId] : ['a', targetAddr],
    ['z', `39998:${ta}:nostr-event-tag`],
    ['z', desc],
  ];
  if (polarity !== undefined) tags.push(['polarity', String(polarity)]);
  return { id: eventId(), kind: 39999, pubkey: asserter, created_at: createdAt, tags, content: '' };
}

function mkNote({ id, author = MEMBER_1, content = 'a tagged note', createdAt = 1_749_000_000 }) {
  return { id, kind: 1, pubkey: author, created_at: createdAt, content, tags: [] };
}

// The tag-element itself (UI amendment): its content JSON carries the display
// name + description the pill renders. Mirrors the live event 22e3ead7….
const TAG_NAME = 'LFO Community';
const TAG_DESC = 'This tag denotes content relevant to the Les Femmes Orange community itself — its members, initiatives, events, and community life.';
function mkTagElement({ author = TAG_AUTHOR, slug = TAG.slug, name = TAG_NAME, description = TAG_DESC, content, createdAt = 1_748_000_000 } = {}) {
  return {
    id: eventId(), kind: 39999, pubkey: author, created_at: createdAt,
    content: content !== undefined ? content : JSON.stringify({ tag: { slug, name, description } }),
    tags: [['d', slug], ['z', `39998:${TA}:tag`], ['z', 'tag-for-nostr-event']],
  };
}

// Minimal NIP-01 matcher: kinds / ids / authors / #<tag> intersection.
function matches(ev, filter) {
  if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
  if (filter.ids && !filter.ids.includes(ev.id)) return false;
  if (filter.authors && !filter.authors.includes(ev.pubkey)) return false;
  for (const key of Object.keys(filter)) {
    if (key[0] !== '#') continue;
    const name = key.slice(1);
    if (!(ev.tags || []).some((t) => t[0] === name && filter[key].includes(t[1]))) return false;
  }
  return true;
}

// In-memory relay: queryRelayStatus-shaped, records every call for assertions on
// what was queried (e.g. "no relay query after TA failure").
function fakeRelay(events) {
  const calls = [];
  async function queryRelayStatus(url, filter) {
    calls.push({ url, filter });
    return { events: events.filter((e) => matches(e, filter)), ok: true };
  }
  return { queryRelayStatus, calls };
}

// A relay that is down: every query fails (ok:false, no events), still recorded.
function deadRelay() {
  const calls = [];
  async function queryRelayStatus(url, filter) {
    calls.push({ url, filter });
    return { events: [], ok: false };
  }
  return { queryRelayStatus, calls };
}

module.exports = {
  TA, OTHER_TA, TAG_AUTHOR, MEMBER_1, MEMBER_2, NON_MEMBER, MEMBERS,
  TAG, TAGGING_RELAY, TAG_NAME, TAG_DESC,
  tagCoord, headerCoord,
  mkHeader, mkAssertion, mkNote, mkTagElement,
  fakeRelay, deadRelay,
};
