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

/* ── Story #2 (ADR 0042): free-text search fixtures ─────────────────────────────
   Seam: GET <SEARCH_API> (route glob "api/search/profiles/meili") — the ONLY new
   network surface. Fixtures mirror docs/meili-search-proxy-contract.md. Hits are served in
   followers-desc order with rank deliberately disagreeing (probe P3/P14: served
   order is a mutable server pref) so the client-side rank re-sort is actually
   exercised, never accidentally satisfied. */

const HOUSE_HEX    = '6db8a13f0183828c44dc778af7e2689a810fc24317585f497ddad049b4dd2597';
const HOUSE_SUFFIX = '39945424';

function mkHit(hex, name, rank, followers = 0, { suffix = HOUSE_SUFFIX, nip05 = '' } = {}) {
  return {
    name, display_name: name, displayName: name, username: '', nip05,
    npub: nip19.npubEncode(hex), about: '', lud16: '', lud06: '', website: '',
    id: hex, pubkey: hex, created_at: 1000, indexed_at: 2000, picture: '', banner: '',
    ...(rank != null ? { [`wot_rank_${suffix}`]: rank } : {}),
    [`wot_followers_${suffix}`]: followers,
  };
}

function searchResponse(hits, overrides = {}) {
  return {
    success: true,
    povSuffix: HOUSE_SUFFIX,
    povResolution: { mode: 'unfiltered', fellBackToHouse: false, requested: 'user',
                     delegateSource: 'user-prefs', povSuffix: HOUSE_SUFFIX, minRank: null, scoresExist: null },
    nip05Result: null, _wotCount: hits.length, _filtered: false,
    hits, query: 'q', processingTimeMs: 4, estimatedTotalHits: hits.length,
    tagHits: [], tagHitsHasMore: false,
    ...overrides,
  };
}

// Install the search-API stub. `respond(params, nthCall)` returns
// { body, status?, delayMs?, abort? }. Returns the node-side call log (parsed
// query params per request) so specs can assert the request contract.
async function stubSearch(page, respond) {
  const calls = [];
  await page.route('**/api/search/profiles/meili*', async (route) => {
    const url = new URL(route.request().url());
    const params = Object.fromEntries(url.searchParams.entries());
    calls.push(params);
    const r = (typeof respond === 'function' ? await respond(params, calls.length) : respond) || {};
    if (r.abort) return route.abort('failed');
    if (r.delayMs) await new Promise(res => setTimeout(res, r.delayMs));
    return route.fulfill({
      status: r.status ?? 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: r.body ?? searchResponse([]),
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
    const searchCalls = await stubSearch(page, () => ({ body: searchResponse([]) }));
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

/* ═══════════════════════════════ Story #2 (ADR 0042) ═══════════════════════════════
   Free-text profile search from the Brainstorm house POV. T15–T27 are RED until the
   SEARCH_API fetch, client-side rank re-sort, and the new panel states land in
   public/index.html.

   Seam contract (test plan 2-freetext-search-house-pov, pinning what ADR 0042 left open):
     Request: q, limit=24, offset=0, wotPov=user, userPubkey=<HOUSE_POV.pubkey>. Fires
       live at ≥2 chars (no Enter); never below 2; never for decodable identities.
     Rows: up to 6 × .member-card.candidate in #member-search-panel, rank-desc via the
       response's own povSuffix; each scored row carries .candidate-trust-score whose
       text contains the integer rank; score-less rows sort last, no score element.
     States: .member-search-empty | .member-search-unavailable | .member-search-footnote
       (encouragement copy naming npub, hex, and nprofile).
     Guard: fellBackToHouse or foreign povSuffix → console.warn mentioning "POV".
     Caches: hits seed _metaCache only when absent. Stale responses never paint. */

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

// 8 scored hits SERVED followers-desc (mutable server pref), ranks disagreeing.
// Rank top-6 = Etta 100, Bea 92, Dot 75, Cleo 68, Ada 53, Fern 30; Hana 9 and the
// score-less Gwen must be cut.
function eightHits() {
  return [
    mkHit(FX.A, 'Ada',  53, 600),
    mkHit(FX.B, 'Bea',  92, 500),
    mkHit(FX.C, 'Cleo', 68, 400),
    mkHit(FX.D, 'Dot',  75, 300),
    mkHit(FX.G, 'Gwen', null, 250),
    mkHit(FX.H, 'Hana',  9, 200),
    mkHit(FX.E, 'Etta', 100, 100),   // highest trust, served near-last
    mkHit(FX.F, 'Fern', 30,  50),
  ];
}

test.describe('free-text search — ranked candidates from the house POV (npub-search #2)', () => {
  // T15
  test('one char never queries the backend; two chars fire live without Enter', async ({ page }) => {
    const calls = await stubSearch(page, () => ({ body: searchResponse([mkHit(FX.A, 'Ada', 53)]) }));
    await openMembers(page);

    await search(page, 'l');
    await page.waitForTimeout(800); // outlast the debounce
    expect(calls.length, 'below-minimum input must never reach the backend').toBe(0);
    await expect(ROW(page)).toHaveCount(0);

    await search(page, 'li');       // no Enter, no button — live debounced trigger
    await expect.poll(() => calls.length, { message: 'a 2-char query fires the search live' }).toBeGreaterThan(0);
  });

  // T16
  test('fall-through fork: free text sends the pinned request contract; identities never touch the backend', async ({ page }) => {
    const calls = await stubSearch(page, () => ({ body: searchResponse([mkHit(FX.A, 'Ada', 53)]) }));
    await openMembers(page);

    await search(page, 'liz');
    await expect.poll(() => calls.length, { message: 'free text reaches the search backend' }).toBe(1);
    const req = calls[0];
    expect(req.q, 'q carries the raw query').toBe('liz');
    expect(req.limit, 'limit=24 headroom (ADR sub-decision 2)').toBe('24');
    expect(req.offset, 'offset=0 — no pagination').toBe('0');
    expect(req.wotPov, 'wotPov=user selects the stored-prefs POV path').toBe('user');
    expect(req.userPubkey, 'userPubkey is the HOUSE_POV placeholder (PO account)').toBe(HOUSE_HEX);
    await expect(page.locator('#page-members .member-search-hint'),
      'the story-#1 dead-end hint is gone for searchable input').toBeHidden();
    await expect(ROW(page)).toHaveCount(1);

    // Identity fast path: unchanged, and it must NOT consult the search backend.
    await search(page, OUTSIDER_NPUB);
    await expect(rowByName(page, 'Olive Outsider'), 'identity flow still renders its single candidate').toHaveCount(1);
    expect(calls.length, 'no search-API request for a decodable identity').toBe(1);
  });

  // T17
  test('six rows, highest trust first by the response povSuffix, regardless of served order', async ({ page }) => {
    await stubSearch(page, () => ({ body: searchResponse(eightHits()) }));
    await openMembers(page);
    await search(page, 'liz');

    await expect(ROW(page), 'panel caps at 6 rows').toHaveCount(6);
    expect(await rowScores(page), 'rows ordered by wot_rank desc, not by served (followers) order')
      .toEqual([100, 92, 75, 68, 53, 30]);
    await expect(ROW(page).first().locator('.member-name'), 'late-served highest-trust hit is row 1').toHaveText('Etta');
    await expect(rowByName(page, 'Hana'), 'lowest-rank hit cut by the top-6').toHaveCount(0);
    await expect(rowByName(page, 'Gwen'), 'score-less hit cut when 6 scored hits exist').toHaveCount(0);
  });

  // T18
  test('per-row membership: ✓ Member (no vouch) / Pending (vouch) / Not a member (vouch)', async ({ page }) => {
    await stubSearch(page, () => ({
      body: searchResponse([
        mkHit(ME, 'Mae Member', 90, 300),
        mkHit(PENDING, 'Pat Pending', 70, 200),
        mkHit(FX.A, 'Ada', 50, 100),
      ]),
    }));
    await openMembers(page);
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(3);

    await expect(rowByName(page, 'Mae Member').locator('.member-badge')).toHaveText(/✓ Member/);
    await expect(rowByName(page, 'Mae Member').locator('.attest-btn'), 'no vouch action on a member').toHaveCount(0);
    await expect(rowByName(page, 'Pat Pending').locator('.member-badge')).toHaveText(/Pending/i);
    await expect(rowByName(page, 'Pat Pending').locator('.attest-btn')).toHaveText(/Vouch/);
    await expect(rowByName(page, 'Ada').locator('.member-badge')).toHaveText(/Not a member/i);
    await expect(rowByName(page, 'Ada').locator('.attest-btn')).toHaveText(/Vouch/);
  });

  // T19
  test('a score-less hit sorts last and renders without a score element', async ({ page }) => {
    await stubSearch(page, () => ({
      body: searchResponse([
        mkHit(FX.G, 'Gwen', null, 999),   // most followers, served first, but unscored
        mkHit(FX.A, 'Ada', 80, 10),
        mkHit(FX.B, 'Bea', 40, 5),
      ]),
    }));
    await openMembers(page);
    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(3);
    await expect(ROW(page).last().locator('.member-name'), 'unscored row sorts last').toHaveText('Gwen');
    await expect(rowByName(page, 'Gwen').locator('.candidate-trust-score'), 'no score chip without a score').toHaveCount(0);
    expect(await rowScores(page), 'scored rows keep rank order ahead of the unscored row').toEqual([80, 40]);
  });

  // T20
  test('identity-search encouragement copy renders beneath results and in the empty state', async ({ page }) => {
    let empty = false;
    await stubSearch(page, () => ({ body: searchResponse(empty ? [] : [mkHit(FX.A, 'Ada', 53)]) }));
    await openMembers(page);

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
    await stubSearch(page, () => ({
      body: searchResponse([
        mkHit(FX.A, 'Ada', 80, 300),
        mkHit(FX.B, 'Bea', 60, 200),
        mkHit(FX.C, 'Cleo', 40, 100),
      ]),
    }));
    await openMembers(page);
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
    await stubSearch(page, () => ({ delayMs: 1200, body: searchResponse([mkHit(FX.A, 'Ada', 53)]) }));
    await openMembers(page);
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
    await stubSearch(page, () => ({ body: searchResponse([]) }));
    await openMembers(page);
    await search(page, 'zzq');
    const emptyEl = page.locator('#member-search-panel .member-search-empty');
    await expect(emptyEl, 'empty state rendered').toBeVisible();
    expect((await emptyEl.textContent()).trim().length, 'empty state carries copy').toBeGreaterThan(0);
    await expect(emptyEl).not.toContainText(/not a recognized identity/i);
    await expect(ROW(page)).toHaveCount(0);
  });

  // T24
  test('backend failure → unavailable state; retyping when healthy retries; nothing breaks', async ({ page }) => {
    let healthy = false;
    await stubSearch(page, () => healthy
      ? { body: searchResponse([mkHit(FX.A, 'Ada', 53)]) }
      : { status: 503, body: { success: false, error: 'Search service unavailable' } });
    await openMembers(page);

    await search(page, 'liz');
    await expect(page.locator('#member-search-panel .member-search-unavailable'),
      'unavailable state on backend failure').toBeVisible();
    await expect(ROW(page)).toHaveCount(0);

    healthy = true;
    await search(page, 'lizz');   // retry = just typing
    await expect(ROW(page), 'recovery on the next keystrokes').toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('#member-search-panel .member-search-unavailable')).toHaveCount(0);
  });

  // T25
  test('stale responses never paint: a slow query is superseded by a fast retype', async ({ page }) => {
    await stubSearch(page, (params) => params.q === 'slow'
      ? { delayMs: 2000, body: searchResponse([mkHit(FX.G, 'Slow Result', 99)]) }
      : { body: searchResponse([mkHit(FX.A, 'Fast Result', 53)]) });
    await openMembers(page);

    await search(page, 'slow');
    await page.waitForTimeout(600);          // let the slow request actually launch
    await search(page, 'liz');
    await expect(rowByName(page, 'Fast Result')).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(2500);         // outlast the slow response
    await expect(rowByName(page, 'Slow Result'), 'the stale response must never overwrite').toHaveCount(0);
    await expect(rowByName(page, 'Fast Result'), 'the latest query keeps the panel').toHaveCount(1);
  });

  // T26
  test('POV fallback in the response → console.warn mentioning POV; rows still render from the returned namespace', async ({ page }) => {
    const warnings = [];
    page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
    await stubSearch(page, () => ({
      body: searchResponse(
        [mkHit(FX.A, 'Ada', 61, 10, { suffix: '78ed0837' })],
        { povSuffix: '78ed0837',
          povResolution: { mode: 'filtered', fellBackToHouse: true, requested: 'user',
                           delegateSource: 'house-prefs', povSuffix: '78ed0837', minRank: 2, scoresExist: true } },
      ),
    }));
    await openMembers(page);
    await search(page, 'liz');

    await expect(ROW(page), 'fallback still renders results').toHaveCount(1);
    expect(await rowScores(page), 'score read via the RETURNED povSuffix, not the expected one').toEqual([61]);
    await expect.poll(() => warnings.filter(w => /pov/i.test(w)).length,
      { message: 'a console.warn mentioning POV fires on fellBackToHouse/suffix mismatch' }).toBeGreaterThan(0);
  });

  // T27
  test('hits seed _metaCache when absent; existing cache entries are never overwritten', async ({ page }) => {
    await stubSearch(page, () => ({
      body: searchResponse([
        mkHit(FX.A, 'Ada Fresh', 80, 10, { nip05: 'ada@lfo.example' }),
        mkHit(ME, 'Mae RENAMED BY SEARCH', 90, 300),
      ]),
    }));
    await openMembers(page);
    await page.evaluate((me) => { _metaCache.set(me, { display_name: 'Mae Original' }); }, ME);

    await search(page, 'liz');
    await expect(ROW(page)).toHaveCount(2);

    const cached = await page.evaluate(({ a, me }) => ({
      ada: _metaCache.get(a) || null,
      mae: _metaCache.get(me) || null,
    }), { a: FX.A, me: ME });
    expect(cached.ada, 'absent hit seeded into _metaCache').not.toBeNull();
    expect(cached.ada.display_name ?? cached.ada.name, 'seeded meta carries the profile fields').toBe('Ada Fresh');
    expect(cached.mae.display_name, 'pre-existing cache entry not overwritten by a search hit').toBe('Mae Original');
  });
});

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
    calls.push(body);
    const r = (typeof respond === 'function' ? await respond(body, calls.length) : respond) || {};
    if (r.abort) return route.abort('failed');
    return route.fulfill({
      status: r.status ?? 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
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

    expect(calls.length, 'exactly one batch request per load').toBe(1);
    const body = calls[0];
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
     before AND after). */

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
});
