// E2E spec for Story 8's UI amendment (epic community-feed): the tag pill. A note
// sourced by the event-tag provider carries `taggedWith: [{ name, description }]` and
// renders a toggleable pill beneath its content; toggling reveals the tag description.
// Written BEFORE implementation — expected to FAIL until the pill lands in makeFeedNote.
//
// Seam contract the implementation must satisfy (ADR 0036 amendment C1):
//   DOM: inside a .feed-note card, a .feed-note-tags row containing one
//        <button class="feed-note-tag-pill" aria-expanded="false"> per taggedWith entry
//        (label = entry name), and a .feed-note-tag-desc panel revealed on toggle
//        (text = entry description). Empty description → pill has aria-disabled="true",
//        no panel, no aria-expanded toggling.
//   Isolation: pill/panel interaction never triggers the card's open-in-Primal handler.
//   Absence: a note with no taggedWith renders no .feed-note-tags row.

import { test, expect } from '@playwright/test';

const A = '11'.repeat(32);
const Z = '99'.repeat(32);

const DESC = 'This tag denotes content relevant to the Les Femmes Orange community itself — its members, initiatives, events, and community life.';

const NOTE = (id, pubkey, over = {}) => ({
  id, pubkey,
  created_at: over.created_at ?? Math.floor(Date.now() / 1000) - 3600,
  content: over.content ?? 'hello world',
  channels: over.channels ?? ['lfo'],
  ...(over.taggedWith ? { taggedWith: over.taggedWith } : {}),
  author: { displayName: over.displayName ?? 'Member', npubShort: 'npub1x…x', picture: '' },
});

function pool() {
  return {
    memberCount: 2,
    channelsAvailable: true,
    notes: [
      NOTE('tagged1', Z, { created_at: 3000, taggedWith: [{ name: 'LFO Community', description: DESC }], content: 'my garden this morning' }),
      NOTE('plain1', A, { created_at: 2000, channels: ['bitcoin'] }),
      NOTE('fallback1', Z, { created_at: 1000, taggedWith: [{ name: 'lfo-community', description: '' }] }),
    ],
  };
}

// Stub getFeed and open the feed view (same pattern as feed-topic-channels.spec.js).
async function openFeedWith(page, payload) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, payload);
  await page.evaluate(() => window.showView('feed'));
}

const card = (page, id) => page.locator(`#feed-notes .feed-note[data-note-id="${id}"]`);
const pillOf = (page, id) => card(page, id).locator('.feed-note-tag-pill');
const descOf = (page, id) => card(page, id).locator('.feed-note-tag-desc');

test.describe('Community feed — tag pill (Story 8 UI amendment)', () => {
  test('a tagged note shows a pill labeled with the tag name beneath its content', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(card(page, 'tagged1')).toBeVisible({ timeout: 10_000 });
    await expect(pillOf(page, 'tagged1'), 'the pill renders on the tagged note').toHaveText(/LFO Community/);
  });

  test('an untagged note renders no pill row', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(card(page, 'plain1')).toBeVisible({ timeout: 10_000 });
    await expect(card(page, 'plain1').locator('.feed-note-tags'), 'no taggedWith → no pill chrome').toHaveCount(0);
  });

  test('clicking the pill toggles the description open and closed, tracked by aria-expanded', async ({ page }) => {
    await openFeedWith(page, pool());
    const pill = pillOf(page, 'tagged1');
    const desc = descOf(page, 'tagged1');
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await expect(desc).toBeHidden();

    await pill.click();
    await expect(pill, 'open state is exposed to AT').toHaveAttribute('aria-expanded', 'true');
    await expect(desc, 'the description panel is revealed').toBeVisible();
    await expect(desc).toContainText(/denotes content relevant to the Les Femmes Orange community/);

    await pill.click();
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await expect(desc, 'toggling again hides the panel').toBeHidden();
  });

  test('the pill toggles from the keyboard (Enter and Space)', async ({ page }) => {
    await openFeedWith(page, pool());
    const pill = pillOf(page, 'tagged1');
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await pill.focus();
    await page.keyboard.press('Enter');
    await expect(pill).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(pill, 'Space toggles it back closed').toHaveAttribute('aria-expanded', 'false');
  });

  test('pill and description clicks never trigger the card\'s open-in-Primal action', async ({ page }) => {
    await openFeedWith(page, pool());
    // Record window.open calls instead of letting them spawn tabs.
    await page.evaluate(() => { window._opened = []; window.open = (u) => { window._opened.push(u); return null; }; });
    const pill = pillOf(page, 'tagged1');
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await pill.click();                       // open the panel
    await descOf(page, 'tagged1').click();    // click inside the panel
    await pill.click();                       // close it again
    expect(await page.evaluate(() => window._opened), 'no Primal tab from pill interaction').toEqual([]);
    // Sanity: the card body still opens Primal (isolation, not suppression).
    await card(page, 'tagged1').locator('.feed-note-excerpt').click();
    expect(await page.evaluate(() => window._opened.length), 'the card link still works').toBe(1);
  });

  test('a slug-fallback entry (empty description) renders an inert pill', async ({ page }) => {
    await openFeedWith(page, pool());
    const pill = pillOf(page, 'fallback1');
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await expect(pill).toHaveText(/lfo-community/);
    await expect(pill, 'no description → inert toggle').toHaveAttribute('aria-disabled', 'true');
    await pill.click({ force: true });
    await expect(descOf(page, 'fallback1'), 'no panel ever appears').toHaveCount(0);
    await expect(pill).not.toHaveAttribute('aria-expanded', 'true');
  });
});
