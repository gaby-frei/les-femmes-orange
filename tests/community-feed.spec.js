// E2E spec for Story 1 (epic community-feed): gated feed of verified members'
// Bitcoin/Nostr-hashtagged kind-1 notes. Written BEFORE implementation — these
// are expected to FAIL until the feature lands.
//
// No live relays: the app's global seams are overridden via page.evaluate —
//   - getTagItems()   → synthetic LFO tag items (membership input)
//   - queryRelay()    → synthetic feed-relay response (nos.lol + primal, the feed fetch)
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
//        makeFeedNote, showView, queryRelay, queryRelayStatus, getTagItems,
//        fetchMetadata, plus window._nostrNoteEncode.
//   getFeed() → { memberCount, notes:[{ id, pubkey, created_at, content,
//                 author:{ displayName, npubShort } }], relayStatus:[{ url, ok }] },
//                 notes newest-first.

import { test, expect } from '@playwright/test';
import { nip19 } from 'nostr-tools';

const LFO_TAG_EVENT_ID = '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795';
const SEED_PUBKEY      = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const FEED_HASHTAGS    = ['nostr', 'asknostr', 'bitcoin', 'btc', 'lightning', 'sats', 'lfo', 'LFO', 'lesfemmesorange'];

// Distinct, valid 32-byte hex pubkeys / ids for fixtures.
const A  = '11'.repeat(32);
const B  = '22'.repeat(32);
const C  = '33'.repeat(32);
const Z  = '44'.repeat(32); // a non-member
const ID = 'ab'.repeat(32); // a note id

// Build real Nostr mention strings for the mention-resolution tests (Story 4).
const npubOf     = hex => nip19.npubEncode(hex);
const nprofileOf = hex => nip19.nprofileEncode({ pubkey: hex });

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

// ── data-layer tests removed 2026-06-21 (story #5, ADR 0033) ──────────────
// 5 getFeed() data-layer tests lived here. They asserted the OLD *client-side* feed
// pipeline (relay query → merge → slice 100 → metadata → author/memberCount) by stubbing
// window.queryRelayStatus / getTagItems / fetchMetadata. ADR 0033 moved that pipeline
// server-side to GET /api/feed, so getFeed() is now just `fetch('/api/feed')` and no
// longer touches those seams — the tests became obsolete by design. Coverage relocated to:
//   test/select-relevant.test.js  — newest-first ordering + slice to displayLimit
//   test/feed-handler.test.js     — contract shape, displayName/npub fallback, memberCount
//   test/classify-notes.test.js   — relevance scoring / cache reuse / fallback
//   tests/feed-api.spec.js        — getFeed() sources /api/feed; AI key absent from client
// Live relay-query + picture-sanitization behavior is intentionally NOT re-asserted in
// npm test (relay I/O needs the network); see the test plan “Approach”.

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

// 1×1 PNG bytes — served for the test image host so feed <img>s actually load
// (the onerror handler removes images that fail, which would make assertions flaky).
const ONE_PX_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// Fulfill any request to the test image host with a valid image. No live network.
async function routeImages(page) {
  await page.route(/img\.test/, route => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG }));
}
const IMG = n => `https://img.test/${n}.jpg`;

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

  // AC-8 (render side: header title + member-count subtitle, singular/plural)
  test('the header shows the title and a member-count subtitle', async ({ page }) => {
    await openFeedWith(page, { memberCount: 3, notes: [NOTE()] });
    const header = page.locator('#feed-header');
    await expect(header).toContainText(/What LFO members are saying/i, { timeout: 10_000 });
    await expect(header).toContainText(/3 members contributing across the latest 100 posts/i);

    await page.evaluate(() => { window.getFeed = async () => ({ memberCount: 1, notes: [
      { id: 'ee'.repeat(32), pubkey: '11'.repeat(32), created_at: 1730000000, content: 'solo', author: { displayName: 'Solo', npubShort: 'npub1c…c' } },
    ] }); });
    await page.evaluate(() => window.loadFeedPage());
    await expect(header).toContainText(/1 member contributing across the latest 100 posts/i);
    await expect(header).not.toContainText(/1 members/i);
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
  test('a "Feed Source Relays" panel lists the feed relays', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [] });
    const panel = page.locator('#feed-relays-panel');
    await expect(panel, 'the relays panel must render').toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText(/Feed Source Relays/i);
    await expect(panel).toContainText('nos.lol');
    await expect(panel, 'the damus augment relay must also be listed').toContainText('damus.io');
  });

  // AC: each relay shows a live status dot — green if it responded, red if it failed.
  test('each feed relay shows a status dot: green when it responds, red when it fails', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [], relayStatus: [
      { url: 'wss://nos.lol',         ok: true  },
      { url: 'wss://relay.damus.io',  ok: false },
    ] });
    const okDot   = page.locator('#feed-relays-panel .relay-dot[data-relay-host="nos.lol"]');
    const failDot = page.locator('#feed-relays-panel .relay-dot[data-relay-host="relay.damus.io"]');
    await expect(okDot,   'a relay that responded is marked ok').toHaveClass(/relay-dot-ok/,   { timeout: 10_000 });
    await expect(failDot, 'a relay that failed is marked fail').toHaveClass(/relay-dot-fail/, { timeout: 10_000 });
    await expect(okDot,   'the ok dot is not also marked fail').not.toHaveClass(/relay-dot-fail/);
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

  // AC: case-sensitivity is surfaced in the Topics panel
  test('the Topics panel notes that hashtags are case sensitive', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, notes: [] });
    const panel = page.locator('#feed-hashtags-panel');
    await expect(panel, 'the hashtags panel must render').toBeVisible({ timeout: 10_000 });
    await expect(panel, 'panel must note case sensitivity').toContainText(/case[- ]sensitive/i);
  });
});

// ── inline image / content-parsing tests (Story 3) ───────────────────────────
test.describe('Community feed — content parsing helpers (Story 3)', () => {
  test('parseNoteContent extracts image URLs and strips them from the text', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.parseNoteContent), 'parseNoteContent must be a global').toBe('function');
    const r = await page.evaluate(() =>
      window.parseNoteContent('hi https://img.test/a.jpg and https://img.test/b.png bye'));
    expect(r.images.length, 'both image URLs extracted').toBe(2);
    expect(r.images).toContain('https://img.test/a.jpg');
    expect(r.text, 'image URLs stripped from text').not.toContain('img.test/a.jpg');
    expect(r.text).toContain('hi');
    expect(r.text).toContain('bye');
  });

  test('shortenUrl strips the scheme and truncates long URLs', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.shortenUrl), 'shortenUrl must be a global').toBe('function');
    const out = await page.evaluate(() =>
      window.shortenUrl('https://imgproxy.example/aHR0cHM6Ly9zb21lLXZlcnktbG9uZy1iYXNlNjQtc3RyaW5n'));
    expect(out.startsWith('imgproxy.example'), 'host preserved, scheme stripped').toBe(true);
    expect(out.endsWith('…'), 'long URL truncated with an ellipsis').toBe(true);
    expect(out.length, 'shortened form is short').toBeLessThan(40);
  });
});

test.describe('Community feed — inline images (Story 3)', () => {
  // AC1 + AC4
  test('a single image URL renders as an image, no overlay, and is removed from the text', async ({ page }) => {
    await routeImages(page);
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: `look at this ${IMG(1)} please` }) ] });

    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const media = card.locator('.feed-note-media');
    await expect(media, 'a media grid renders').toHaveCount(1);
    await expect(media.locator('.feed-note-media-tile'), 'one tile for one image').toHaveCount(1);
    await expect(media.locator('img'), 'image rendered as <img>').toHaveCount(1);
    await expect(media.locator('img').first()).toHaveAttribute('src', /img\.test\/1\.jpg/);
    await expect(card.locator('.feed-note-media-overlay'), 'no overlay for a single image').toHaveCount(0);

    const excerpt = card.locator('.feed-note-excerpt');
    await expect(excerpt).toContainText('look at this');
    await expect(excerpt, 'the raw image URL is removed from the text').not.toContainText('img.test/1.jpg');
  });

  // AC2
  test('two image URLs render as two side-by-side tiles', async ({ page }) => {
    await routeImages(page);
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: `a ${IMG(1)} b ${IMG(2)} c` }) ] });

    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.feed-note-media-tile'), 'two tiles').toHaveCount(2);
    await expect(card.locator('.feed-note-media img'), 'two images').toHaveCount(2);
    await expect(card.locator('.feed-note-media-overlay'), 'no overlay for exactly two').toHaveCount(0);
  });

  // AC3
  test('more than two images show a "+N" overlay on the second tile', async ({ page }) => {
    await routeImages(page);
    const content = `gallery ${IMG(1)} ${IMG(2)} ${IMG(3)} ${IMG(4)} ${IMG(5)}`; // 5 images
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content }) ] });

    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const tiles = card.locator('.feed-note-media-tile');
    await expect(tiles, 'only the first two render').toHaveCount(2);
    await expect(tiles.nth(0).locator('.feed-note-media-overlay'), 'first tile has no overlay').toHaveCount(0);
    const overlay = tiles.nth(1).locator('.feed-note-media-overlay');
    await expect(overlay, 'second tile carries the overlay').toHaveCount(1);
    await expect(overlay, '5 images → +3 extras').toHaveText(/\+3/);
  });

  // AC5
  test('a non-image URL is shown shortened and is not a clickable link', async ({ page }) => {
    const longUrl = 'https://imgproxy.example/aHR0cHM6Ly9zb21lLXZlcnktbG9uZy1iYXNlNjQtc3RyaW5nLWhlcmU';
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: `check ${longUrl} out` }) ] });

    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const excerpt = card.locator('.feed-note-excerpt');
    await expect(excerpt, 'host stays visible').toContainText('imgproxy.example');
    await expect(excerpt, 'shortened with an ellipsis').toContainText('…');
    await expect(excerpt, 'the full-length URL is not shown').not.toContainText(longUrl);
    await expect(card.locator('.feed-note-media'), 'a non-image URL is not rendered as media').toHaveCount(0);
    await expect(card.locator('a'), 'shortened link is display-only (not an anchor)').toHaveCount(0);
  });

  // AC6
  test('a note with no URLs renders plain text with no media grid', async ({ page }) => {
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: 'just a plain note, nothing special' }) ] });
    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.feed-note-excerpt')).toContainText('just a plain note, nothing special');
    await expect(card.locator('.feed-note-media'), 'no media grid when there are no images').toHaveCount(0);
  });

  // AC7 (security)
  test('hostile content renders as inert text — no injected image, no script', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', d => { dialogFired = true; d.dismiss(); });

    const hostile = 'pre <img src=x onerror=alert(1)> mid javascript:alert(2)//evil.jpg and data:image/png;base64,AAAA end';
    await openFeedWith(page, { memberCount: 1, notes: [ NOTE({ content: hostile }) ] });

    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    // No element injected from the hostile tokens (none are valid http(s) images):
    await expect(card.locator('img[src="x"]'), 'no injected <img> from raw HTML').toHaveCount(0);
    await expect(card.locator('.feed-note-media'), 'no media grid from non-http(s) "images"').toHaveCount(0);
    // The markup is shown as escaped, inert text:
    await expect(card.locator('.feed-note-excerpt')).toContainText('onerror=alert(1)');
    await page.waitForTimeout(300);
    expect(dialogFired, 'no script/dialog runs from note content').toBe(false);
  });
});

// ── mention resolution tests (Story 4) ───────────────────────────────────────
test.describe('Community feed — mention resolution helper (Story 4)', () => {
  test('resolveMentions resolves member mentions (npub, nprofile, bare) to @DisplayName', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.resolveMentions), 'resolveMentions must be a global').toBe('function');

    const names = { [B]: 'Bob' };
    const forms = [`nostr:${npubOf(B)}`, `nostr:${nprofileOf(B)}`, npubOf(B)];
    for (const form of forms) {
      const out = await page.evaluate(({ t, names }) => window.resolveMentions(t, names), { t: `gm ${form} ok`, names });
      expect(out, `member mention (${form.slice(0, 16)}…) resolves to @Bob`).toContain('@Bob');
      expect(out, 'the raw mention token is replaced').not.toContain(form);
    }
  });

  test('resolveMentions shortens unknown mentions to @npub… and leaves malformed tokens unchanged', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => typeof window.resolveMentions)).toBe('function');

    // Unknown pubkey (not in names) → shortened @npub… handle.
    const unknown = await page.evaluate(({ t }) => window.resolveMentions(t, {}), { t: `hi nostr:${npubOf(Z)} bye` });
    expect(unknown, 'unknown mention shortened to @npub…').toContain('@npub1');
    expect(unknown).toContain('…');
    expect(unknown, 'full-length npub is not shown').not.toContain(npubOf(Z));

    // Malformed token → left unchanged, no throw.
    const malformed = await page.evaluate(() => window.resolveMentions('x nostr:npub1zzz y', {}));
    expect(malformed, 'malformed token left as-is').toContain('npub1zzz');
  });
});

test.describe('Community feed — mention resolution (render, Story 4)', () => {
  // AC1
  test('a member mention renders as @DisplayName from the feed payload', async ({ page }) => {
    await openFeedWith(page, {
      memberCount: 1,
      notes: [ NOTE({ pubkey: A, content: `gm nostr:${npubOf(B)} 🚀` }) ],
      memberNames: { [B]: 'Bob' },
    });
    const excerpt = page.locator('#feed-notes .feed-note-excerpt').first();
    await expect(excerpt).toBeVisible({ timeout: 10_000 });
    await expect(excerpt).toContainText('@Bob');
    await expect(excerpt, 'the full npub is not shown').not.toContainText(npubOf(B));
  });

  // AC2
  test('a non-member mention renders as a shortened @npub handle', async ({ page }) => {
    await openFeedWith(page, {
      memberCount: 1,
      notes: [ NOTE({ pubkey: A, content: `hi nostr:${npubOf(Z)}` }) ],
      memberNames: {},
    });
    const excerpt = page.locator('#feed-notes .feed-note-excerpt').first();
    await expect(excerpt).toBeVisible({ timeout: 10_000 });
    await expect(excerpt).toContainText('@npub1');
    await expect(excerpt).toContainText('…');
    await expect(excerpt, 'full-length npub not shown').not.toContainText(npubOf(Z));
  });

  // AC3
  test('member mentions resolve on a cold feed load (no Members visit)', async ({ page }) => {
    await openFeedWith(page, {
      memberCount: 1,
      notes: [ NOTE({ pubkey: A, content: `cc nostr:${npubOf(B)}` }) ],
      memberNames: { [B]: 'Bob' },
    });
    const excerpt = page.locator('#feed-notes .feed-note-excerpt').first();
    await expect(excerpt).toBeVisible({ timeout: 10_000 });
    await expect(excerpt).toContainText('@Bob');
    // Proof we never went through the Members page (its grid was never populated):
    await expect(page.locator('#verified-members-grid > *'), 'Members page was not loaded').toHaveCount(0);
  });

  // AC4 (guard)
  test('a note with no mentions is rendered unchanged', async ({ page }) => {
    await openFeedWith(page, {
      memberCount: 1,
      notes: [ NOTE({ pubkey: A, content: 'hello world, no mentions here' }) ],
      memberNames: { [B]: 'Bob' },
    });
    const excerpt = page.locator('#feed-notes .feed-note-excerpt').first();
    await expect(excerpt).toBeVisible({ timeout: 10_000 });
    await expect(excerpt).toContainText('hello world, no mentions here');
    expect(await excerpt.textContent(), 'no stray @ inserted').not.toContain('@');
  });

  // AC5 (security guard)
  test('a malformed/hostile mention token renders inert — no script, no injection', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', d => { dialogFired = true; d.dismiss(); });

    await openFeedWith(page, {
      memberCount: 1,
      notes: [ NOTE({ pubkey: A, content: 'pre nostr:npub1zzz <b>boom</b> end' }) ],
      memberNames: {},
    });
    const card = page.locator('#feed-notes .feed-note').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.feed-note-excerpt')).toContainText('<b>boom</b>'); // escaped, shown as text
    await expect(card.locator('.feed-note-excerpt')).toContainText('npub1zzz');    // malformed token left as-is
    await expect(card.locator('b'), 'no injected element').toHaveCount(0);
    await page.waitForTimeout(300);
    expect(dialogFired, 'no script/dialog runs').toBe(false);
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
