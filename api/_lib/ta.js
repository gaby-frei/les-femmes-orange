'use strict';

// Runtime Tapestry-Assistant pubkey resolution (ADR 0036). The TA pubkey is
// per-deployment and must NEVER be hardcoded — every concept handle Provider 2
// filters on is composed from it. Cache the SUCCESSFUL value per process only;
// failures return null (never a fallback pubkey) and are never cached, so the
// next request retries.

const HEX64 = /^[0-9a-f]{64}$/;

let _cached = null;

async function getTaPubkey({ url, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (_cached) return _cached;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res || !res.ok) return null;
    const body = await res.json();
    const pk = body && body.pubkey;
    if (typeof pk !== 'string' || !HEX64.test(pk)) return null;
    _cached = pk;
    return pk;
  } catch {
    return null;
  }
}

function _reset() { _cached = null; }

module.exports = { getTaPubkey, _reset };
