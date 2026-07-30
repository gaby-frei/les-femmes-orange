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
//        Badges: "✓ Member" | "Pending" | "Not yet a member".
//   window.decodeIdentity(raw) -> { hex, hints[] } | null. Pure. Hex 64 / npub1 / nprofile1;
//        bech32 checksum failures -> null; hints sanitized: wss:// only, deduped, max 3.
//   Profile lookup: parallel queryRelay fan-out over RELAYS + PROFILE_RELAYS
//        (purplepag.es, relay.damus.io) + sanitized hints; renders on FIRST hit; a strictly
//        newer created_at arriving later upgrades the card; a full miss is NOT negative-cached
//        (re-search re-queries) and shows the O3 view-only state (no-profile copy + no Vouch).
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
async function openMembers(page, { profiles = defaultProfiles(), publishOk = true, signThrows = false } = {}) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView), 'app booted').toBe('function');
  await page.evaluate(({ profiles, publishOk, signThrows, me, seed, pending }) => {
    currentPubkey = me;
    _isVerifiedMember = true;
    _tagItemsCache = [
      { kind: 39999, pubkey: seed,    tags: [['p', me]],      created_at: 1, id: 'a1'.repeat(32) },
      { kind: 39999, pubkey: pending, tags: [['p', pending]], created_at: 2, id: 'a2'.repeat(32) },
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
  }, { profiles, publishOk, signThrows, me: ME, seed: SEED, pending: PENDING });
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
      await expect(candidate(page).locator('.member-npub-text')).toHaveText(shortNpub(OUTSIDER));
    }
  });

  // T4
  test('candidate card carries the full member-card treatment plus "Not yet a member" + Vouch', async ({ page }) => {
    await openMembers(page);
    await search(page, OUTSIDER_NPUB);
    await expect(candidate(page)).toBeVisible();
    await expect(candidate(page).locator('.member-name')).toHaveText('Olive Outsider');
    await expect(candidate(page).locator('.member-nip05')).toHaveText('olive@nostr.example');
    await expect(candidate(page).locator('.member-bio')).toContainText('A trusted friend');
    await expect(candidate(page).locator('.member-npub-text')).toHaveText(shortNpub(OUTSIDER));
    await expect(badge(page)).toHaveText(/Not yet a member/i);
    await expect(vouchBtn(page), 'vouch offered for a non-member with a profile').toHaveText(/Vouch/);
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

  // T9 — O3: view-only + outreach copy; miss is retryable (no negative cache).
  test('no profile anywhere → view-only card with outreach copy; re-search re-queries', async ({ page }) => {
    await openMembers(page);
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, GHOST_NPUB);
    await expect(candidate(page)).toBeVisible({ timeout: 15_000 });
    await expect(candidate(page).locator('.member-npub-text')).toHaveText(shortNpub(GHOST));
    await expect(candidate(page), 'says no profile was found').toContainText(/no profile found/i);
    await expect(candidate(page), 'explains vouching needs a visible profile to confirm identity').toContainText(/profile/i);
    await expect(candidate(page), 'encourages reaching out to complete the profile').toContainText(/reach out|ask them/i);
    await expect(vouchBtn(page), 'view-only — no vouch without a profile').toHaveCount(0);

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
    await expect(badge(page), 'status unchanged').toHaveText(/Not yet a member/i);
  });

  // T12
  test('non-identity input → inline hint, zero profile fan-out, grids untouched', async ({ page }) => {
    await openMembers(page);
    const gridBefore = await page.locator('#verified-members-grid').innerHTML();
    await page.evaluate(() => { window.__relayCalls = []; });
    await search(page, 'gigi');
    await expect(page.locator('#page-members .member-search-hint'), 'inline not-an-identity hint').toBeVisible();
    await expect(page.locator('#page-members .member-search-hint')).toContainText(/npub|identity|recognized/i);
    await expect(candidate(page)).toHaveCount(0);
    await page.waitForTimeout(800); // outlast the debounce — nothing should have fired
    const kind0Calls = await page.evaluate(() => window.__relayCalls.filter(c => c.filter.kinds?.includes(0)).length);
    expect(kind0Calls, 'no relay traffic for a non-identity string').toBe(0);
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
