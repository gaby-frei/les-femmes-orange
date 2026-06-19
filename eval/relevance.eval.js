// L4 — Kind 2 ("judgment") opt-in eval. NOT part of `npm test`.
// Calls the REAL Claude Haiku on the golden set and checks verdicts match labels.
//   ANTHROPIC_API_KEY=sk-ant-... node eval/relevance.eval.js
// Skips cleanly (exit 0) when no key is set, so CI never runs it by accident.
const { GOLDEN } = require('../test/fixtures/golden-notes.js');

const THRESHOLD = 0.3;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('SKIP: ANTHROPIC_API_KEY not set — this is an opt-in eval, not run in CI.');
    process.exit(0);
  }
  let classifyOne, Anthropic;
  try {
    ({ classifyOne } = require('../api/_lib/classify.js'));
    Anthropic = require('@anthropic-ai/sdk');
  } catch (e) {
    console.error('Not runnable yet — implement api/_lib/classify.js and install @anthropic-ai/sdk first.');
    console.error(String(e.message || e));
    process.exit(1);
  }
  const anthropic = new Anthropic();
  let pass = 0, fail = 0;
  for (const g of GOLDEN) {
    const s = await classifyOne(g.note, { anthropic });
    const max = Math.max(s.bitcoin, s.nostr, s.lfo);
    const onTopic = max >= THRESHOLD;
    const expectOnTopic = g.label !== 'off-topic';
    const ok = onTopic === expectOnTopic;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${g.label}] max=${max.toFixed(2)} :: ${g.note.content.slice(0, 50)}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass}/${pass + fail} golden notes classified correctly (threshold ${THRESHOLD}).`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
