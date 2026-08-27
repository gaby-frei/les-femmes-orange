// E2E spec for npub-search Story 1 (ADR 0041): identity-string search + vouch from the
// candidate panel on the Members page. Written BEFORE implementation — T1–T13 are RED until
// the search bar, decodeIdentity, fetchSearchProfile, and the candidate panel land in
// public/index.html. T14 is the regression tripwire for the publishVouch extraction: it
// exercises only the EXISTING pending-grid vouch flow and must be green before, during, and
// after implementation.
//
// Seam contract the implementation must satisfy (ADR 0041 implementation notes):
//   DOM: .member-search block inside #page-members between .telegram-row and
//        #verified-members-section; <input id="member-search-input">; #member-search-panel —
//        an absolutely-positioned dropdown overlay, hidden until a search;
//        .member-search-hint for non-identity input; .member-search-loading while relays are
//        in flight (PO: the panel is never blank during a lookup). Candidate card =
//        #member-search-panel .member-card.candidate reusing .member-name / .member-nip05 /
//        .member-bio / .member-npub-text / .member-badge / .attest-btn ("Vouch").
//        Badges: "✓ Member" | "Pending" | "Not a member".
//   window.decodeIdentity(raw) -> { hex, hints[] } | null. Pure. Hex 64 / npub1 / nprofile1;
//        bech32 checksum failures -> null; hints sanitized: wss:// only, deduped, max 3.
//   Profile lookup: parallel queryRelay fan-out over RELAYS + PROFILE_RELAYS
//        (purplepag.es, relay.damus.io) + sanitized hints; renders on FIRST hit; a strictly
//        newer created_at arriving later upgrades the card; a full miss is NOT negative-cached
//        (re-search re-queries) and renders an npub-only row that is vouchable like any
//        other candidate (PO rollback of O3, 2026-07-31 — no special copy, no view-only state).
//   Vouch: publishVouch core — kind 39999, d = profile-tag-lfo-<tagged8>-<tagger8>,
//        e = LFO concept id, z = nostr-user-tag addr, p = target, polarity 1 — signed by the
//        member, published via publishEventToRelay (brainstorm = confirmation relay). Panel
//        success: badge flips to ✓ Member and the grids refresh. Declined -> button restored,
//        nothing published. Grid path (applyLFOTag) byte-identical for users.

import { test, expect } from '@playwright/test';
import { nip19 } from 'nostr-tools';

const SEED     = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c'; // page SEED_PUBKEY
const ME       = '11'.repeat(32);
const PENDING  = '22'.repeat(32);
const OUTSIDER = '33'.repeat(32);
const GHOST    = '44'.repeat(32);

const LFO_TAG_EVENT_ID    = '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795';
const NOSTR_USER_TAG_ADDR = '39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:nostr-user-tag';
const PROFILE_RELAY_URLS  = ['wss://purplepag.es', 'wss://relay.damus.io'];
const MEMBERSHIP_RELAYS   = ['wss://tags.brainstorm.world/relay', 'wss://nos.lol'];

const OUTSIDER_NPUB     = nip19.npubEncode(OUTSIDER);
const OUTSIDER_NPROFILE = nip19.nprofileEncode({
  pubkey: OUTSIDER,
  relays: ['wss://hint-a.example.com', 'wss://hint-b.example.com'],
});
const DIRTY_NPROFILE = nip19.nprofileEncode({
  pubkey: OUTSIDER,
  relays: [
    'ws://insecure.example.com',      // plaintext — must be dropped
    'wss://dup.example.com',
    'wss://dup.example.com',          // duplicate — must be deduped
    'wss://x1.example.com',
    'wss://x2.example.com',
    'wss://x3.example.com',           // beyond the cap of 3 after the above
  ],
});
const GHOST_NPUB = nip19.npubEncode(GHOST);
const ME_NPUB    = nip19.npubEncode(ME);
const PEND_NPUB  = nip19.npubEncode(PENDING);

const shortNpub = (hex) => { const n = nip19.npubEncode(hex); return n.slice(0, 12) + '…' + n.slice(-6); };

/* ── Free-text search fixtures — re-pinned to the ORE backend by story #6 (ADR 0045).
   The free-text path's network surface is three independently stubbed calls:
     1. POST <ORE_HOST>/search/pubkeys → stubOreSearch. Fixture ranks are fused text×WoT
        floats (thousands scale) — an ordering signal only, never displayed; fixtures
        deliberately make fused order disagree with chip values so a client re-sort
        would FAIL T17.
     2. kind-0 metadata join over the wide relay set → the existing queryRelay stub
        (profiles option on openMembers).
     3. POST <ORE_HOST>/rank/pubkeys (chips) → stubRankApi (0–1 floats; chip = round(×100)).
   openMembers aborts AND counts any call to the retired meili proxy (page.__meiliCalls). */

const HOUSE_HEX = '6ff682438884e32f619d79e1aa1aba7de8f426005bea5891fc64ef854768731c';
// Settled policy 2026-08-14: api.brainstorm.world for all ORE calls (T16 pins both URLs).
const ORE_HOST  = 'https://api.brainstorm.world';

function oreSearchResponse(pairs) {
  // pairs: [hex, fusedRank][] — served order IS the expected render order.
  return { results: pairs.map(([pubkey, rank]) => ({ pubkey, rank })), ttl: 300 };
}

// Stub the ORE search endpoint. `respond(body, nthCall)` returns
// { body, status?, delayMs?, abort? }. Returns the node-side call log — the parsed
// POST bodies plus `_url` — so specs can assert the request contract and the host.
async function stubOreSearch(page, respond) {
  page.__oreSearchStubbed = true;
  const calls = [];
  await page.route('**/search/pubkeys', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ ...body, _url: route.request().url() });
    const r = (typeof respond === 'function' ? await respond(body, calls.length) : respond) || {};
    if (r.abort) return route.abort('failed');
    if (r.delayMs) await new Promise(res => setTimeout(res, r.delayMs));
    return route.fulfill({
      status: r.status ?? 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: r.body ?? oreSearchResponse([]),
    });
  });
  return calls;
}

// Default per-pubkey kind-0 serving config. Entries: { meta, created_at, relay?, delayMs? }
// (relay undefined = served by every relay). GHOST intentionally absent everywhere.
function defaultProfiles() {
  return {
    [ME]:       [{ meta: { display_name: 'Mae Member', nip05: 'mae@lfo.example', about: 'Signed-in verified member.' }, created_at: 1000 }],
    [PENDING]:  [{ meta: { display_name: 'Pat Pending', nip05: 'pat@lfo.example', about: 'Applied, awaiting vouches.' }, created_at: 1000 }],
    [OUTSIDER]: [{ meta: { display_name: 'Olive Outsider', nip05: 'olive@nostr.example', about: 'A trusted friend not yet in the community.' }, created_at: 1000 }],
  };
}

// Boot the real page, install stubs BEFORE showView('members'), drive the real
// buildMemberSets closure with synthetic tag items (SEED→ME verified; PENDING self-applied).
async function openMembers(page, { profiles = defaultProfiles(), publishOk = true, signThrows = false, extraTagItems = [] } = {}) {
  // Story #4: loadMembersPage now fires a batch POST to the ORE rank endpoint. The suite
  // must never reach live hosts — default to an empty-results stub unless the test
  // installed its own via stubRankApi (which sets the flag and must take precedence).
  if (!page.__rankStubbed) {
    await page.route('**/rank/pubkeys', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { results: [], ttl: 3600 },
    }));
  }
  // Story #6: same default-stub pattern for ORE search, so no test can leak to the live host.
  if (!page.__oreSearchStubbed) {
    await page.route('**/search/pubkeys', (route) => route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { results: [], ttl: 300 },
    }));
  }
  // Story #6: the meili proxy is retired from the free-text path. Abort AND count any
  // call that still reaches it — T16 asserts the count stays zero.
  page.__meiliCalls = [];
  await page.route('**/api/search/profiles/meili*', (route) => {
    page.__meiliCalls.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView), 'app booted').toBe('function');
  await page.evaluate(({ profiles, publishOk, signThrows, me, seed, pending, extraTagItems }) => {
    currentPubkey = me;
    _isVerifiedMember = true;
    _tagItemsCache = [
      { kind: 39999, pubkey: seed,    tags: [['p', me]],      created_at: 1, id: 'a1'.repeat(32) },
      { kind: 39999, pubkey: pending, tags: [['p', pending]], created_at: 2, id: 'a2'.repeat(32) },
      ...extraTagItems,
    ];
    window.__relayCalls = [];
    window.__published  = [];
    window.__signed     = [];
    window.__profiles   = profiles;
    let evSeq = 0;
    window.queryRelay = async (relayUrl, filter) => {
      window.__relayCalls.push({ relay: relayUrl, filter: JSON.parse(JSON.stringify(filter)), t: performance.now() });
      if (!Array.isArray(filter.kinds) || !filter.kinds.includes(0)) return [];
      const out = [];
      for (const hex of filter.authors || []) {
        for (const entry of (window.__profiles[hex] || [])) {
          if (entry.relay && entry.relay !== relayUrl) continue;
          if (entry.delayMs) await new Promise(r => setTimeout(r, entry.delayMs));
          out.push({ kind: 0, pubkey: hex, created_at: entry.created_at,
                     content: JSON.stringify(entry.meta),
                     id: String(++evSeq).padStart(64, '0') });
        }
      }
      return out;
    };
    window.LFOSigner = {
      get mode() { return 'extension'; },
      canSign: () => true,
      getPublicKey: async () => me,
      sign: async (unsigned) => {
        if (signThrows) throw new Error('user declined');
        window.__signed.push(unsigned);
        return { ...unsigned, id: 'f0'.repeat(32), pubkey: me, sig: '00'.repeat(64) };
      },
      clear: () => {},
    };
    window.publishEventToRelay = async (relay, event) => {
      window.__published.push({ relay, event });
      return { ok: publishOk, relay };
    };
    window.showView('members');
  }, { profiles, publishOk, signThrows, me: ME, seed: SEED, pending: PENDING, extraTagItems });
  await expect(page.locator('#verified-members-grid .member-card').first(), 'members grid rendered').toBeVisible({ timeout: 10_000 });
}

const input = (page) => page.locator('#member-search-input');
const panel = (page) => page.locator('#member-search-panel');
const candidate = (page) => page.locator('#member-search-panel .member-card.candidate');
const badge = (page) => candidate(page).locator('.member-badge');
const vouchBtn = (page) => candidate(page).locator('.attest-btn');

async function search(page, str) {
  await input(page).fill('');
  await input(page).fill(str);
}

// Count kind-0 fan-out calls whose authors include `hex`, recorded after the members-page
// metadata load (callers reset __relayCalls first when they need a clean window).
const profileCallsFor = (page, hex) => page.evaluate(
  (h) => window.__relayCalls.filter(c => c.filter.kinds?.includes(0) && (c.filter.authors || []).includes(h)),
  hex,
);

test.describe('npub search — identity search + vouch from panel (npub-search #1)', () => {
  // T1
  test('search bar sits inside #page-members above the verified grid; panel hidden until a search', async ({ page }) => {
    await openMembers(page);
    const bar = page.locator('#page-members .member-search');
    await expect(bar, 'search block exists on the Members page').toBeVisible();
    await expect(input(page)).toBeVisible();
    // DOM order: telegram row → search block → verified section.
    const order = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('.telegram-row, .member-search, #verified-members-section')];
      return kids.map(el => el.id || el.className.split(' ')[0]);
    });
    expect(order, 'search bar between Telegram row and verified grid').toEqual(['telegram-row', 'member-search', 'verified-members-section']);
    await expect(panel(page), 'no panel before any search').toBeHidden();
  });

  // T2
  test('decodeIdentity: three forms → same hex; garbage/checksum failures → null; hints sanitized', async ({ page }) => {
    await openMembers(page);
    expect(await page.evaluate(() => typeof window.decodeIdentity), 'decodeIdentity is exposed').toBe('function');

    const results = await page.evaluate(({ hex, npub, nprofile }) => ({
      fromHex: window.decodeIdentity(hex),
      fromNpub: window.decodeIdentity(npub),
      fromNprofile: window.decodeIdentity(nprofile),
      prose: window.decodeIdentity('olive outsider'),
      corrupt: window.decodeIdentity(npub.slice(0, -1) + (npub.endsWith('x') ? 'y' : 'x')),
      shortHex: window.decodeIdentity(hex.slice(0, 63)),
      nsec: window.decodeIdentity('nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5'),
      empty: window.decodeIdentity(''),
    }), { hex: OUTSIDER, npub: OUTSIDER_NPUB, nprofile: OUTSIDER_NPROFILE });

    expect(results.fromHex?.hex).toBe(OUTSIDER);
    expect(results.fromNpub?.hex).toBe(OUTSIDER);
    expect(results.fromNprofile?.hex).toBe(OUTSIDER);
    for (const bad of ['prose', 'corrupt', 'shortHex', 'nsec', 'empty']) {
      expect(results[bad], `${bad} input decodes to null`).toBe(null);
    }

    // Hint sanitization: wss:// only, deduped, max 3 — pinned against a deliberately dirty
    // nprofile (plaintext ws://, a duplicate, and more hints than the cap).
    const dirty = await page.evaluate((pk) => window.decodeIdentity(pk), DIRTY_NPROFILE);
    expect(dirty?.hex, 'dirty nprofile still resolves the pubkey').toBe(OUTSIDER);
    expect(Array.isArray(dirty.hints), 'hints array present').toBe(true);
    expect(dirty.hints.length, 'hint cap').toBeLessThanOrEqual(3);
    expect(new Set(dirty.hints).size, 'hints deduped').toBe(dirty.hints.length);
    for (const h of dirty.hints) expect(h.startsWith('wss://'), `hint ${h} is wss://`).toBe(true);
    expect(dirty.hints, 'plaintext ws:// hint dropped').not.toContain('ws://insecure.example.com');
  });

  // T3
  test('npub, hex, and nprofile of the same identity render the same single candidate', async ({ page }) => {
    await openMembers(page);
    for (const form of [OUTSIDER_NPUB, OUTSIDER, OUTSIDER_NPROFILE]) {
      await search(page, form);
      await expect(candidate(page), `candidate renders for ${form.slice(0, 12)}…`).toHaveCount(1);
      await expect(candidate(page).locator('.member-name')).toHaveText('Olive Outsider');
    }
  });

  // T4 — AMENDED per PO row-format directive (2026-07-31, brainstorm.world reference):
  // reduced detail — photo, name, verification address only; status badge right-justified;
  // no bio, no npub row on candidates.
  test('candidate row: photo + name + verification address, right-justified badge, Vouch', async ({ page }) => {
    await openMembers(page);
    await search(page, OUTSIDER_NPUB);
    await expect(candidate(page)).toBeVisible();
    await expect(candidate(page).locator('.member-avatar'), 'profile photo slot').toBeVisible();
    await expect(candidate(page).locator('.member-name')).toHaveText('Olive Outsider');
    await expect(candidate(page).locator('.member-nip05'), 'verification address shown').toContainText('olive@nostr.example');
    // nostr.example is unreachable — the ✓ must NOT appear for an unprovable claim.
    await expect(candidate(page).locator('.candidate-nip05-check'), 'no checkmark without domain proof').toHaveCount(0);
    await expect(candidate(page).locator('.member-bio'), 'reduced detail: no bio').toHaveCount(0);
    await expect(candidate(page).locator('.member-npub-row'), 'reduced detail: no npub row').toHaveCount(0);
    await expect(badge(page)).toHaveText(/Not a member/i);
    await expect(vouchBtn(page), 'vouch offered for a non-member with a profile').toHaveText(/Vouch/);
    // Badge cluster is right-justified within the row.
    const cardBox = await candidate(page).boundingBox();
    const badgeBox = await badge(page).boundingBox();
    expect(badgeBox.x + badgeBox.width / 2, 'badge sits in the right half of the row')
      .toBeGreaterThan(cardBox.x + cardBox.width / 2);
  });

  // T4b — NIP-05 ✓ is EARNED (PO option-b decision 2026-07-31): shown only when the
  // address's domain maps the name back to this exact pubkey via /.well-known/nostr.json.
  test('NIP-05 checkmark appears only when the domain confirms the pubkey', async ({ page }) => {
    await page.route('**/.well-known/nostr.json*', (route) => {
      const url = route.request().url();
      const headers = { 'Access-Control-Allow-Origin': '*' };
      if (url.includes('nostr.example')) {
        // olive@nostr.example genuinely maps to OUTSIDER → ✓
        route.fulfill({ headers, json: { names: { olive: OUTSIDER } } });
      } else {
        // pat@lfo.example maps to a DIFFERENT key → claim fails, no ✓
        route.fulfill({ headers, json: { names: { pat: 'ff'.repeat(32) } } });
      }
    });
    await openMembers(page);

    await search(page, OUTSIDER_NPUB);
    await expect(candidate(page).locator('.member-nip05')).toContainText('olive@nostr.example');
    await expect(candidate(page).locator('.candidate-nip05-check'), 'domain confirms → ✓ earned').toBeVisible();

    await search(page, PEND_NPUB);
    await expect(candidate(page).locator('.member-nip05')).toContainText('pat@lfo.example');
    await page.waitForTimeout(400); // give a wrong verification time to (incorrectly) paint
    await expect(candidate(page).locator('.candidate-nip05-check'), 'domain mismatch → no ✓').toHaveCount(0);
  });

  // T5 — PO amendment: never a blank panel while relays are in flight.
  test('slow relays → the panel opens immediately in a loading state, then swaps to the candidate', async ({ page }) => {
    const profiles = defaultProfiles();
    profiles[OUTSIDER] = [{ ...profiles[OUTSIDER][0], delayMs: 1500 }];
    await openMembers(page, { profiles });
    await search(page, OUTSIDER_NPUB);
    await expect(panel(page), 'panel visible before any relay answers').toBeVisible();
    await expect(panel(page).locator('.member-search-loading'), 'loading indicator while in flight').toBeVisible();
    await expect(candidate(page), 'candidate replaces the loading state').toBeVisible({ timeout: 10_000 });
    await expect(panel(page).locator('.member-search-loading')).toHaveCount(0);
  });

  // T6 — ADR Option B: flat parallel fan-out incl. nprofile hints; progressive resolve upgrades.
  test('fan-out hits membership pair + profile relays + nprofile hints; newer profile upgrades the card', async ({ page }) => {
    const profiles = defaultProfiles();
    profiles[OUTSIDER] = [
      { meta: { display_name: 'Olive (stale)' }, created_at: 1000, relay: 'wss://purplepag.es' },
      { meta: { display_name: 'Olive (fresh)' }, created_at: 2000, relay: 'wss://relay.damus.io', delayMs: 1500 },
    ];
    await openMembers(page, { profiles });
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, OUTSIDER_NPROFILE);

    // First paint from the fast relay…
    await expect(candidate(page).locator('.member-name')).toHaveText('Olive (stale)');
    // …upgraded when the strictly newer profile lands.
    await expect(candidate(page).locator('.member-name')).toHaveText('Olive (fresh)', { timeout: 10_000 });

    const calls = await profileCallsFor(page, OUTSIDER);
    const relaysHit = [...new Set(calls.map(c => c.relay))];
    for (const r of [...MEMBERSHIP_RELAYS, ...PROFILE_RELAY_URLS, 'wss://hint-a.example.com', 'wss://hint-b.example.com']) {
      expect(relaysHit, `fan-out contacted ${r}`).toContain(r);
    }
    // Parallel, not staged: every relay's call recorded within one tick-window of the first.
    const times = calls.map(c => c.t);
    expect(Math.max(...times) - Math.min(...times), 'all queries issued together (no second stage)').toBeLessThan(500);
  });

  // T7
  test('pending candidate: Pending badge, vouch offered', async ({ page }) => {
    await openMembers(page);
    await search(page, PEND_NPUB);
    await expect(badge(page)).toHaveText(/Pending/i);
    await expect(vouchBtn(page)).toHaveText(/Vouch/);
  });

  // T8
  test('already-verified candidate: ✓ Member badge, no vouch action', async ({ page }) => {
    await openMembers(page);
    await search(page, ME_NPUB);
    await expect(badge(page)).toHaveText(/✓ Member/);
    await expect(vouchBtn(page), 'status only — never an action on an existing member').toHaveCount(0);
  });

  // T9 — AMENDED (PO rollback of O3, 2026-07-31): a profile-less candidate renders with
  // its short npub in the name slot, NO "no profile found" copy, and IS vouchable like
  // any other valid key. The no-negative-cache rule stands: re-search re-queries.
  test('no profile anywhere → npub-only row, vouchable, no special copy; re-search re-queries', async ({ page }) => {
    await openMembers(page);
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, GHOST_NPUB);
    await expect(candidate(page)).toBeVisible({ timeout: 15_000 });
    // Row format (2026-07-31 amendment): no npub row — the name slot carries the short
    // npub fallback so the member still sees which key they looked up.
    await expect(candidate(page).locator('.member-name')).toHaveText(shortNpub(GHOST));
    // PO warning copy (2026-07-31) — verbatim incl. the ⚠️ prefix (PO hand-edit),
    // replaces the old view-only outreach copy.
    await expect(candidate(page).locator('.candidate-warning'))
      .toHaveText('⚠️ This profile is missing visible profile metadata. Double check that you know and trust the owner of this pubkey.');
    await expect(candidate(page), 'old view-only copy gone').not.toContainText(/no profile found/i);
    await expect(badge(page)).toHaveText(/Not a member/i);
    await expect(vouchBtn(page), 'profile-less candidates are vouchable').toHaveText(/Vouch/);

    const first = (await profileCallsFor(page, GHOST)).length;
    expect(first, 'the miss actually queried relays').toBeGreaterThan(0);
    await search(page, '');
    await search(page, GHOST_NPUB);
    await expect(candidate(page)).toBeVisible({ timeout: 15_000 });
    const second = (await profileCallsFor(page, GHOST)).length;
    expect(second, 'a miss is not negative-cached — re-search re-queries').toBeGreaterThan(first);
  });

  // T10 — the write path from the panel + post-vouch coherence.
  test('vouch from the panel publishes the exact LFO attestation and the UI reflects it', async ({ page }) => {
    await openMembers(page);
    const verifiedBefore = await page.locator('#verified-members-grid .member-card').count();
    await search(page, OUTSIDER_NPUB);
    await vouchBtn(page).click();

    await expect(badge(page), 'panel badge flips to member').toHaveText(/✓ Member/, { timeout: 10_000 });

    const signed = await page.evaluate(() => window.__signed);
    expect(signed.length, 'exactly one unsigned event handed to the signer').toBe(1);
    const ev = signed[0];
    expect(ev.kind).toBe(39999);
    expect(ev.tags).toContainEqual(['d', `profile-tag-lfo-${OUTSIDER.slice(0, 8)}-${ME.slice(0, 8)}`]);
    expect(ev.tags).toContainEqual(['e', LFO_TAG_EVENT_ID]);
    expect(ev.tags).toContainEqual(['z', NOSTR_USER_TAG_ADDR]);
    expect(ev.tags).toContainEqual(['p', OUTSIDER]);
    expect(ev.tags).toContainEqual(['polarity', '1']);

    const published = await page.evaluate(() => window.__published);
    expect(published.length, 'published to the membership relays').toBeGreaterThanOrEqual(1);
    expect(published.map(p => p.relay), 'brainstorm is a publish target').toContain(MEMBERSHIP_RELAYS[0]);
    expect(published[0].event.sig, 'the SIGNED event goes out').toBeTruthy();

    await expect(page.locator('#verified-members-grid .member-card'), 'verified grid gains the new member')
      .toHaveCount(verifiedBefore + 1, { timeout: 10_000 });
    await expect(page.locator('#verified-members-grid'), 'the vouched candidate appears in the grid')
      .toContainText('Olive Outsider');
  });

  // T11
  test('signer declined → nothing published, vouch button restored; relay reject → page intact', async ({ page }) => {
    await openMembers(page, { signThrows: true });
    await search(page, OUTSIDER_NPUB);
    await vouchBtn(page).click();
    expect(await page.evaluate(() => window.__published.length), 'decline publishes nothing').toBe(0);
    await expect(vouchBtn(page), 'button restored after decline').toBeVisible({ timeout: 10_000 });
    await expect(badge(page), 'status unchanged').toHaveText(/Not a member/i);
  });

  // T12 — AMENDED for story #2 (test plan 2-freetext-search-house-pov, 2026-08-02): the
  // original assertion pinned the "not a recognized identity" dead-end hint for ANY
  // non-identity input; story #2 removes that dead end by design (≥2 chars becomes free-text
  // search — covered by T15–T27). Re-pinned as BELOW-MINIMUM integrity: a 1-char input fires
  // no backend traffic of any kind and leaves the page untouched. Green before and after #2.
  test('below-minimum input → zero relay fan-out, zero search requests, grids untouched', async ({ page }) => {
    const searchCalls = await stubOreSearch(page, () => ({ body: oreSearchResponse([]) }));
    await openMembers(page);
    const gridBefore = await page.locator('#verified-members-grid').innerHTML();
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, 'g');
    await page.waitForTimeout(800); // outlast the debounce — nothing should have fired
    await expect(candidate(page)).toHaveCount(0);
    const kind0Calls = await page.evaluate(() => window.__relayCalls.filter(c => c.filter.kinds?.includes(0)).length);
    expect(kind0Calls, 'no relay traffic below the minimum length').toBe(0);
    expect(searchCalls.length, 'no search-backend traffic below the minimum length').toBe(0);
    expect(await page.locator('#verified-members-grid').innerHTML(), 'grid untouched').toBe(gridBefore);
  });

  // T13
  test('Escape dismisses the overlay panel and the page beneath is byte-identical', async ({ page }) => {
    await openMembers(page);
    const gridBefore = await page.locator('#verified-members-grid').innerHTML();
    await search(page, OUTSIDER_NPUB);
    await expect(candidate(page)).toBeVisible();
    expect(await panel(page).evaluate(el => getComputedStyle(el).position), 'panel is an overlay (no grid reflow)').toBe('absolute');
    await input(page).press('Escape');
    await expect(panel(page), 'Escape closes the panel').toBeHidden();
    expect(await page.locator('#verified-members-grid').innerHTML(), 'grid DOM unchanged by the whole interaction').toBe(gridBefore);
  });

  // T14 — REGRESSION (green today, must stay green): the pending-grid vouch flow survives the
  // publishVouch extraction byte-identically.
  test('pending-grid vouch still works end-to-end (regression for the publishVouch refactor)', async ({ page }) => {
    await openMembers(page);
    const pendingCard = page.locator('#pending-members-grid .member-card', { hasText: 'Pat Pending' });
    await expect(pendingCard).toBeVisible();
    const verifiedBefore = await page.locator('#verified-members-grid .member-card').count();

    await pendingCard.locator('.attest-btn').click();

    expect(await page.evaluate(() => window.__signed.length), 'grid vouch signs one event').toBe(1);
    const ev = await page.evaluate(() => window.__signed[0]);
    expect(ev.tags).toContainEqual(['d', `profile-tag-lfo-${PENDING.slice(0, 8)}-${ME.slice(0, 8)}`]);
    expect(ev.tags).toContainEqual(['p', PENDING]);

    await expect(page.locator('#verified-members-grid .member-card'), 'card moves pending → verified')
      .toHaveCount(verifiedBefore + 1, { timeout: 10_000 });
    await expect(page.locator('#verified-members-grid')).toContainText('Pat Pending');
    await expect(page.locator('#pending-members-grid .member-card', { hasText: 'Pat Pending' })).toHaveCount(0);
  });
});

/* ═══════ Story #2 free-text panel — re-pinned to the ORE backend by story #6 (ADR 0045) ═══════
   Seam contract (test plan 6-search-ore-migration):
     Request: POST ORE_HOST/search/pubkeys {query, algorithm:'relevance-pov',
       pov:<HOUSE_POV.pubkey>, limit:6}. Fires live at ≥2 chars (no Enter); never below 2;
       never for decodable identities; the retired meili proxy is never called.
     Rows: up to 6 × .member-card.candidate in SERVED order (no client re-sort); profile
       fields joined from the wide relay set (newest-wins, no negative cache); chips from
       the /rank/pubkeys batch as round(rank×100); rank-less rows chipless IN PLACE;
       profile-less rows render per story-#1 rules (short npub, ⚠️ warning, vouchable).
     States: .member-search-empty | .member-search-unavailable (copy prompts npub / hex /
       nprofile — PO O2) | .member-search-footnote. Rank-batch failure → chipless rows,
       never the unavailable state. Stale responses never paint. */

const ROW = (page) => page.locator('#member-search-panel .member-card.candidate');
const rowByName = (page, name) => ROW(page).filter({ hasText: name });
const rowScores = (page) => page.$$eval(
  '#member-search-panel .member-card.candidate .candidate-trust-score',
  els => els.map(e => parseInt(e.textContent.match(/\d+/)?.[0] ?? 'NaN', 10)),
);

const FX = {
  A: '55'.repeat(32), B: '66'.repeat(32), C: '77'.repeat(32), D: '88'.repeat(32),
  E: '99'.repeat(32), F: 'aa'.repeat(32), G: 'bb'.repeat(32), H: 'cc'.repeat(32),
};

// Profiles for FX pubkeys, served by the openMembers queryRelay stub — post-#6 the
// panel's profile fields come from the relay join, not from the search response.
function fxProfiles(names) {
  const profiles = defaultProfiles();
  for (const [key, name] of Object.entries(names)) {
    profiles[FX[key]] = [{ meta: { display_name: name }, created_at: 1000 }];
  }
  return profiles;
}

const rowNames = (page) =>
  page.$$eval('#member-search-panel .member-card.candidate .member-name', els => els.map(e => e.textContent));

test.describe('free-text search — ranked candidates from the house POV (npub-search #2)', () => {
  // T15
  test('one char never queries the backend; two chars fire live without Enter', async ({ page }) => {
    const calls = await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000]]) }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });

    await search(page, 'l');
    await page.waitForTimeout(800); // outlast the debounce
    expect(calls.length, 'below-minimum input must never reach the backend').toBe(0);
    await expect(ROW(page)).toHaveCount(0);

    await search(page, 'li');       // no Enter, no button — live debounced trigger
    await expect.poll(() => calls.length, { message: 'a 2-char query fires the search live' }).toBeGreaterThan(0);
  });

  // T16 — re-pinned by #6: the ORE request contract, the shared host, and the no-meili guard.
  test('fall-through fork: free text sends the pinned ORE contract; identities and meili never involved', async ({ page }) => {
    const calls = await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000]]) }));
    const rankCalls = await stubRankApi(page, () => ({
      body: { results: [{ pubkey: FX.A, rank: 0.53 }], ttl: 3600 },
    }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });

    await search(page, 'liz');
    await expect.poll(() => calls.length, { message: 'free text reaches ORE search' }).toBe(1);
    const req = calls[0];
    expect(req.query, 'query carries the raw input').toBe('liz');
    expect(req.algorithm, 'personalized relevance algorithm').toBe('relevance-pov');
    expect(req.pov, 'pov is the HOUSE_POV pubkey, in the JSON body').toBe(HOUSE_HEX);
    expect(req.limit, 'limit=6 exactly — served order is trusted, no headroom').toBe(6);
    expect(req._url.startsWith(ORE_HOST + '/'), `search served from ${ORE_HOST}`).toBe(true);
    await expect(ROW(page)).toHaveCount(1);

    // Chips ride the shared rank batch — and it must live on the same host (PO O3;
    // this is the assertion that moves story #4's shipped URL).
    await expect.poll(() => rankCalls.length, { message: 'rank batch fired' }).toBeGreaterThan(0);
    expect(rankCalls[rankCalls.length - 1]._url.startsWith(ORE_HOST + '/'),
      `rank batch served from ${ORE_HOST}`).toBe(true);

    await expect(page.locator('#page-members .member-search-hint'),
      'the dead-end hint stays gone for searchable input').toBeHidden();

    // Identity fast path: unchanged, and it must NOT consult ORE search.
    await search(page, OUTSIDER_NPUB);
    await expect(rowByName(page, 'Olive Outsider'), 'identity flow still renders its single candidate').toHaveCount(1);
    expect(calls.length, 'no ORE-search request for a decodable identity').toBe(1);

    expect(page.__meiliCalls.length, 'the retired meili proxy is never called').toBe(0);
  });

  // T17 — re-pinned by #6: SERVED order is render order. Chip values are deliberately
  // non-monotonic (fused search order ≠ graperank chip order) so any surviving client
  // re-sort would break this test.
  test('six rows in ORE served order; chips from the rank batch, never from search ranks', async ({ page }) => {
    await stubOreSearch(page, () => ({
      body: oreSearchResponse([[FX.A, 18000], [FX.B, 12000], [FX.C, 9000], [FX.D, 7000], [FX.E, 5000], [FX.F, 2000]]),
    }));
    await stubRankApi(page, () => ({
      body: { results: [
        { pubkey: FX.A, rank: 0.72 }, { pubkey: FX.B, rank: 0.95 }, { pubkey: FX.C, rank: 0.31 },
        { pubkey: FX.D, rank: 0.88 }, { pubkey: FX.E, rank: 0.05 }, { pubkey: FX.F, rank: 0.60 },
      ], ttl: 3600 },
    }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada', B: 'Bea', C: 'Cleo', D: 'Dot', E: 'Etta', F: 'Fern' }) });
    await search(page, 'liz');

    await expect(ROW(page), 'six rows').toHaveCount(6);
    expect(await rowNames(page), 'rows follow ORE served order even though chips are non-monotonic')
      .toEqual(['Ada', 'Bea', 'Cleo', 'Dot', 'Etta', 'Fern']);
    expect(await rowScores(page), 'chips are round(rank×100) from the rank batch, in served order')
      .toEqual([72, 95, 31, 88, 5, 60]);
  });

  // T18
  test('per-row membership: ✓ Member (no vouch) / Pending (vouch) / Not a member (vouch)', async ({ page }) => {
    await stubOreSearch(page, () => ({
      body: oreSearchResponse([[ME, 9000], [PENDING, 8000], [FX.A, 7000]]),
    }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(3);

    await expect(rowByName(page, 'Mae Member').locator('.member-badge')).toHaveText(/✓ Member/);
    await expect(rowByName(page, 'Mae Member').locator('.attest-btn'), 'no vouch action on a member').toHaveCount(0);
    await expect(rowByName(page, 'Pat Pending').locator('.member-badge')).toHaveText(/Pending/i);
    await expect(rowByName(page, 'Pat Pending').locator('.attest-btn')).toHaveText(/Vouch/);
    await expect(rowByName(page, 'Ada').locator('.member-badge')).toHaveText(/Not a member/i);
    await expect(rowByName(page, 'Ada').locator('.attest-btn')).toHaveText(/Vouch/);
  });

  // T19 — re-pinned by #6: rank-less ≠ reordered. Ordering belongs to ORE; a hit the
  // rank batch doesn't know keeps its served position and simply has no chip.
  test('a hit missing from the rank batch renders chipless in its served position', async ({ page }) => {
    await stubOreSearch(page, () => ({
      body: oreSearchResponse([[FX.A, 9000], [FX.G, 8000], [FX.B, 7000]]),
    }));
    await stubRankApi(page, () => ({
      body: { results: [{ pubkey: FX.A, rank: 0.80 }, { pubkey: FX.B, rank: 0.40 }], ttl: 3600 },
    }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada', B: 'Bea', G: 'Gwen' }) });
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(3);
    expect(await rowNames(page), 'served order kept — the rank-less row is NOT pushed last')
      .toEqual(['Ada', 'Gwen', 'Bea']);
    await expect(rowByName(page, 'Gwen').locator('.candidate-trust-score'), 'no chip without a rank').toHaveCount(0);
    expect(await rowScores(page), 'scored rows chip in served order').toEqual([80, 40]);
  });

  // T20
  test('identity-search encouragement copy renders beneath results and in the empty state', async ({ page }) => {
    let empty = false;
    await stubOreSearch(page, () => ({ body: oreSearchResponse(empty ? [] : [[FX.A, 9000]]) }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(1);
    const foot = page.locator('#member-search-panel .member-search-footnote');
    await expect(foot, 'encouragement copy under results').toBeVisible();
    for (const form of [/npub/i, /hex/i, /nprofile/i]) {
      await expect(foot, `copy names ${form}`).toContainText(form);
    }

    empty = true;
    await search(page, 'lizzz');
    await expect(page.locator('#member-search-panel .member-search-empty')).toBeVisible();
    await expect(page.locator('#member-search-panel .member-search-footnote'),
      'encouragement copy also in the empty state').toBeVisible();
  });

  // T21
  test('vouching one row publishes the story-#1 wire shape for that pubkey; sibling rows untouched', async ({ page }) => {
    await stubOreSearch(page, () => ({
      body: oreSearchResponse([[FX.A, 9000], [FX.B, 8000], [FX.C, 7000]]),
    }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada', B: 'Bea', C: 'Cleo' }) });
    const verifiedBefore = await page.locator('#verified-members-grid .member-card').count();
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(3);
    const adaBefore  = await rowByName(page, 'Ada').innerHTML();
    const cleoBefore = await rowByName(page, 'Cleo').innerHTML();

    await rowByName(page, 'Bea').locator('.attest-btn').click();
    await expect(rowByName(page, 'Bea').locator('.member-badge'), 'vouched row flips to member').toHaveText(/✓ Member/, { timeout: 10_000 });

    const signed = await page.evaluate(() => window.__signed);
    expect(signed.length, 'exactly one event signed').toBe(1);
    expect(signed[0].kind).toBe(39999);
    expect(signed[0].tags).toContainEqual(['d', `profile-tag-lfo-${FX.B.slice(0, 8)}-${ME.slice(0, 8)}`]);
    expect(signed[0].tags).toContainEqual(['e', LFO_TAG_EVENT_ID]);
    expect(signed[0].tags).toContainEqual(['z', NOSTR_USER_TAG_ADDR]);
    expect(signed[0].tags).toContainEqual(['p', FX.B]);
    expect(signed[0].tags).toContainEqual(['polarity', '1']);
    expect((await page.evaluate(() => window.__published)).map(p => p.relay),
      'published with brainstorm among targets').toContain(MEMBERSHIP_RELAYS[0]);

    expect(await rowByName(page, 'Ada').innerHTML(), 'row above the vouched one untouched').toBe(adaBefore);
    expect(await rowByName(page, 'Cleo').innerHTML(), 'row below the vouched one untouched').toBe(cleoBefore);
    await expect(page.locator('#verified-members-grid .member-card'), 'verified grid gains the vouched candidate')
      .toHaveCount(verifiedBefore + 1, { timeout: 10_000 });
    await expect(page.locator('#verified-members-grid')).toContainText('Bea');
  });

  // T22
  test('loading state while in flight; Escape, clear, and click-outside dismiss; grid byte-identical', async ({ page }) => {
    await stubOreSearch(page, () => ({ delayMs: 1200, body: oreSearchResponse([[FX.A, 9000]]) }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });
    const gridBefore = await page.locator('#verified-members-grid').innerHTML();

    await search(page, 'liz');
    await expect(panel(page), 'panel opens before the response').toBeVisible();
    await expect(panel(page).locator('.member-search-loading'), 'loading state — never a blank panel').toBeVisible();
    await expect(ROW(page)).toHaveCount(1, { timeout: 10_000 });
    expect(await panel(page).evaluate(el => getComputedStyle(el).position), 'panel is an overlay').toBe('absolute');

    await input(page).press('Escape');
    await expect(panel(page), 'Escape dismisses').toBeHidden();

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(1, { timeout: 10_000 });
    await search(page, '');
    await expect(panel(page), 'clearing the input dismisses').toBeHidden();

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(1, { timeout: 10_000 });
    // Click a target OUTSIDE .member-search that the dropdown never covers (the h2
    // below the search block sits under the open overlay and intercepts the click).
    await page.locator('#page-members .telegram-row').click();
    await expect(panel(page), 'click outside dismisses').toBeHidden();

    expect(await page.locator('#verified-members-grid').innerHTML(),
      'grid DOM byte-identical after searches and dismissals').toBe(gridBefore);
  });

  // T23
  test('no matches → a real empty state, not a blank panel and not the identity dead-end hint', async ({ page }) => {
    await stubOreSearch(page, () => ({ body: oreSearchResponse([]) }));
    await openMembers(page);
    await search(page, 'zzq');
    const emptyEl = page.locator('#member-search-panel .member-search-empty');
    await expect(emptyEl, 'empty state rendered').toBeVisible();
    expect((await emptyEl.textContent()).trim().length, 'empty state carries copy').toBeGreaterThan(0);
    await expect(emptyEl).not.toContainText(/not a recognized identity/i);
    await expect(ROW(page)).toHaveCount(0);
  });

  // T24 — re-pinned by #6: the unavailable copy must prompt identity search (PO O2).
  test('backend failure → unavailable state prompting npub/hex/nprofile; retyping when healthy retries', async ({ page }) => {
    let healthy = false;
    await stubOreSearch(page, () => healthy
      ? { body: oreSearchResponse([[FX.A, 9000]]) }
      : { status: 503, body: { detail: 'unavailable' } });
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });

    await search(page, 'liz');
    const unavailable = page.locator('#member-search-panel .member-search-unavailable');
    await expect(unavailable, 'unavailable state on backend failure').toBeVisible();
    for (const form of [/npub/i, /hex/i, /nprofile/i]) {
      await expect(unavailable, `unavailable copy prompts ${form}`).toContainText(form);
    }
    await expect(ROW(page)).toHaveCount(0);

    healthy = true;
    await search(page, 'lizz');   // retry = just typing
    await expect(ROW(page), 'recovery on the next keystrokes').toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('#member-search-panel .member-search-unavailable')).toHaveCount(0);
  });

  // T25
  test('stale responses never paint: a slow query is superseded by a fast retype', async ({ page }) => {
    await stubOreSearch(page, (body) => body.query === 'slow'
      ? { delayMs: 2000, body: oreSearchResponse([[FX.G, 9000]]) }
      : { body: oreSearchResponse([[FX.A, 8000]]) });
    await openMembers(page, { profiles: fxProfiles({ A: 'Fast Result', G: 'Slow Result' }) });

    await search(page, 'slow');
    await page.waitForTimeout(600);          // let the slow request actually launch
    await search(page, 'liz');
    await expect(rowByName(page, 'Fast Result')).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(2500);         // outlast the slow response
    await expect(rowByName(page, 'Slow Result'), 'the stale response must never overwrite').toHaveCount(0);
    await expect(rowByName(page, 'Fast Result'), 'the latest query keeps the panel').toHaveCount(1);
  });

  // T26 — REPLACED by #6. The old povResolution-warn case is obsolete: ORE carries no
  // observer echo to guard on (ADR 0045 consciously gives that auditability up). What
  // needs pinning instead: chips are decoration — a rank-batch failure degrades to
  // chipless rows, never to the unavailable state.
  test('rank-batch failure during search → rows render chipless, search unaffected', async ({ page }) => {
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000], [FX.B, 8000]]) }));
    await stubRankApi(page, () => ({ abort: true }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada', B: 'Bea' }) });
    await search(page, 'liz');

    await expect(ROW(page), 'rows render despite the rank failure').toHaveCount(2);
    expect(await rowNames(page), 'served order intact').toEqual(['Ada', 'Bea']);
    await expect(page.locator('#member-search-panel .candidate-trust-score'), 'no chips').toHaveCount(0);
    await expect(page.locator('#member-search-panel .member-search-unavailable'),
      'a chip failure is not a search failure').toHaveCount(0);
  });

  // T27 — re-pinned by #6: metadata-join semantics. The join seeds the shared cache and
  // is newest-wins — an OLDER relay event never clobbers a newer cached profile.
  // (Supersedes the meili path's absent-only rule.)
  test('metadata join seeds _metaCache newest-wins; newer cached profiles survive the join', async ({ page }) => {
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000], [ME, 8000]]) }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada Fresh' }) });
    // ME's cached profile is NEWER than anything the relay stub serves (created_at 1000).
    await page.evaluate((me) => { _metaCache.set(me, { display_name: 'Mae Newer', _ts: 5000 }); }, ME);

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(2);
    await expect(rowByName(page, 'Mae Newer'), 'row renders the newer cached profile').toHaveCount(1);

    const cached = await page.evaluate(({ a, me }) => ({
      ada: _metaCache.get(a) || null,
      mae: _metaCache.get(me) || null,
    }), { a: FX.A, me: ME });
    expect(cached.ada?.display_name, 'join seeded the fresh profile into _metaCache').toBe('Ada Fresh');
    expect(cached.mae?.display_name, 'older relay event did not clobber the newer cache entry').toBe('Mae Newer');
  });

  // T27b — NEW in #6: a profile-less ORE result is not dropped — it renders per the
  // story-#1 rules — and the join fans out to the full wide relay set without
  // negative-caching misses.
  test('profile-less result → npub row, warning, vouchable; wide fan-out; re-search re-queries', async ({ page }) => {
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000], [GHOST, 8000]]) }));
    await openMembers(page, { profiles: fxProfiles({ A: 'Ada' }) });   // GHOST: no kind-0 anywhere
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, 'liz');

    await expect(ROW(page), 'both rows render — profile-less is not dropped').toHaveCount(2, { timeout: 15_000 });
    const ghostRow = rowByName(page, shortNpub(GHOST));
    await expect(ghostRow.locator('.member-name'), 'short npub in the name slot').toHaveText(shortNpub(GHOST));
    await expect(ghostRow.locator('.candidate-warning'))
      .toHaveText('⚠️ This profile is missing visible profile metadata. Double check that you know and trust the owner of this pubkey.');
    await expect(ghostRow.locator('.attest-btn'), 'profile-less candidates stay vouchable').toHaveText(/Vouch/);

    const calls = await profileCallsFor(page, GHOST);
    const relaysHit = [...new Set(calls.map(c => c.relay))];
    for (const r of [...MEMBERSHIP_RELAYS, ...PROFILE_RELAY_URLS]) {
      expect(relaysHit, `join contacted ${r}`).toContain(r);
    }
    const first = calls.length;
    await search(page, '');
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(2, { timeout: 15_000 });
    expect((await profileCallsFor(page, GHOST)).length, 'misses are not negative-cached — re-search re-queries')
      .toBeGreaterThan(first);
  });
});

// Grid fixtures shared by blocks 3 and 4 (hoisted by story #3's test plan):
// 4 verified (ME, V2, V3, V4) + 2 pending (PENDING, P2) members.
const V2 = 'dd'.repeat(32), V3 = 'ee'.repeat(32), V4 = 'f1'.repeat(32), P2 = 'ab'.repeat(32);

function bigGridSetup() {
  const profiles = defaultProfiles();
  profiles[V2] = [{ meta: { display_name: 'Vera Two' },   created_at: 1000 }];
  profiles[V3] = [{ meta: { display_name: 'Vike Three' }, created_at: 1000 }];
  profiles[V4] = [{ meta: { display_name: 'Vin Four' },   created_at: 1000 }];
  profiles[P2] = [{ meta: { display_name: 'Pia Second' }, created_at: 1000 }];
  const extraTagItems = [
    { kind: 39999, pubkey: SEED, tags: [['p', V2]], created_at: 3, id: 'a3'.repeat(32) },
    { kind: 39999, pubkey: SEED, tags: [['p', V3]], created_at: 4, id: 'a4'.repeat(32) },
    { kind: 39999, pubkey: SEED, tags: [['p', V4]], created_at: 5, id: 'a5'.repeat(32) },
    { kind: 39999, pubkey: P2,   tags: [['p', P2]], created_at: 6, id: 'a6'.repeat(32) },
  ];
  return { profiles, extraTagItems };
}

const gridNames = (page, grid) =>
  page.$$eval(`#${grid} .member-card .member-name`, els => els.map(e => e.textContent));

/* ═══════════════════════════ Story #4 mini (ADR 0043) ═══════════════════════════
   House-POV trust scores on the member-grid cards, from ONE batch POST to ORE
   /rank/pubkeys (graperank-pov, pov = HOUSE_POV.pubkey). Chips show
   round(rank × 100) in the story-#2 format. Enhancement-only: any backend failure
   leaves the page exactly as before this story. T28/T30 are RED until the batch
   fetch + patch land; T29 is the failure-mode guard (green before AND after). */

// Stub the ORE batch-rank endpoint. `respond(body, nthCall)` → { body, status?, abort? }.
// Returns the node-side call log (parsed POST bodies). Sets the flag openMembers checks
// so its default empty stub is NOT layered on top of (and shadowing) this one.
async function stubRankApi(page, respond) {
  page.__rankStubbed = true;
  const calls = [];
  await page.route('**/rank/pubkeys', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ ...body, _url: route.request().url() });
    const r = (typeof respond === 'function' ? await respond(body, calls.length) : respond) || {};
    if (r.abort) return route.abort('failed');
    return route.fulfill({
      status: r.status ?? 200,
      headers: { 'Access-Control-Allow-Origin': '*', ...(r.headers || {}) },
      json: r.body ?? { results: [], ttl: 3600 },
    });
  });
  return calls;
}

const gridCard = (page, grid, name) => page.locator(`#${grid} .member-card`, { hasText: name });
const gridChips = (page) => page.locator('#verified-members-grid .candidate-trust-score, #pending-members-grid .candidate-trust-score');

test.describe('member-card trust scores — house POV via ORE batch (npub-search #4)', () => {
  // T28
  test('one batch POST with the pinned contract; both grid cards chip round(rank*100)', async ({ page }) => {
    const calls = await stubRankApi(page, () => ({
      body: { results: [
        { pubkey: ME, rank: 0.9647637273332996 },
        { pubkey: PENDING, rank: 0.4512 },
      ], ttl: 3600 },
    }));
    await openMembers(page);

    await expect(gridCard(page, 'verified-members-grid', 'Mae Member').locator('.candidate-trust-score'),
      'verified card chips the house score').toHaveText('🏅 96', { timeout: 10_000 });
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.candidate-trust-score'),
      'pending card chips the house score').toHaveText('🏅 45');

    // AMENDED by story #3 (test plan 3-personalized-pov-ranking): the readiness probe
    // shares this glob — count only chip-shaped batches (probe = member pov + curator
    // in the target set). Green before AND after #3's implementation.
    // Story #8: readiness probes (both perspectives) are [pov, CURATOR] pairs and are NOT
    // chip batches. Filter them out by shape so this still counts what it claims to count.
    const isReadinessProbe = (c) => (c.pubkeys || []).length === 2 && (c.pubkeys || []).includes(CURATOR);
    const chipCalls = calls.filter(c => !isReadinessProbe(c));
    expect(chipCalls.length, 'exactly one chip batch request per load').toBe(1);
    const body = chipCalls[0];
    expect(body.algorithm, 'personalized graperank algorithm').toBe('graperank-pov');
    expect(body.pov, 'POV is the HOUSE_POV config pubkey').toBe(HOUSE_HEX);
    expect(new Set(body.pubkeys), 'batch covers exactly the grid pubkeys').toEqual(new Set([ME, PENDING]));

    // Display-only: the same two cards, nothing reordered or removed.
    await expect(page.locator('#verified-members-grid .member-card')).toHaveCount(1);
    await expect(page.locator('#pending-members-grid .member-card')).toHaveCount(1);
  });

  // T29 — failure-mode guard: green before AND after implementation.
  test('score backend unreachable → page renders exactly as today: cards, vouch, zero chips', async ({ page }) => {
    await stubRankApi(page, () => ({ abort: true }));
    await openMembers(page);

    await expect(gridCard(page, 'verified-members-grid', 'Mae Member'), 'verified card renders').toBeVisible();
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending'), 'pending card renders').toBeVisible();
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.attest-btn'),
      'vouch flow untouched by score failure').toBeVisible();
    await page.waitForTimeout(600); // give a (wrong) late chip patch time to appear
    await expect(gridChips(page), 'no chips and no error state — enhancement only').toHaveCount(0);
  });

  // T30
  test('a pubkey missing from the results renders chipless; scored siblings still chip', async ({ page }) => {
    await stubRankApi(page, () => ({
      body: { results: [{ pubkey: ME, rank: 0.88 }], ttl: 3600 },
    }));
    await openMembers(page);

    await expect(gridCard(page, 'verified-members-grid', 'Mae Member').locator('.candidate-trust-score'),
      'scored member chips').toHaveText('🏅 88', { timeout: 10_000 });
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.candidate-trust-score'),
      'unscored member stays chipless').toHaveCount(0);
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.member-badge'),
      'rest of the chipless card intact').toHaveText(/Pending/i);
  });

  /* Story #5 (ADR 0044): grids render highest-trust first (upper-left = DOM index 0),
     score-less last in insertion order, POV-agnostic. T31 is RED until the re-sort
     lands; T32 guards the no-scores path (insertion order preserved — green
     before AND after). bigGridSetup/gridNames live at module scope (hoisted by
     story #3's test plan for reuse in the view-toggle block). */

  // T31
  test('grids render highest trust upper-left: rank-desc order, score-less last, per grid', async ({ page }) => {
    await stubRankApi(page, () => ({
      body: { results: [
        { pubkey: ME, rank: 0.50 },
        { pubkey: V2, rank: 0.91 },
        { pubkey: V3, rank: 0.73 },
        // V4 deliberately unscored
        { pubkey: PENDING, rank: 0.20 },
        { pubkey: P2, rank: 0.60 },
      ], ttl: 3600 },
    }));
    await openMembers(page, bigGridSetup());

    await expect.poll(() => gridNames(page, 'verified-members-grid'),
      { message: 'verified grid sorts rank-desc with the score-less member last' })
      .toEqual(['Vera Two', 'Vike Three', 'Mae Member', 'Vin Four']);
    await expect.poll(() => gridNames(page, 'pending-members-grid'),
      { message: 'pending grid sorts rank-desc independently' })
      .toEqual(['Pia Second', 'Pat Pending']);

    // Ordering decorated, nothing lost: same cards, chips on every scored member.
    await expect(page.locator('#verified-members-grid .member-card')).toHaveCount(4);
    await expect(gridCard(page, 'verified-members-grid', 'Vin Four').locator('.candidate-trust-score'),
      'unscored member has no chip and sits last').toHaveCount(0);
  });

  // T32 — guard (green before AND after): no scores → insertion order untouched.
  test('no scores → grids keep member-set insertion order', async ({ page }) => {
    await stubRankApi(page, () => ({ body: { results: [], ttl: 3600 } }));
    await openMembers(page, bigGridSetup());

    await expect(page.locator('#verified-members-grid .member-card')).toHaveCount(4);
    await page.waitForTimeout(400); // give a (wrong) late re-sort time to happen
    expect(await gridNames(page, 'verified-members-grid'),
      'insertion order preserved without scores').toEqual(['Mae Member', 'Vera Two', 'Vike Three', 'Vin Four']);
    expect(await gridNames(page, 'pending-members-grid')).toEqual(['Pat Pending', 'Pia Second']);
  });

  const AMEND_SCORES = [
    { pubkey: ME, rank: 0.50 },
    { pubkey: V2, rank: 0.91 },
    { pubkey: V3, rank: 0.73 },
    // V4 unscored
    { pubkey: PENDING, rank: 0.85 },
    { pubkey: P2, rank: 0.60 },
    { pubkey: FX.B, rank: 0.80 },
  ];

  // T33 — story #5 amendment (grid path): the pending-grid vouch's surgical card move
  // must land the new member in SORTED position, chipped — not prepended upper-left.
  test('pending-grid vouch → new verified card slots into rank order with its chip', async ({ page }) => {
    await stubRankApi(page, () => ({ body: { results: AMEND_SCORES, ttl: 3600 } }));
    await openMembers(page, bigGridSetup());
    await expect.poll(() => gridNames(page, 'verified-members-grid'))
      .toEqual(['Vera Two', 'Vike Three', 'Mae Member', 'Vin Four']);

    await gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.attest-btn').click();

    // Pat (.85) belongs between Vera (.91) and Vike (.73) — never first-by-default.
    await expect.poll(() => gridNames(page, 'verified-members-grid'),
      { message: 'vouched member sorts into place instead of prepending' })
      .toEqual(['Vera Two', 'Pat Pending', 'Vike Three', 'Mae Member', 'Vin Four']);
    await expect(gridCard(page, 'verified-members-grid', 'Pat Pending').locator('.candidate-trust-score'),
      'moved card carries its chip').toHaveText('🏅 85');
  });

  // T34 — story #5 amendment (panel path): pin that the search-panel vouch also lands
  // the new member sorted (it re-renders via loadMembersPage — green before and after).
  test('search-panel vouch → new verified card slots into rank order', async ({ page }) => {
    await stubRankApi(page, () => ({ body: { results: AMEND_SCORES, ttl: 3600 } }));
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.B, 9000]]) }));
    const setup = bigGridSetup();   // story #6 re-point: Bea's profile now comes from the relay join
    setup.profiles[FX.B] = [{ meta: { display_name: 'Bea' }, created_at: 1000 }];
    await openMembers(page, setup);
    await expect.poll(() => gridNames(page, 'verified-members-grid'))
      .toEqual(['Vera Two', 'Vike Three', 'Mae Member', 'Vin Four']);

    await search(page, 'liz');
    await rowByName(page, 'Bea').locator('.attest-btn').click();

    await expect.poll(() => gridNames(page, 'verified-members-grid'),
      { message: 'panel-vouched member sorts into place (Bea .80 between Vera .91 and Vike .73)' })
      .toEqual(['Vera Two', 'Bea', 'Vike Three', 'Mae Member', 'Vin Four']);
  });
});

/* ═══════════════ Story #3 (ADR 0046): Community view / My view toggle ═══════════════
   T35–T43 are RED until the pov-toggle, readiness probe, indicator lines, and view
   switch land. All /rank/pubkeys traffic (chip batches AND the readiness probe) shares
   one stub; fixtures answer BY POV: byPov[pov][pubkey] → rank. An explicit 0 entry IS
   returned (simulates the main-generation server's zero-fill); an absent pubkey is
   omitted (simulates the deployed generation's empties). Probe shape: pov === ME with
   the curator in the target set.

   DOM contract (ADR 0046 Decisions 5–7): .pov-toggle between .telegram-row and
   .member-search; two role="radio" .pov-segment buttons "Community view" / "My view"
   (active = aria-checked); .pov-disabled-note carries the O1 string verbatim;
   .pov-indicator lines under the search label and in the verified-members header. */

const CURATOR = 'b8a9df8218084e490d888342a9d488b7cf0fb20b1a19b963becd68ed6ab5cbbd';

function povResults(map, pubkeys) {
  return (pubkeys || [])
    .filter(pk => map && Object.prototype.hasOwnProperty.call(map, pk))
    .map(pk => ({ pubkey: pk, rank: map[pk] }));
}

async function stubPovRankApi(page, byPov, opts = {}) {
  return stubRankApi(page, (body) => {
    if (opts.failProbe && body.pov === ME && (body.pubkeys || []).includes(CURATOR)) return { abort: true };
    return { body: { results: povResults(byPov[body.pov], body.pubkeys), ttl: 3600 } };
  });
}

const isProbeCall = (c) => c.pov === ME && (c.pubkeys || []).includes(CURATOR);

// ── Story #7 fixtures (ADR 0047) ──────────────────────────────────────────────
// The provider's own words, in both channels it uses. Nothing in this string may
// reach the DOM — T46/T47/T49 assert that, and a bland fixture would make the
// assertion vacuous, so this is the real production shape.
const RANK_REFUSAL =
  "algorithm 'graperank-pov' cannot be served for pov " + ME +
  ': no scores exist for this point of view and none are scheduled (ranking requests ' +
  "never provision new povs). Either fall back to the endpoint's default algorithm " +
  "'graperank' for a global view, or provision this pov at https://brainstorm.nosfabrica.com";

// Fragments that must never appear on the page, whatever the state. Every one of
// these occurs in RANK_REFUSAL, so the assertion bites. Bare status codes are
// deliberately excluded — they would collide with innocuous numerals on the page.
const PROVIDER_LEAKS = ['graperank', 'algorithm', 'point of view', 'provision', 'nosfabrica', ME];

const NOT_REGISTERED = "My view isn't available yet because your account isn't registered with Brainstorm.";
const SETTING_UP     = (interval) => `My view is being set up. Check back in about ${interval}.`;
const SETTING_UP_VAGUE = 'My view is being set up. Check back in a few minutes.';

const statusNote = (page) => page.locator('#pov-disabled-note');

// Answer the member's own perspective with `probeResponse`; every other perspective
// (i.e. the house batch that feeds the grids) answers normally, so a probe-side
// failure never masquerades as a page-wide outage.
async function stubProbe(page, probeResponse, byPov = povScores()) {
  return stubRankApi(page, (body) => body.pov === ME
    ? (typeof probeResponse === 'function' ? probeResponse(body) : probeResponse)
    : { body: { results: povResults(byPov[body.pov], body.pubkeys), ttl: 3600 } });
}

// The live provider sends `access-control-expose-headers: X-Reason, Retry-After`; without
// it the browser hides the header from script entirely. The fixture must carry it or it
// would be testing a response no server actually sends.
const retryAfter = (v) => ({
  status: 202,
  body: {},
  headers: { 'Retry-After': String(v), 'Access-Control-Expose-Headers': 'X-Reason, Retry-After' },
});

// ── Story #8 fixtures (ADR 0047 amendment) ──────────────────────────────────
const COMMUNITY_DOWN = "Les Femmes Orange's ranking isn't available right now. You're seeing your own view instead.";
const NEITHER_VIEW   = "Results aren't personalized to the community right now. Neither view is available.";
const PANEL_NOT_PERSONALIZED = "These results aren't personalized to the community.";

// Decline the named perspectives; serve everything else normally. `global` requests
// (the provider's default algorithm — no pov) always succeed, since that is what the
// page falls back to.
async function stubPerspectives(page, { declined = [], byPov = povScores() } = {}) {
  return stubRankApi(page, (body) => {
    if (!body.pov) return { body: { results: povResults(byPov[HOUSE_HEX], body.pubkeys), ttl: 3600 } };
    if (declined.includes(body.pov)) return { status: 422, body: { error: RANK_REFUSAL } };
    return { body: { results: povResults(byPov[body.pov], body.pubkeys), ttl: 3600 } };
  });
}

async function pageTextOf(page) {
  return (await page.locator('#page-members').innerText()).toLowerCase();
}

// Shared POV fixture: house order [Vera, Vike, Mae, Vin] / [Pia, Pat]; member order
// [Vike, Mae, Vin, Vera] / [Pat, Pia] — different in BOTH grids, so any lingering
// house ordering under My view fails loudly. CURATOR .9 makes ME "ready".
function povScores() {
  return {
    // V4 carries a low house score (not absent): T41's zero-refetch assertion needs
    // every grid pubkey cacheable under the house key — an absent pubkey re-fetches
    // on every patch by design (#4 miss semantics), which isn't what T41 measures.
    [HOUSE_HEX]: { [ME]: 0.50, [V2]: 0.91, [V3]: 0.73, [V4]: 0.40, [PENDING]: 0.20, [P2]: 0.60, [FX.A]: 0.53 },
    [ME]:        { [ME]: 0.88, [V2]: 0.10, [V3]: 0.95, [V4]: 0.70, [PENDING]: 0.50, [P2]: 0.30, [CURATOR]: 0.90, [FX.A]: 0.77 },
  };
}

const segment = (page, label) => page.locator('.pov-toggle .pov-segment', { hasText: label });
// PO decrowding pass (2026-08-06): ONE indicator, inline with the search header after an
// em dash; the grid-side "viewing as" line was removed as redundant with the toggle.
const searchIndicator = (page) => page.locator('#page-members .member-search .pov-indicator');

test.describe('Community view / My view toggle (npub-search #3)', () => {
  // T35
  test('toggle renders after the Telegram banner; community default; indicators say Les Femmes Orange', async ({ page }) => {
    await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());

    const order = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('.telegram-row, .pov-toggle, .member-search, #verified-members-section')];
      return kids.map(el => el.id || el.className.split(' ')[0]);
    });
    expect(order, 'toggle sits between the Telegram banner and the search bar')
      .toEqual(['telegram-row', 'pov-toggle', 'member-search', 'verified-members-section']);

    await expect(segment(page, 'Community view'), 'community segment active by default').toHaveAttribute('aria-checked', 'true');
    await expect(segment(page, 'My view')).toHaveAttribute('aria-checked', 'false');
    await expect(searchIndicator(page), 'inline indicator follows the header after an em dash')
      .toHaveText(/^— searching as Les Femmes Orange$/);
    await expect(searchIndicator(page), 'indicator lives inside the header row')
      .toHaveCount(1);
    expect(await page.locator('#page-members .member-search .members-section-header .pov-indicator').count(),
      'indicator sits at header level').toBe(1);
    await expect(page.locator('#verified-members-section .pov-indicator'),
      'no grid-side indicator (redundant with the toggle — PO decrowding pass)').toHaveCount(0);
    // Toggle centered on the page (PO decrowding pass).
    const centering = await page.evaluate(() => {
      const t = document.querySelector('.pov-toggle');
      const parent = t.parentElement;
      const tb = t.getBoundingClientRect(), pb = parent.getBoundingClientRect();
      return { left: tb.left - pb.left, right: pb.right - tb.right };
    });
    expect(Math.abs(centering.left - centering.right), 'toggle horizontally centered').toBeLessThan(2);
  });

  // T36
  test('ready member: My view enabled; probe request contract pinned', async ({ page }) => {
    const calls = await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'), 'probe was served (2xx) → segment enabled').toBeEnabled({ timeout: 10_000 });
    await expect(statusNote(page), 'no status note when the perspective is served').toBeHidden();

    const probe = calls.find(isProbeCall);
    expect(probe, 'readiness probe fired').toBeTruthy();
    expect(probe.algorithm, 'probe uses personalized graperank').toBe('graperank-pov');
    expect(probe.pov, 'probe pov is the signed-in member').toBe(ME);
    const targets = new Set(probe.pubkeys);
    expect(targets.has(ME) && targets.has(CURATOR), 'probe targets include the member and the curator').toBe(true);
  });

  // T37 — RE-PINNED for ADR 0047. Under the old heuristic an unservable perspective
  // and a servable-but-zero-scoring one were indistinguishable, so both read as
  // not-ready. The provider now refuses what it cannot serve, so the only remaining
  // not-ready-without-a-note case is a transport failure. Enhancement-only holds:
  // the page is fully functional either way.
  test('probe transport failure → disabled segment, no note, page intact', async ({ page }) => {
    await stubPovRankApi(page, povScores(), { failProbe: true });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'), 'probe failure → disabled').toBeDisabled();
    await expect(statusNote(page), 'a transport failure explains nothing, so it says nothing').toBeHidden();
    await expect(gridCard(page, 'verified-members-grid', 'Vera Two'), 'grids render normally').toBeVisible();
    await expect(gridCard(page, 'pending-members-grid', 'Pat Pending').locator('.attest-btn'),
      'vouch flow untouched by probe failure').toBeVisible();
  });

  // T38
  test('readiness probe fires on every Members-page visit', async ({ page }) => {
    const calls = await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());
    await expect.poll(() => calls.filter(isProbeCall).length, { message: 'probe on first visit' }).toBe(1);

    await page.evaluate(() => { showView('home'); showView('members'); });
    await expect(page.locator('#verified-members-grid .member-card').first()).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => calls.filter(isProbeCall).length, { message: 'probe again on revisit' }).toBe(2);
  });

  // T39
  test('switching to My view re-ranks both grids, swaps chips, and flips the indicators', async ({ page }) => {
    await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());
    await expect.poll(() => gridNames(page, 'verified-members-grid'))
      .toEqual(['Vera Two', 'Vike Three', 'Mae Member', 'Vin Four']);
    await expect(segment(page, 'My view')).toBeEnabled({ timeout: 10_000 });

    await segment(page, 'My view').click();

    await expect.poll(() => gridNames(page, 'verified-members-grid'),
      { message: 'verified grid re-ranks under the member POV' })
      .toEqual(['Vike Three', 'Mae Member', 'Vin Four', 'Vera Two']);
    await expect.poll(() => gridNames(page, 'pending-members-grid'),
      { message: 'pending grid re-ranks under the member POV' })
      .toEqual(['Pat Pending', 'Pia Second']);
    await expect(gridCard(page, 'verified-members-grid', 'Vike Three').locator('.candidate-trust-score'),
      'chips show member-POV values').toHaveText('🏅 95');
    await expect(gridCard(page, 'verified-members-grid', 'Vera Two').locator('.candidate-trust-score'))
      .toHaveText('🏅 10');
    await expect(segment(page, 'My view')).toHaveAttribute('aria-checked', 'true');
    await expect(searchIndicator(page)).toHaveText(/^— searching as you$/);
  });

  // T40
  test('switch dismisses an open panel; searches then run from the member POV', async ({ page }) => {
    await stubPovRankApi(page, povScores());
    const searchCalls = await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000]]) }));
    const setup = bigGridSetup();
    setup.profiles[FX.A] = [{ meta: { display_name: 'Ada' }, created_at: 1000 }];
    await openMembers(page, setup);
    await expect(segment(page, 'My view')).toBeEnabled({ timeout: 10_000 });

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(1);
    expect(searchCalls[0].pov, 'community search runs from the house POV').toBe(HOUSE_HEX);

    await segment(page, 'My view').click();
    await expect(panel(page), 'open panel dismissed on switch — no stale-POV rows').toBeHidden();

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(1, { timeout: 10_000 });
    expect(searchCalls[searchCalls.length - 1].pov, 'My-view search runs from the member POV').toBe(ME);
    await expect(ROW(page).locator('.candidate-trust-score'), 'row chip from the member-POV rank batch').toHaveText('🏅 77');
  });

  // T41
  test('switching back restores the house view; composite cache keeps house scores warm', async ({ page }) => {
    const calls = await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());
    await expect(segment(page, 'My view')).toBeEnabled({ timeout: 10_000 });
    // Story #8: excludes the community readiness probe, which is a [pov, CURATOR] pair
    // rather than a score fetch — this counter measures cache warmth, not probe traffic.
    const houseCalls = () => calls.filter(c =>
      c.pov === HOUSE_HEX && !((c.pubkeys || []).length === 2 && (c.pubkeys || []).includes(CURATOR))).length;
    const baseline = houseCalls();

    await segment(page, 'My view').click();
    await expect.poll(() => gridNames(page, 'verified-members-grid'))
      .toEqual(['Vike Three', 'Mae Member', 'Vin Four', 'Vera Two']);

    await segment(page, 'Community view').click();
    await expect.poll(() => gridNames(page, 'verified-members-grid'), { message: 'house order restored' })
      .toEqual(['Vera Two', 'Vike Three', 'Mae Member', 'Vin Four']);
    await expect(gridCard(page, 'verified-members-grid', 'Vera Two').locator('.candidate-trust-score'),
      'house chip values restored').toHaveText('🏅 91');
    await expect(searchIndicator(page)).toHaveText(/searching as Les Femmes Orange/i);
    expect(houseCalls(), 'switch-back fetched nothing — house scores stayed cached under their own key').toBe(baseline);
  });

  // T42
  test('the view choice does not survive a reload — community default every session', async ({ page }) => {
    await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());
    await expect(segment(page, 'My view')).toBeEnabled({ timeout: 10_000 });
    await segment(page, 'My view').click();
    await expect(segment(page, 'My view')).toHaveAttribute('aria-checked', 'true');

    await openMembers(page, bigGridSetup());   // full reload + re-seed
    await expect(segment(page, 'Community view'), 'fresh session starts in Community view').toHaveAttribute('aria-checked', 'true');
    await expect(searchIndicator(page)).toHaveText(/searching as Les Femmes Orange/i);
  });

  // T43 — twice AMENDED by the PO (2026-08-06). Final spec after the decrowding pass:
  // the headers are typographic siblings (same font/size/weight/alignment) and the
  // search header sits in a .members-section-header row — but the underline is
  // grid-sections-only: verified AND pending header rows keep the 1px border, the
  // search header row has none.
  test('headers are typographic siblings; underline on grid headers only, not search', async ({ page }) => {
    await stubPovRankApi(page, povScores());
    await openMembers(page, bigGridSetup());
    const styles = await page.evaluate(() => {
      const row = (el) => {
        const s = getComputedStyle(el);
        return { borderBottomWidth: s.borderBottomWidth, borderBottomStyle: s.borderBottomStyle };
      };
      const font = (el) => {
        const s = getComputedStyle(el);
        return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, align: s.textAlign };
      };
      return {
        searchRowExists: !!document.querySelector('#page-members .member-search .members-section-header'),
        searchRow:  row(document.querySelector('#page-members .member-search .members-section-header')),
        membersRow: row(document.querySelector('#verified-members-section .members-section-header')),
        pendingRow: row(document.querySelector('#pending-members-section .members-section-header')),
        fonts: { search: font(document.querySelector('.member-search-label')),
                 members: font(document.querySelector('#verified-members-section h2')) },
      };
    });
    expect(styles.searchRowExists, 'search header sits in a .members-section-header row').toBe(true);
    expect(styles.fonts.search, 'headers are typographic siblings').toEqual(styles.fonts.members);
    expect(styles.membersRow.borderBottomWidth, 'verified header keeps its underline').toBe('1px');
    expect(styles.pendingRow.borderBottomWidth, 'pending header keeps its underline').toBe('1px');
    expect(styles.searchRow.borderBottomWidth, 'search header has no underline').toBe('0px');
  });
});

test.describe('My view availability states (npub-search #7, ADR 0047)', () => {

  // T44 — the false-negative class ADR 0047 kills. Yesterday's heuristic read an
  // all-zero probe as "not provisioned". A 200 means the provider SERVED the
  // perspective; the values are its answer, not evidence about its availability.
  test('served with all-zero ranks reads READY — no value inspection', async ({ page }) => {
    await stubProbe(page, { body: { results: [{ pubkey: ME, rank: 0 }, { pubkey: CURATOR, rank: 0 }], ttl: 3600 } });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'),
      'a served perspective is ready even when every rank it returns is zero').toBeEnabled({ timeout: 10_000 });
    await expect(statusNote(page), 'nothing to explain when the perspective is served').toBeHidden();
  });

  // T45 — same principle, the other empty shape: served, but no row matched.
  test('served with empty results reads READY', async ({ page }) => {
    await stubProbe(page, { body: { results: [], ttl: 3600 } });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'),
      'an empty result set is still a served perspective').toBeEnabled({ timeout: 10_000 });
    await expect(statusNote(page)).toBeHidden();
  });

  // T46 — AC-1 and AC-5 together. The refusal carries the provider's real reason in
  // BOTH channels it uses, so the leak assertion has something to catch.
  test('refused perspective → dimmed segment, registration cause, no provider text', async ({ page }) => {
    await stubProbe(page, {
      status: 422,
      body: { error: RANK_REFUSAL },
      headers: { 'X-Reason': RANK_REFUSAL, 'Access-Control-Expose-Headers': 'X-Reason, Retry-After' },
    });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'), 'a refusal disables the segment').toBeDisabled();
    await expect(statusNote(page), 'the cause a member can act on, verbatim').toHaveText(NOT_REGISTERED);

    const text = await pageTextOf(page);
    for (const leak of PROVIDER_LEAKS) {
      expect(text.includes(leak.toLowerCase()),
        `provider vocabulary "${leak}" must never reach the page`).toBe(false);
    }

    // AC-7: the community perspective is untouched by a refusal of the member's own.
    await expect(searchIndicator(page)).toHaveText('— searching as Les Femmes Orange');
    await expect(gridChips(page).first(), 'house chips render normally').toBeVisible();
  });

  // T47 — AC-2. Retry-After in its delta-seconds form.
  test("still being set up → the wait, with an interval from the provider's estimate", async ({ page }) => {
    await stubProbe(page, retryAfter(300));
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'), 'preparing is still not selectable').toBeDisabled();
    await expect(statusNote(page)).toHaveText(SETTING_UP('5 minutes'));

    const text = await pageTextOf(page);
    expect(text.includes('retry'), 'no header vocabulary on the page').toBe(false);
  });

  // T48 — AC-2 boundaries. Each bucket edge from both sides, the five-minute floor
  // (90s must not render "about 0 minutes"), and the HTTP-date form of Retry-After.
  test('interval buckets: boundaries, the five-minute floor, and the date form', async ({ page }) => {
    const cases = [
      [1,     'a minute'],
      [89,    'a minute'],
      [90,    '5 minutes'],      // floor: round(1.5/5)*5 === 0 without max(5, …)
      [300,   '5 minutes'],
      [599,   '10 minutes'],
      [600,   'an hour'],
      [5399,  'an hour'],
      [5400,  '2 hours'],        // round(1.5) === 2 — over-stating is the safe direction
      [10800, '3 hours'],
    ];
    for (const [seconds, expected] of cases) {
      await stubProbe(page, retryAfter(seconds));
      await openMembers(page, bigGridSetup());
      await expect(statusNote(page), `${seconds}s renders as "${expected}"`)
        .toHaveText(SETTING_UP(expected));
    }

    // Retry-After may also be an HTTP-date (RFC 9110). Same mapping.
    await stubProbe(page, (body) => retryAfter(new Date(Date.now() + 300_000).toUTCString()));
    await openMembers(page, bigGridSetup());
    await expect(statusNote(page), 'an HTTP-date estimate maps through the same buckets')
      .toHaveText(SETTING_UP('5 minutes'));
  });

  // T49 — AC-3. Three ways to have no usable estimate, all landing on the same line.
  // An elapsed estimate is the interesting one: it must not render as zero or negative.
  test('no usable estimate — absent, unparseable, or already elapsed → a few minutes', async ({ page }) => {
    const noEstimate = [
      { status: 202, body: {} },                                   // header absent
      retryAfter('soon'),                                          // unparseable
      retryAfter('-30'),                                           // negative
      retryAfter(new Date(Date.now() - 600_000).toUTCString()),    // already elapsed
    ];
    for (const [i, probe] of noEstimate.entries()) {
      await stubProbe(page, probe);
      await openMembers(page, bigGridSetup());
      await expect(segment(page, 'My view')).toBeDisabled();
      await expect(statusNote(page), `case ${i}: falls back to the vague wait`)
        .toHaveText(SETTING_UP_VAGUE);
    }
  });

  // T50 — AC-6. A control removed from the tab order takes its explanation with it.
  test('dimmed segment stays focusable, is aria-disabled, and is described by its note', async ({ page }) => {
    await stubProbe(page, { status: 422, body: { error: RANK_REFUSAL } });
    await openMembers(page, bigGridSetup());

    const mine = segment(page, 'My view');
    await expect(mine, 'aria-disabled, not the disabled attribute').toHaveAttribute('aria-disabled', 'true');

    // toBeDisabled() resolves aria-disabled SEMANTICALLY and passes while the segment
    // renders at full opacity — which is exactly how R1 shipped green. Pin the pixels.
    const dimmed = await mine.evaluate(el => {
      const c = getComputedStyle(el);
      return { opacity: c.opacity, cursor: c.cursor };
    });
    expect(dimmed.opacity, 'a dimmed segment is visibly dimmed').toBe('0.55');
    expect(dimmed.cursor, 'and does not invite a click').toBe('not-allowed');
    expect(await mine.evaluate(el => el.hasAttribute('disabled')),
      'the disabled attribute would drop it out of the tab order').toBe(false);

    await mine.focus();
    await expect(mine, 'a dimmed segment is still reachable by keyboard').toBeFocused();

    const describedBy = await mine.getAttribute('aria-describedby');
    expect(describedBy, 'the reason arrives with the control').toBe('pov-disabled-note');

    const note = statusNote(page);
    await expect(note).toHaveAttribute('role', 'status');
    await expect(note).toHaveAttribute('aria-live', 'polite');
    await expect(note, 'the design guide generalizes the class beyond "disabled"')
      .toHaveClass(/pov-status-note/);

    // Activating a dimmed segment must do nothing. dispatchEvent, not click(): Playwright
    // treats aria-disabled as disabled and would refuse the click on actionability, which
    // would prove nothing about the handler. This fires it the way a stray script would.
    await mine.dispatchEvent('click');
    await expect(searchIndicator(page), 'the perspective did not change')
      .toHaveText('— searching as Les Femmes Orange');

    // The note persists across states so its live region can announce — hidden, not removed.
    await stubProbe(page, { body: { results: [{ pubkey: ME, rank: 0.8 }], ttl: 3600 } });
    await openMembers(page, bigGridSetup());
    await expect(statusNote(page), 'persistent element, hidden when there is nothing to say').toBeHidden();
    await expect(statusNote(page), 'persistent means still in the DOM').toHaveCount(1);

    const live = await segment(page, 'My view').evaluate(el => {
      const c = getComputedStyle(el);
      return { opacity: c.opacity, cursor: c.cursor };
    });
    expect(live.opacity, 'a served perspective is not dimmed').toBe('1');
    expect(live.cursor, 'and invites a click').not.toBe('not-allowed');
  });

});

test.describe('Community refusal and the preference order (npub-search #8)', () => {

  // T51 — AC-1. The one unrequested perspective change in the product, and the one
  // place the page announces a change it made itself.
  test('community declined, hers served → opens on My view and says why', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX] });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'My view'), 'her own perspective is live and selected')
      .toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(segment(page, 'Community view'), 'the declined side is dimmed').toBeDisabled();
    await expect(statusNote(page)).toHaveText(COMMUNITY_DOWN);
    await expect(searchIndicator(page), 'a substituted view reads exactly like a chosen one')
      .toHaveText('— searching as you');
  });

  // T52 — AC-2. Only when BOTH are declined does the page run unpersonalized.
  test('neither perspective served → both dimmed, nothing claimed beyond the negative', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX, ME] });
    await openMembers(page, bigGridSetup());

    await expect(segment(page, 'Community view')).toBeDisabled();
    await expect(segment(page, 'My view')).toBeDisabled();
    await expect(statusNote(page)).toHaveText(NEITHER_VIEW);
    await expect(searchIndicator(page)).toHaveText('— not personalized to the community');

    const text = await pageTextOf(page);
    expect(text.includes('nostr network'), 'never claims the whole network').toBe(false);
    for (const leak of PROVIDER_LEAKS) {
      expect(text.includes(leak.toLowerCase()), `provider vocabulary "${leak}" leaked`).toBe(false);
    }
  });

  // T53 — AC-3. A declined perspective has RESULTS. It must never render as an absence.
  test('unpersonalized search still returns rows, under one honest line', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX, ME] });
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000]]) }));
    await openMembers(page, bigGridSetup());

    await page.fill('#member-search-input', 'rando');
    const panel = page.locator('#member-search-panel');
    await expect(panel.locator('.member-search-notice')).toHaveText(PANEL_NOT_PERSONALIZED);
    await expect(panel.locator('.member-card'), 'rows still render').not.toHaveCount(0);
    await expect(panel.locator('.member-search-empty'), 'never "no matches"').toHaveCount(0);
    await expect(panel.locator('.member-search-unavailable'), 'never "temporarily unavailable"').toHaveCount(0);
  });

  // T54 — AC-4. On a substituted My view the rows ARE personalized. A caveat there
  // would disparage the best results the page can produce.
  test('substituted My view search carries no notice — those rows are personalized', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX] });
    await stubOreSearch(page, () => ({ body: oreSearchResponse([[FX.A, 9000]]) }));
    await openMembers(page, bigGridSetup());

    await page.fill('#member-search-input', 'rando');
    const panel = page.locator('#member-search-panel');
    await expect(panel.locator('.member-card').first()).toBeVisible();
    await expect(panel.locator('.member-search-notice'), 'no caveat on personalized rows').toHaveCount(0);
  });

  // T55 — AC-5. The selection must never move under the member's eyes. A
  // MutationObserver installed before the page loads records every transition of the
  // toggle's checked state; a page that paints Community and then flips to My view
  // leaves two entries behind.
  test('the control never shows one side selected and then switches', async ({ page }) => {
    await page.addInitScript(() => {
      window.__povChecked = [];
      const native = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (name === 'aria-checked' && this.id && this.id.startsWith('pov-segment-')) {
          window.__povChecked.push(`${this.id}=${value}`);
        }
        return native.call(this, name, value);
      };
    });
    // Hold the probes open so the pre-resolution window is observable. Review R2: the
    // markup used to ship a selection, so the wrong side was visibly checked for a full
    // round trip — a gap invisible to any test that samples only attribute WRITES.
    let release;
    const held = new Promise((r) => { release = r; });
    await stubRankApi(page, async (body) => {
      if (body.pov) await held;
      return body.pov === HOUSE_HEX
        ? { status: 422, body: { error: RANK_REFUSAL } }
        : { body: { results: povResults(povScores()[body.pov], body.pubkeys), ttl: 3600 } };
    });
    await openMembers(page, bigGridSetup());

    for (const id of ['pov-segment-community', 'pov-segment-mine']) {
      await expect(page.locator(`#${id}`), `${id} must not be selected before resolution`)
        .toHaveAttribute('aria-checked', 'false');
      await expect(page.locator(`#${id}`), `${id} must be inert before resolution`)
        .toHaveAttribute('aria-disabled', 'true');
    }
    release();
    await expect(segment(page, 'My view')).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });

    const writes = await page.evaluate(() => window.__povChecked);
    // Every write of aria-checked, in order. The page may write the same value repeatedly
    // (idempotent repaints); what it must never do is show one side selected and then the
    // other. Reduce to the sequence of DISTINCT selected sides.
    const selected = writes.filter(w => w.endsWith('=true')).map(w => w.split('=')[0]);
    const distinctInOrder = selected.filter((v, i, a) => v !== a[i - 1]);
    expect(distinctInOrder.length,
      `the selection settled once; instead it moved through ${JSON.stringify(distinctInOrder)}`).toBe(1);
    expect(distinctInOrder[0],
      'and settled on the only servable perspective').toBe('pov-segment-mine');
  });

  // T56 — AC-6. A deliberate choice is not undone by a later re-resolution.
  test('an explicit choice is kept while it can be served', async ({ page }) => {
    await stubPerspectives(page, {});           // both available
    await openMembers(page, bigGridSetup());
    await expect(segment(page, 'My view')).toBeEnabled({ timeout: 10_000 });

    await segment(page, 'My view').click();
    await expect(searchIndicator(page)).toHaveText('— searching as you');

    // Re-enter Members: the preference order would pick Community, but she chose.
    await page.evaluate(() => { showView('home'); showView('members'); });
    await expect(page.locator('#verified-members-grid .member-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(searchIndicator(page), 'her choice survives a re-resolution')
      .toHaveText('— searching as you');
  });

  // T57 — AC-7. Being moved once is a service; being moved twice is the page
  // changing its mind at her expense.
  test('at most one unrequested move per visit', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX] });
    await openMembers(page, bigGridSetup());
    await expect(searchIndicator(page)).toHaveText('— searching as you', { timeout: 10_000 });

    // The community perspective recovers mid-visit.
    await stubPerspectives(page, {});
    await page.evaluate(() => resolvePerspectives());
    await page.waitForTimeout(300);

    await expect(searchIndicator(page), 'she stays where she was put')
      .toHaveText('— searching as you');
    await expect(segment(page, 'Community view'), 'but the control re-enables so she can choose')
      .toBeEnabled();
  });


  // T58 — the exception AC-7 gained after review R1. The guard stops the page changing
  // its mind, not a forced move: leaving her on a refused perspective would render a page
  // ordered by scores that can never arrive.
  test('a second move is allowed rather than stranding her on a refused perspective', async ({ page }) => {
    await stubPerspectives(page, { declined: [HOUSE_HEX] });
    await openMembers(page, bigGridSetup());
    await expect(searchIndicator(page), 'move one: substituted onto her own view')
      .toHaveText('— searching as you', { timeout: 10_000 });

    // Mid-visit the situation inverts: the community recovers, hers is declined.
    await stubPerspectives(page, { declined: [ME] });
    await page.evaluate(() => resolvePerspectives());

    await expect(searchIndicator(page), 'move two: moved off the dead perspective, not stranded')
      .toHaveText('— searching as Les Femmes Orange');
    await expect(statusNote(page), 'and told why her own view is gone')
      .toHaveText("My view isn't available yet because your account isn't registered with Brainstorm.");
  });

});
