'use strict';

// Raw Nostr relay query over Node's global WebSocket (Node 18+). Mirrors the browser's
// queryRelayStatus so the server-side feed reuses the same fetch shape and the relay-status
// dots keep working. (ADR 0033 deviation: global WebSocket rather than a SimplePool dep.)
function queryRelayStatus(relayUrl, filter, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const events = [];
    let ws;
    try { ws = new WebSocket(relayUrl); } catch { return resolve({ events, ok: false }); }

    const subId = Math.random().toString(36).slice(2, 10);
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve({ events, ok: false }); }, timeoutMs);

    ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, filter]));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
        else if (msg[0] === 'EOSE') { clearTimeout(timer); ws.close(); resolve({ events, ok: true }); }
      } catch {}
    };
    ws.onerror = () => { clearTimeout(timer); resolve({ events, ok: false }); };
  });
}

async function queryRelays(relayUrls, filter, timeoutMs = 10000) {
  const settled = await Promise.allSettled(relayUrls.map((u) => queryRelayStatus(u, filter, timeoutMs)));
  const seen = new Set();
  const all = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      for (const ev of r.value.events) if (!seen.has(ev.id)) { seen.add(ev.id); all.push(ev); }
    }
  }
  return all;
}

module.exports = { queryRelayStatus, queryRelays };
