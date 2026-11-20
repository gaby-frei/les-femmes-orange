// E2E spec for note-tagging Story 3 (ADR 0050): the tag panel's "Applied by N members"
// line opens a list of the appliers. Feed, signer and publish are stubbed in-page.
// Written BEFORE implementation — RED until the applier list lands in makeFeedNote.
//
// Seam contract (ADR 0050 implementation notes):
//   DOM: inside .feed-note-tag-desc, a .feed-note-tag-appliers wrap holding
//        <button class="feed-note-tag-count" aria-expanded aria-controls> whose text is
//        exactly "Applied by N member(s)", and a hidden <ul class="feed-note-tag-applier-list">
//        with one <li> per distinct applier: "You" | memberNames[pk] | hexToNpubShort(pk).
//   Order: "You" first, then the rest in payload order.
//   Dismissal: Escape closes and refocuses the count; pointerdown outside closes.
//   Isolation: nothing inside opens Primal or collapses the tag panel.

import { test, expect } from '@playwright/test';

const ME = '11'.repeat(32);
const ALICE = 'a1'.repeat(32);
const BEA = 'b2'.repeat(32);
const NONAME = 'c3'.repeat(32);
const EVIL = 'e4'.repeat(32);
const OTHER = '22'.repeat(32);
const TA = 'ad'.repeat(32);
const TAG_AUTHOR = '6d'.repeat(32);
const NOTE_ID = 'cd'.repeat(32);     // tagged by Alice, Bea (dup), a no-name member, and me
const FRESH_ID = 'ef'.repeat(32);    // untagged — for the just-applied case
const SECOND_ID = 'f1'.repeat(32);   // a second tagged note — for press-outside

const tagCfg = (slug, name, description) => ({
  authorPubkey: TAG_AUTHOR, slug, name, description,
  headerAuthorPubkey: TAG_AUTHOR,
  headerCoord: `39999:${TAG_AUTHOR}:tagging:${slug}-tagging`,
});
const author = { displayName: 'Bea', npubShort: 'npub1be…aa', picture: '' };
const now = Math.floor(Date.now() / 1000);

function payload({ appliers = [ALICE, BEA, BEA, NONAME, ME] } = {}) {
  return {
    memberCount: 4, channelsAvailable: true, relayStatus: [],
    memberNames: { [ALICE]: 'Alice', [BEA]: 'Bea', [ME]: 'Me Myself', [EVIL]: '<img src=x onerror="window.__xss=1">Eve' },
    tagging: { taPubkey: TA, tags: [tagCfg('lfo-community', 'LFO Community', 'Community life.'), tagCfg('ask-lfo', 'Ask LFO', 'Questions.')] },
    notes: [
      { id: NOTE_ID, pubkey: OTHER, created_at: now - 600, content: 'a tagged note', channels: ['lfo'], media: [],
        taggedWith: [{ slug: 'lfo-community', name: 'LFO Community', description: 'Community life.', appliers }],
        taggers: [...new Set(appliers)], author },
      { id: FRESH_ID, pubkey: OTHER, created_at: now - 1200, content: 'an untagged note', channels: ['bitcoin'], media: [], author },
      { id: SECOND_ID, pubkey: OTHER, created_at: now - 1800, content: 'another tagged note', channels: ['lfo'], media: [],
        taggedWith: [{ slug: 'lfo-community', name: 'LFO Community', description: 'Community life.', appliers: [ALICE] }],
        taggers: [ALICE], author },
    ],
  };
}

async function openFeed(page, pool = payload()) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate(({ p, me }) => {
    window.getFeed = async () => p;
    currentPubkey = me;                       // top-level let — same global scope
    window._opened = []; window.open = (u) => { window._opened.push(u); return null; };
    window.LFOSigner = {
      get mode() { return 'extension'; },
      canSign: () => true,
      getPublicKey: async () => me,
      sign: async (u) => ({ ...u, id: 'f0'.repeat(32), pubkey: me, sig: '00'.repeat(64) }),
      clear: () => {},
    };
    window.publishEventToRelay = async (relay) => ({ ok: true, relay });
  }, { p: pool, me: ME });
  await page.evaluate(() => window.showView('feed'));
}

const card = (page, id) => page.locator(`#feed-notes .feed-note[data-note-id="${id}"]`);
const pill = (page, id) => card(page, id).locator('.feed-note-tag-pill').first();
const panel = (page, id) => card(page, id).locator('.feed-note-tag-desc').first();
const count = (page, id) => panel(page, id).locator('button.feed-note-tag-count');
const list = (page, id) => panel(page, id).locator('ul.feed-note-tag-applier-list');
const entries = (page, id) => list(page, id).locator('li');

async function openPanel(page, id = NOTE_ID) {
  await expect(pill(page, id)).toBeVisible({ timeout: 10_000 });
  await pill(page, id).click();
  await expect(panel(page, id)).toBeVisible();
}

test.describe('Tag appliers list (note-tagging Story 3)', () => {
  test('T1 — the count line is a closed disclosure button wired to its list', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await expect(count(page, NOTE_ID), 'count text unchanged (4 distinct appliers)').toHaveText('Applied by 4 members');
    await expect(count(page, NOTE_ID)).toHaveAttribute('aria-expanded', 'false');
    const listId = await list(page, NOTE_ID).getAttribute('id');
    expect(listId, 'list has an id').toBeTruthy();
    await expect(count(page, NOTE_ID), 'aria-controls points at the list').toHaveAttribute('aria-controls', listId);
    await expect(list(page, NOTE_ID), 'closed by default').toBeHidden();
  });

  test('T2 — click opens and closes the list', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await count(page, NOTE_ID).click();
    await expect(list(page, NOTE_ID)).toBeVisible();
    await expect(count(page, NOTE_ID)).toHaveAttribute('aria-expanded', 'true');
    await count(page, NOTE_ID).click();
    await expect(list(page, NOTE_ID), 'second press closes').toBeHidden();
    await expect(count(page, NOTE_ID)).toHaveAttribute('aria-expanded', 'false');
  });

  test('T3 — Enter and Space toggle the list from the keyboard', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await count(page, NOTE_ID).focus();
    await page.keyboard.press('Enter');
    await expect(list(page, NOTE_ID), 'Enter opens').toBeVisible();
    await page.keyboard.press('Space');
    await expect(list(page, NOTE_ID), 'Space closes').toBeHidden();
    await expect(panel(page, NOTE_ID), 'the tag panel stays open throughout').toBeVisible();
  });

  test('T4 — entries: You first, then names in payload order, npub fallback; duplicates collapse', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await count(page, NOTE_ID).click();
    const npub = await page.evaluate((pk) => hexToNpubShort(pk), NONAME);
    await expect(entries(page, NOTE_ID), 'You first, Bea once, no-name member as short npub')
      .toHaveText(['You', 'Alice', 'Bea', npub]);
  });

  test('T5 — the number of entries always equals the count', async ({ page }) => {
    await openFeed(page, payload({ appliers: [ALICE, ALICE, BEA] }));
    await openPanel(page);
    await expect(count(page, NOTE_ID)).toHaveText('Applied by 2 members');
    await count(page, NOTE_ID).click();
    await expect(entries(page, NOTE_ID)).toHaveCount(2);
  });

  test('T6 — a just-applied tag lists You without a reload', async ({ page }) => {
    await openFeed(page);
    await card(page, FRESH_ID).locator('.feed-note-tag-btn').click();
    await page.locator('#tag-modal .tag-option[data-slug="ask-lfo"]').click();
    await expect(page.locator('#tag-modal')).toBeHidden({ timeout: 10_000 });
    await openPanel(page, FRESH_ID);
    await expect(count(page, FRESH_ID)).toHaveText('Applied by 1 member');
    await count(page, FRESH_ID).click();
    await expect(entries(page, FRESH_ID)).toHaveText(['You']);
  });

  test('T7 — Escape closes the list and returns focus to the count line', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await count(page, NOTE_ID).click();
    await expect(list(page, NOTE_ID)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list(page, NOTE_ID)).toBeHidden();
    await expect(count(page, NOTE_ID), 'focus returns to the count').toBeFocused();
    await expect(panel(page, NOTE_ID), 'Escape does not close the tag panel').toBeVisible();
  });

  test('T8 — pressing outside closes the list; only one list stays open', async ({ page }) => {
    await openFeed(page);
    await openPanel(page, NOTE_ID);
    await openPanel(page, SECOND_ID);
    await count(page, NOTE_ID).click();
    await expect(list(page, NOTE_ID)).toBeVisible();
    await count(page, SECOND_ID).click();
    await expect(list(page, SECOND_ID)).toBeVisible();
    await expect(list(page, NOTE_ID), 'pressing another list closes the first').toBeHidden();
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await expect(list(page, SECOND_ID), 'press on the page closes it').toBeHidden();
  });

  test('T9 — using the list never opens Primal or collapses the tag panel', async ({ page }) => {
    await openFeed(page);
    await openPanel(page);
    await count(page, NOTE_ID).click();
    await entries(page, NOTE_ID).first().click();
    await count(page, NOTE_ID).click();
    expect(await page.evaluate(() => window._opened), 'no Primal tab').toEqual([]);
    await expect(panel(page, NOTE_ID), 'the tag panel is still open').toBeVisible();
    await expect(pill(page, NOTE_ID)).toHaveAttribute('aria-expanded', 'true');
  });

  test('T10 — a name containing markup is shown as plain text', async ({ page }) => {
    await openFeed(page, payload({ appliers: [EVIL] }));
    await openPanel(page);
    await count(page, NOTE_ID).click();
    await expect(entries(page, NOTE_ID)).toHaveText(['<img src=x onerror="window.__xss=1">Eve']);
    await expect(list(page, NOTE_ID).locator('img'), 'no element created from the name').toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('T11 — no appliers → no count line and no list (unchanged)', async ({ page }) => {
    await openFeed(page, payload({ appliers: [] }));
    await openPanel(page);
    await expect(panel(page, NOTE_ID).locator('.feed-note-tag-count')).toHaveCount(0);
    await expect(panel(page, NOTE_ID).locator('.feed-note-tag-applier-list')).toHaveCount(0);
  });
});
