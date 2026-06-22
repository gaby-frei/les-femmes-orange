// Golden fixtures for Story 5 (community-feed content-relevance). Used TWO ways:
//   1. Kind 1 (npm test): the `scores` are the "pretend the AI already answered" inputs
//      seeded into the deterministic pipeline tests.
//   2. Kind 2 (npm run eval:relevance): the same notes + `label` are the labelled set the
//      REAL model is graded against.
// Each entry's `scores` is what a CORRECT classifier should return: { bitcoin, nostr, lfo } in [0,1].

const h = (c) => String(c).repeat(64).slice(0, 64); // 64-char hex-ish id/pubkey from a single char

const GOLDEN = [
  {
    note: { id: h(1), pubkey: h('a'), created_at: 1_730_000_100, content: 'Took my dog to the park today, such a good boy 🐕', tags: [['t', 'grownostr']] },
    label: 'off-topic',
    scores: { bitcoin: 0.02, nostr: 0.04, lfo: 0.00 },
  },
  {
    note: { id: h(2), pubkey: h('b'), created_at: 1_730_000_200, content: 'Just opened a new Lightning channel and routed my first payment ⚡', tags: [['t', 'lightning']] },
    label: 'bitcoin-adjacent',
    scores: { bitcoin: 0.90, nostr: 0.20, lfo: 0.00 },
  },
  {
    note: { id: h(3), pubkey: h('c'), created_at: 1_730_000_300, content: 'Bitcoin mining difficulty just hit a new all-time high', tags: [['t', 'bitcoin']] },
    label: 'bitcoin-adjacent',
    scores: { bitcoin: 0.88, nostr: 0.05, lfo: 0.00 },
  },
  // depth-neutral pair — casual vs technical, both genuinely on-topic, should score comparably
  {
    note: { id: h(4), pubkey: h('d'), created_at: 1_730_000_400, content: "Heading to the local Bitcoin meetup tonight, who's coming?", tags: [['t', 'bitcoin']] },
    label: 'bitcoin-casual',
    scores: { bitcoin: 0.85, nostr: 0.02, lfo: 0.10 },
  },
  {
    note: { id: h(5), pubkey: h('e'), created_at: 1_730_000_500, content: 'Deep dive: how taproot script-path spends batch-verify Schnorr signatures', tags: [['t', 'bitcoin']] },
    label: 'bitcoin-technical',
    scores: { bitcoin: 0.95, nostr: 0.05, lfo: 0.00 },
  },
  {
    note: { id: h(6), pubkey: h('f'), created_at: 1_730_000_600, content: 'Loving the new NIP for private groups on nostr', tags: [['t', 'nostr']] },
    label: 'nostr',
    scores: { bitcoin: 0.05, nostr: 0.92, lfo: 0.00 },
  },
  {
    note: { id: h(7), pubkey: h('9'), created_at: 1_730_000_700, content: 'So proud of the Les Femmes Orange community this month 🧡', tags: [['t', 'lesfemmesorange']] },
    label: 'lfo',
    scores: { bitcoin: 0.02, nostr: 0.10, lfo: 0.80 },
  },
  // v2 regressions — Nostr-native lifestyle posts that use community hashtags as reach tags,
  // not topic signals. The SUBJECT (tree / greeting / religion) is off-topic; the #asknostr /
  // #nostr hashtags must NOT pull the nostr score over threshold. (Real false positives, 2026-06-22.)
  {
    note: { id: h(8), pubkey: h('g'), created_at: 1_730_000_800, content: 'Who can tell me what tree is this? #asknostr', tags: [['t', 'asknostr']] },
    label: 'off-topic',
    scores: { bitcoin: 0.00, nostr: 0.05, lfo: 0.00 },
  },
  {
    note: { id: h('i'), pubkey: h('j'), created_at: 1_730_000_900, content: '#GM you wonderful #nostr people 🧡 enjoy this beautiful day', tags: [['t', 'nostr']] },
    label: 'off-topic',
    scores: { bitcoin: 0.00, nostr: 0.08, lfo: 0.00 },
  },
  {
    note: { id: h('k'), pubkey: h('m'), created_at: 1_730_001_000, content: 'Listen #nostr, start a faith journey, may the grace of the Lord be with you.', tags: [['t', 'nostr']] },
    label: 'off-topic',
    scores: { bitcoin: 0.00, nostr: 0.05, lfo: 0.00 },
  },
];

// Map<id, {bitcoin,nostr,lfo}> — the seeded "AI already answered" scores for pipeline tests.
function seededScores() {
  return new Map(GOLDEN.map((g) => [g.note.id, g.scores]));
}

const byLabel = (label) => GOLDEN.filter((g) => g.label === label);
const noteFor = (label) => byLabel(label)[0].note;

module.exports = { GOLDEN, seededScores, byLabel, noteFor };
