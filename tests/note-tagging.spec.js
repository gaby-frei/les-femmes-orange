// E2E spec for note-tagging Story 1: a non-functional demo. A circular plus button on each feed
// note opens a shared "Add a tag" modal with two toggle views ("Search existing" / "Apply new"),
// both showing "No support for event tags yet. Check back later." (ADR 0035). Written BEFORE
// implementation — expected to FAIL until the trigger button + modal land.
//
// Seam contract the implementation must satisfy (ADR 0035):
//   DOM: .feed-note .feed-note-tag-btn (circular +, aria-label "Add a tag") on every card;
//        #tag-modal (shared overlay, display:none until opened) with title "Add a tag",
//        .tag-modal-close, two .tag-tab[data-tab="search"|"apply"] toggle buttons
//        (active via aria-selected="true"), and #tag-modal-message holding the not-yet text.
//   The plus button MUST stopPropagation so the card's open-in-Primal click never fires.
//   Purely inert: no window.open, no network, no storage writes.

import { test, expect } from '@playwright/test';

const A = '11'.repeat(32);
const B = '22'.repeat(32);
const MSG = 'No support for event tags yet. Check back later.';

const NOTE = (id, pubkey, over = {}) => ({
  id, pubkey,
  created_at: over.created_at ?? Math.floor(Date.now() / 1000) - 3600,
  content: over.content ?? 'hello world',
  channels: over.channels ?? [],
  author: { displayName: over.displayName ?? 'Member', npubShort: 'npub1x…x', picture: '' },
});

// Stub getFeed and open the feed view (same pattern as community-feed.spec.js).
async function openFeedWith(page, notes) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, { memberCount: notes.length, channelsAvailable: true, notes });
  await page.evaluate(() => window.showView('feed'));
}

// Install a window.open spy so we can prove the plus button does NOT open Primal.
async function spyWindowOpen(page) {
  await page.evaluate(() => {
    window.__opened = [];
    const real = window.open;
    window.open = (...args) => { window.__opened.push(args[0]); return null; };
    window.__realOpen = real;
  });
}
const openedCount = (page) => page.evaluate(() => window.__opened.length);

const tagBtn   = (page, i = 0) => page.locator('#feed-notes .feed-note .feed-note-tag-btn').nth(i);
const modal    = (page) => page.locator('#tag-modal');
const tab      = (page, name) => page.locator(`#tag-modal .tag-tab[data-tab="${name}"]`);

test.describe('Note tagging — demo UI (Story 1)', () => {
  // AC-1
  test('every feed note shows a circular "Add a tag" plus button', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A), NOTE('b'.repeat(64), B)]);
    const cards = page.locator('#feed-notes .feed-note');
    await expect(cards).toHaveCount(2, { timeout: 10_000 });
    const btns = page.locator('#feed-notes .feed-note .feed-note-tag-btn');
    await expect(btns, 'one tag button per card').toHaveCount(2);
    await expect(btns.first(), 'tag button is labelled for assistive tech').toHaveAttribute('aria-label', /add a tag/i);
  });

  // AC-2
  test('clicking the plus opens the "Add a tag" popup', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    await expect(modal(page)).toBeHidden();
    await tagBtn(page).click();
    await expect(modal(page), 'the tag modal opens on click').toBeVisible({ timeout: 10_000 });
    await expect(modal(page), 'modal title is "Add a tag"').toContainText(/Add a tag/i);
  });

  // AC-3 — the crux: the plus is a distinct control, not the card's Primal link.
  test('clicking the plus does not open the note in Primal', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    await spyWindowOpen(page);
    await tagBtn(page).click();
    await expect(modal(page)).toBeVisible({ timeout: 10_000 });
    expect(await openedCount(page), 'the plus must not trigger open-in-Primal').toBe(0);

    // Positive control: clicking the card body DOES open Primal (proves the spy works).
    await page.evaluate(() => window.closeTagModal && window.closeTagModal());
    await page.locator('#feed-notes .feed-note .feed-note-head').first().click();
    expect(await openedCount(page), 'the card body still opens Primal').toBe(1);
  });

  // AC-4
  test('the popup has two toggle views with exactly one active at a time', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    await tagBtn(page).click();
    await expect(tab(page, 'search')).toHaveText(/Search existing/i);
    await expect(tab(page, 'apply')).toHaveText(/Apply new/i);

    // Exactly one selected initially.
    await expect(tab(page, 'search')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'apply')).toHaveAttribute('aria-selected', 'false');

    // Toggling switches the active view.
    await tab(page, 'apply').click();
    await expect(tab(page, 'apply'), 'clicking a tab makes it active').toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'search'), 'the other tab deactivates').toHaveAttribute('aria-selected', 'false');
  });

  // AC-5
  test('both views show the "no support yet" message', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    await tagBtn(page).click();
    const message = page.locator('#tag-modal-message');
    await expect(message, 'message shown under the default (Search existing) view').toHaveText(MSG);
    await tab(page, 'apply').click();
    await expect(message, 'same message under the Apply new view').toHaveText(MSG);
  });

  // AC-6
  test('the popup can be dismissed via the close control and by clicking the backdrop', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    // close button
    await tagBtn(page).click();
    await expect(modal(page)).toBeVisible({ timeout: 10_000 });
    await page.locator('#tag-modal .tag-modal-close').click();
    await expect(modal(page), 'close control hides the modal').toBeHidden();
    // backdrop click (the overlay outside the panel — top-left corner)
    await tagBtn(page).click();
    await expect(modal(page)).toBeVisible();
    await modal(page).click({ position: { x: 5, y: 5 } });
    await expect(modal(page), 'clicking the backdrop hides the modal').toBeHidden();
  });

  // AC-7 — non-functional: no publish/sign/persist/network on any interaction.
  test('opening, toggling, and closing the modal performs no network, navigation, or storage writes', async ({ page }) => {
    await openFeedWith(page, [NOTE('a'.repeat(64), A)]);
    await spyWindowOpen(page);

    const sideEffects = [];
    page.on('request', (req) => {
      const u = req.url();
      if (/\/api\//.test(u) || /primal/.test(u) || u.startsWith('ws')) sideEffects.push(u);
    });
    const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

    await tagBtn(page).click();
    await tab(page, 'apply').click();
    await tab(page, 'search').click();
    await page.locator('#tag-modal .tag-modal-close').click();

    expect(await openedCount(page), 'no navigation/window.open').toBe(0);
    expect(sideEffects, 'no api/relay/primal requests fired').toEqual([]);
    const storageAfter = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storageAfter, 'localStorage is untouched').toBe(storageBefore);
  });

  // AC-8 — gating: the affordance lives inside the gated feed.
  test('a signed-out visitor sees no tag button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.feed-note-tag-btn'), 'no tag affordance before the gated feed is reached').toHaveCount(0);
  });
});
