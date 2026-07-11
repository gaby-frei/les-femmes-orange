// Story 8 (ADR 0036) — runtime TA resolution: `getTaPubkey({ url, fetchImpl })` in
// api/_lib/ta.js. Per-process cache of the SUCCESSFUL value only; failures return null,
// are never cached, and never fall back to a hardcoded pubkey. `_reset()` clears the
// cache between tests. RED until api/_lib/ta.js exists.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { TA } = require('./fixtures/event-tagging.js');

let mod = {};
try { mod = require('../api/_lib/ta.js'); } catch {}
const getTaPubkey = mod.getTaPubkey
  || (() => { throw new Error('api/_lib/ta.js does not export getTaPubkey yet (Story 8 unimplemented)'); });
const _reset = mod._reset || (() => {});

const URL = 'https://tags.example/api/assistant/pubkey';
const okResponse = (pubkey) => ({ ok: true, json: async () => ({ success: true, pubkey }) });

beforeEach(() => _reset());

test('resolves the TA pubkey from the endpoint', async () => {
  const pk = await getTaPubkey({ url: URL, fetchImpl: async () => okResponse(TA) });
  assert.equal(pk, TA);
});

test('caches a successful resolution per process — one fetch for two calls', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return okResponse(TA); };
  await getTaPubkey({ url: URL, fetchImpl });
  const again = await getTaPubkey({ url: URL, fetchImpl });
  assert.equal(again, TA);
  assert.equal(calls, 1, 'second call is served from the cache');
});

test('does NOT cache failure — a later call retries and succeeds', async () => {
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw new Error('network down'); return okResponse(TA); };
  const first = await getTaPubkey({ url: URL, fetchImpl: flaky });
  assert.equal(first, null, 'failure yields null, not a fallback pubkey');
  const second = await getTaPubkey({ url: URL, fetchImpl: flaky });
  assert.equal(second, TA, 'the retry is not blocked by a cached failure');
  assert.equal(calls, 2);
});

test('a malformed response (missing or non-64-hex pubkey) yields null', async () => {
  const bad1 = await getTaPubkey({ url: URL, fetchImpl: async () => ({ ok: true, json: async () => ({ success: true }) }) });
  assert.equal(bad1, null, 'missing pubkey → null');
  _reset();
  const bad2 = await getTaPubkey({ url: URL, fetchImpl: async () => okResponse('not-hex') });
  assert.equal(bad2, null, 'non-hex pubkey → null');
  _reset();
  const bad3 = await getTaPubkey({ url: URL, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  assert.equal(bad3, null, 'HTTP error → null');
});

test('a throwing fetch resolves to null — never rejects', async () => {
  const pk = await getTaPubkey({ url: URL, fetchImpl: async () => { throw new Error('boom'); } });
  assert.equal(pk, null);
});
