// E2E spec for Story 1 (epic community-feed): gated feed of verified members'
// Bitcoin/Nostr-hashtagged kind-1 notes. Written BEFORE implementation — these
// are expected to FAIL until the feature lands.
//
// No live relays: the app's global seams are overridden via page.evaluate —
//   - getTagItems()   → synthetic LFO tag items (membership input)
//   - queryRelay()    → synthetic nos.lol response (the feed fetch)
//   - fetchMetadata() → synthetic kind-0 profiles
//   - getFeed()       → the ADR's data-layer boundary; stubbed for render tests
//
// Selector / seam contract the implementation must satisfy (from ADR 0029):
//   DOM: #nav-feed-li (display:none until verified) > #nav-feed-btn ("Feed");
//        #page-feed (.page.hidden, toggled by showView('feed'));
//        #feed-header, #feed-loading, #feed-empty, #feed-notes;
//        .feed-note (clickable card) > .feed-note-name, .feed-note-npub,
//                    .feed-note-time, .feed-note-excerpt, .feed-note-open.
//   Globals (so window.<name> overrides take effect): getFeed, loadFeedPage,
//        makeFeedNote, showView, queryRelay, getTagItems, fetchMetadata,
//        plus window._nostrNoteEncode.
//   getFeed() → { memberCount, notes:[{ id, pubkey, created_at, content,
//                 author:{ displayName, npubShort } }] }, notes newest-first.

import { test, expect } from '@playwright/test';
import { nip19 } from 'nostr-tools';

const LFO_TAG_EVENT_ID = '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795';
const SEED_PUBKEY      = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const FEED_RELAY       = 'wss://nos.lol';
const FEED_HASHTAGS    = ['nostr', 'asknostr', 'grownostr', 'bitcoin', 'btc', 'lightning', 'sats', 'lfo'];

// Distinct, valid 32-byte hex pubkeys / ids for fixtures.
const A  = '11'.repeat(32);
const B  = '22'.repeat(32);
const C  = '33'.repeat(32);
const Z  = '44'.repeat(32); // a non-member
const ID = 'ab'.repeat(32); // a note id

// ── data-layer helpers (run in the browser via evaluate args) ────────────────
// A synthetic LFO tag item: tagger attests target as a member.
function lfoTagSrc() {
  return `(tagger, target) => ({ id: Math.random().toString(16).slice(2), pubkey: tagger,
    kind: 39999, created_at: 1730000000, content: '',
    tags: [['e','${LFO_TAG_EVENT_ID}'],['p',target],['polarity','1']] })`;
}

// Stub getTagItems so the given pubkeys are verified (SEED attests each).
async function stubMembership(page, ...verified) {
  await page.evaluate(({ seed, verified, mk }) => {
    const lfoTag = eval(mk);
    const items = verified.map((pk) => lfoTag(seed, pk));
    window.getTagItems = async () => items;
  }, { seed: SEED_PUBKEY, verified, mk: lfoTagSrc() });
}

// ── data-layer tests: getFeed() ──────────────────────────────────────────────
test.describe('Community feed — data layer (getFeed)', () => {
  // AC-3
  test('getFeed queries nos.lol for kind-1 notes restricted to verified members and the qualifying hashtags', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.getFeed), 'getFeed() must exist as a global').toBe('function');
    await stubMembership(page, A, B);

    const out = await page.evaluate(async ({ a, b }) => {
      window.__filter = null;
      window.queryRelay = async (url, filter) => {
        window.__filter = { url, filter };
        return [
          { id: 'n1', pubkey: a, kind: 1, created_at: 200, content: 'gm #nostr', tags: [['t','nostr']] },
          { id: 'n2', pubkey: b, kind: 1, created_at: 100, content: 'stacking #sats', tags: [['t','sats']] },
        ];
      };
      window.fetchMetadata = async () => new Map();
      const feed = await window.getFeed();
      return { filter: window.__filter, feed };
    }, { a: A, b: B });

    // Exclusion is enforced by the filter sent to the relay.
    expect(out.filter, 'getFeed must call queryRelay').toBeTruthy();
    expect(out.filter.url, 'feed content must come from nos.lol only').toBe(FEED_RELAY);
    expect(out.filter.filter.kinds, 'feed is kind-1 notes').toEqual([1]);
    expect([...out.filter.filter.authors].sort(), 'authors must be exactly the verified members (no seed, no non-members)')
      .toEqual([A, B].sort());
    expect([...out.filter.filter['#t']].sort(), 'must filter on the seven qualifying hashtags')
      .toEqual([...FEED_HASHTAGS].sort());

    // Returned notes are mapped to the contract shape.
    expect(out.feed.notes.length).toBe(2);
    const shapeOk = out.feed.notes.every((n) =>
      n.id && n.pubkey && typeof n.created_at === 'number' && typeof n.content === 'string'
      && n.author && typeof n.author.displayName === 'string' && typeof n.author.npubShort === 'string');
    expect(shapeOk, 'each note must match { id, pubkey, created_at, content, author:{displayName,npubShort} }').toBe(true);
  });

  // AC-4
  test('getFeed returns at most 100 notes, newest-first, when more qualify', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.getFeed)).toBe('function');
    await stubMembership(page, A);

    const notes = await page.evaluate(async ({ a }) => {
      window.queryRelay = async () => {
        // 150 notes by a single member, created_at 0..149, deliberately unsorted.
        const arr = [];
        for (let i = 0; i < 150; i++) arr.push({ id: 'e' + i, pubkey: a, kind: 1, created_at: i, content: 'n' + i, tags: [['t','nostr']] });
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
      };
      window.fetchMetadata = async () => new Map();
      const feed = await window.getFeed();
      return feed.notes.map((n) => n.created_at);
    }, { a: A });

    expect(notes.length, 'feed must cap at 100 notes').toBe(100);
    const descending = notes.every((t, i) => i === 0 || notes[i - 1] >= t);
    expect(descending, 'notes must be newest-first').toBe(true);
    expect(notes[0], 'the newest note (created_at 149) must be first').toBe(149);
    expect(Math.min(...notes), 'the kept 100 must be the newest (149..50)').toBe(50);
  });

  // AC-5 (data side: name resolution + fallback)
  test('getFeed resolves the display name from metadata, falling back to a truncated npub', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.getFeed)).toBe('function');
    await stubMembership(page, A, B);

    const byPubkey = await page.evaluate(async ({ a, b }) => {
      window.queryRelay = async () => ([
        { id: 'na', pubkey: a, kind: 1, created_at: 200, content: 'A #nostr', tags: [['t','nostr']] },
        { id: 'nb', pubkey: b, kind: 1, created_at: 100, content: 'B #btc',   tags: [['t','btc']] },
      ]);
      window.fetchMetadata = async () => new Map([[a, { display_name: 'Alice' }]]); // B has none
      const feed = await window.getFeed();
      const m = {};
      for (const n of feed.notes) m[n.pubkey] = n.author.displayName;
      return m;
    }, { a: A, b: B });

    expect(byPubkey[A], 'author with metadata uses their display name').toBe('Alice');
    expect(byPubkey[B], 'author without metadata falls back to a truncated npub').toMatch(/^npub1/);
    expect(byPubkey[B]).toContain('…');
  });

  // Avatar (data side: picture resolved + sanitized)
  test('getFeed includes a sanitized author.picture from metadata', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.getFeed)).toBe('function');
    await stubMembership(page, A, B);

    const pics = await page.evaluate(async ({ a, b }) => {
      window.queryRelay = async () => ([
        { id: 'pa', pubkey: a, kind: 1, created_at: 200, content: 'a', tags: [['t','nostr']] },
        { id: 'pb', pubkey: b, kind: 1, created_at: 100, content: 'b', tags: [['t','btc']] },
      ]);
      window.fetchMetadata = async () => new Map([
        [a, { picture: 'https://example.com/a.png' }],
        [b, { picture: 'javascript:alert(1)' }], // unsafe scheme
      ]);
      const feed = await window.getFeed();
      const m = {};
      for (const n of feed.notes) m[n.pubkey] = n.author.picture;
      return m;
    }, { a: A, b: B });

    expect(pics[A], 'an https picture passes through').toBe('https://example.com/a.png');
    expect(pics[B], 'a non-http(s) picture is dropped (sanitized to empty)').toBe('');
  });

  // AC-8 (data side: distinct-author count)
  test('getFeed reports memberCount as the number of distinct authors represented', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.getFeed)).toBe('function');
    await stubMembership(page, A, B, C);

    const memberCount = await page.evaluate(async ({ a, b, c }) => {
      window.queryRelay = async () => ([
        { id: 'x1', pubkey: a, kind: 1, created_at: 400, content: '#nostr', tags: [['t','nostr']] },
        { id: 'x2', pubkey: a, kind: 1, created_at: 300, content: '#bitcoin', tags: [['t','bitcoin']] },
        { id: 'x3', pubkey: b, kind: 1, created_at: 200, content: '#sats', tags: [['t','sats']] },
        { id: 'x4', pubkey: c, kind: 1, created_at: 100, content: '#lightning', tags: [['t','lightning']] },
      ]);
      window.fetchMetadata = async () => new Map();
      return (await window.getFeed()).memberCount;
    }, { a: A, b: B, c: C });

    expect(memberCount, '4 notes from 3 distinct authors → memberCount 3').toBe(3);
  });
});

// ── render-layer tests: loadFeedPage() / makeFeedNote() ──────────────────────
const NOTE = (over = {}) => ({
  id: ID, pubkey: A, created_at: Math.floor(Date.now() / 1000) - 3600,
  content: 'hello world #nostr',
  author: { displayName: 'Alice', npubShort: 'npub1aaaa…aaaaaa', picture: '' }, ...over,
});

// A tiny valid 1×1 PNG — loads successfully so the avatar <img> survives onload.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Stub getFeed and open the feed view.
async function openFeedWith(page, payload) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, payload);
  await page.evaluate(() => window.showView('feed'));
}

test.describe('Community feed — rendering (loadFeedPage / makeFeedNote)', () => {
  // AC-5 (render side)
  test('a feed card shows the display name, truncated npub, and post time', async ({ page }) => {
    await openFeedWith(page, { memberCount: 1, notes: [NOTE()] });
    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card, 'a feed card must render').toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.feed-note-name')).toHaveText('Alice');
    await expect(card.locator('.feed-note-npub')).toContainText('npub1');
    await expect(card.locator('.feed-note-time')).not.toBeEmpty();
  });

  // AC-6 (no length limit — full content shown)
  test('note text is shown in full, with no length limit or ellipsis', async ({ page }) => {
    const long = 'x'.repeat(600);
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: long }) ] });

    const excerpt = page.locator('#feed-notes .feed-note-excerpt').first();
    await expect(excerpt).toBeVisible({ timeout: 10_000 });
    const text = await excerpt.textContent();

    expect(text, 'the full note content must be shown, untruncated').toBe(long);
    expect(text.includes('…'), 'no ellipsis truncation').toBe(false);
  });

  // AC-7
  test('clicking a note opens it in Primal in a new tab, with no interaction controls present', async ({ page }) => {
    await openFeedWith(page, { memberCount: 1, notes: [NOTE({ id: ID })] });
    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // No zap/like/repost/reply/message controls anywhere in the feed.
    await expect(
      page.locator('#feed-notes').getByRole('button', { name: /zap|like|repost|reply|message|boost|comment/i }),
      'feed must have no interaction controls',
    ).toHaveCount(0);

    const expectedNote1 = nip19.noteEncode(ID);
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      card.click(),
    ]);
    expect(popup.url(), 'clicking a note opens that note in Primal').toContain('primal.net/e/' + expectedNote1);
  });

  // AC-8 (render side: header copy + singular/plural)
  test('the header reads "X members contributing to the discussion"', async ({ page }) => {
    await openFeedWith(page, { memberCount: 3, notes: [NOTE()] });
    await expect(page.locator('#feed-header')).toHaveText(/3 members contributing to the discussion/i, { timeout: 10_000 });

    await page.evaluate(() => { window.getFeed = async () => ({ memberCount: 1, notes: [
      { id: 'ee'.repeat(32), pubkey: '11'.repeat(32), created_at: 1730000000, content: 'solo', author: { displayName: 'Solo', npubShort: 'npub1c…c' } },
    ] }); });
    await page.evaluate(() => window.loadFeedPage());
    await expect(page.locator('#feed-header')).toHaveText(/1 member contributing to the discussion/i);
    await expect(page.locator('#feed-header')).not.toHaveText(/1 members/i);
  });

  // AC-9 (empty)
  test('an empty feed shows an empty-state message, not a blank screen', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [] });
    await expect(page.locator('#feed-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#feed-notes .feed-note')).toHaveCount(0);
  });

  // AC-9 (loading)
  test('a loading indicator is shown while the feed is fetching', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.showView)).toBe('function');
    // getFeed never resolves → the loading state must remain visible.
    await page.evaluate(() => { window.getFeed = () => new Promise(() => {}); window.showView('feed'); });
    await expect(page.locator('#feed-loading')).toBeVisible({ timeout: 10_000 });
  });
});

// ── avatar & side-panel tests ────────────────────────────────────────────────
test.describe('Community feed — avatar & side panels', () => {
  // AC: profile image top-right, initials fallback
  test('a feed card shows the author profile image when present, with an initials fallback when not', async ({ page }) => {
    await openFeedWith(page, { memberCount: 2, notes: [
      NOTE({ id: 'ab'.repeat(32), pubkey: A, author: { displayName: 'Alice', npubShort: 'npub1a…a', picture: PNG } }),
      NOTE({ id: 'cd'.repeat(32), pubkey: B, author: { displayName: 'Bob',   npubShort: 'npub1b…b', picture: '' } }),
    ] });
    const cards = page.locator('#feed-notes .feed-note');
    await expect(cards).toHaveCount(2, { timeout: 10_000 });

    // Card 1 (has picture): an avatar image is rendered.
    await expect(cards.nth(0).locator('.feed-note-avatar img'), 'author with a picture shows an image').toHaveCount(1);
    // Card 2 (no picture): no image, initials fallback shown instead.
    await expect(cards.nth(1).locator('.feed-note-avatar img'), 'author without a picture shows no image').toHaveCount(0);
    await expect(cards.nth(1).locator('.feed-note-avatar'), 'initials fallback is shown').toContainText(/B/i);
  });

  // AC: "Feed Source Relays" panel
  test('a "Feed Source Relays" panel lists the feed relay', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [] });
    const panel = page.locator('#feed-relays-panel');
    await expect(panel, 'the relays panel must render').toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText(/Feed Source Relays/i);
    await expect(panel).toContainText('nos.lol');
  });

  // AC: hashtag query list panel
  test('a panel lists the query hashtags the feed filters on', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [] });
    const panel = page.locator('#feed-hashtags-panel');
    await expect(panel, 'the hashtags panel must render').toBeVisible({ timeout: 10_000 });
    for (const h of FEED_HASHTAGS) {
      await expect(panel, `panel must list #${h}`).toContainText('#' + h);
    }
  });
});

// ── gating & nav tests ───────────────────────────────────────────────────────
// Sign in as a NIP-07 extension user with the given pubkey.
async function signInExtension(page, pubkey) {
  await page.addInitScript((pk) => {
    window.nostr = {
      getPublicKey: async () => pk,
      signEvent: async (e) => ({ ...e, id: 'x'.repeat(64), sig: 'y'.repeat(128), pubkey: pk }),
    };
  }, pubkey);
  await page.goto('/');
}

test.describe('Community feed — gating & nav', () => {
  // AC-1
  test('a verified member sees a Feed nav option and can open the feed', async ({ page }) => {
    await signInExtension(page, A);
    await stubMembership(page, A);
    await page.evaluate(() => { window.getFeed = async () => ({ memberCount: 0, notes: [] }); });

    await page.locator('#state-idle').getByRole('button', { name: /sign in with extension/i }).click();

    const feedNav = page.locator('#nav-feed-li');
    await expect(feedNav, 'a verified member must see the Feed nav option').toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#nav-feed-btn')).toHaveText(/feed/i);

    await page.locator('#nav-feed-btn').click();
    await expect(page.locator('#page-feed')).toBeVisible();
    await expect(page.locator('#page-feed')).not.toHaveClass(/hidden/);
  });

  // AC-2 (signed-out)
  test('a signed-out visitor does not see the Feed', async ({ page }) => {
    await page.goto('/');
    // The nav item exists in the static markup (like #nav-members-li) but is hidden until verified.
    await expect(page.locator('#nav-feed-li'), 'the Feed nav item must exist in the markup').toHaveCount(1);
    await expect(page.locator('#nav-feed-li'), 'the Feed nav must be hidden when signed out').toBeHidden();
  });

  // AC-2 (non-member)
  test('a non-member does not see the Feed', async ({ page }) => {
    await signInExtension(page, Z);
    await page.evaluate(() => { window.getTagItems = async () => []; }); // nobody verified → Z is a non-member

    await page.locator('#state-idle').getByRole('button', { name: /sign in with extension/i }).click();

    // The non-member lands on the not-member state and never gets the Feed nav.
    await expect(page.locator('#state-not-member')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#nav-feed-li'), 'the Feed nav item must exist in the markup').toHaveCount(1);
    await expect(page.locator('#nav-feed-li'), 'a non-member must not see the Feed nav').toBeHidden();
  });
});
