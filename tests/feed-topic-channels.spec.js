// E2E spec for Story 6 (epic community-feed): topic channels — a filter banner of toggleable
// pills (Bitcoin / NOSTR / LFO Community) that filter the already-fetched feed client-side using
// the per-note `channels` array (ADR 0034). Written BEFORE implementation — expected to FAIL until
// the banner, filtering, degraded mode, header recompute, and panel rename land.
//
// Seam contract the implementation must satisfy (ADR 0034):
//   DOM: #feed-channels (banner above #feed-notes) containing
//        .feed-channel[data-channel="bitcoin|nostr|lfo"] toggle buttons,
//        labels "Bitcoin" / "NOSTR" / "LFO Community";
//        selected state via aria-pressed="true"; disabled via the native `disabled` attribute.
//   Payload: getFeed() → { memberCount, channelsAvailable, notes:[{ ...,
//            channels:[...] }] }; filtering is client-side (no re-fetch on toggle).
//   #feed-hashtags-panel title text is "Source Hashtags" (renamed from "Topics").

import { test, expect } from '@playwright/test';

const A = '11'.repeat(32);
const B = '22'.repeat(32);

// A note carrying its server-computed channels array.
const NOTE = (id, pubkey, channels, over = {}) => ({
  id, pubkey,
  created_at: over.created_at ?? Math.floor(Date.now() / 1000) - 3600,
  content: over.content ?? 'hello world',
  channels,
  author: { displayName: over.displayName ?? 'Member', npubShort: 'npub1x…x', picture: '' },
});

// Stub getFeed and open the feed view (same pattern as community-feed.spec.js).
async function openFeedWith(page, payload) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, payload);
  await page.evaluate(() => window.showView('feed'));
}

const pill = (page, ch) => page.locator(`#feed-channels .feed-channel[data-channel="${ch}"]`);
const cards = (page) => page.locator('#feed-notes .feed-note');
const cardById = (page, id) => page.locator(`#feed-notes .feed-note[data-note-id="${id}"]`);

// A standard 3-note pool: n1 bitcoin (A), n2 nostr (B), n3 both (A).
function pool() {
  return {
    memberCount: 2,
    channelsAvailable: true,
    notes: [
      NOTE('n1', A, ['bitcoin'], { created_at: 3000, displayName: 'Ann' }),
      NOTE('n2', B, ['nostr'],   { created_at: 2000, displayName: 'Bea' }),
      NOTE('n3', A, ['bitcoin', 'nostr'], { created_at: 1000, displayName: 'Ann' }),
    ],
  };
}

test.describe('Community feed — topic channels (Story 6)', () => {
  // AC-1
  test('a filter banner shows Bitcoin / NOSTR / LFO Community toggle pills', async ({ page }) => {
    await openFeedWith(page, pool());
    const banner = page.locator('#feed-channels');
    await expect(banner, 'the topic-channels banner must render').toBeVisible({ timeout: 10_000 });
    await expect(pill(page, 'bitcoin')).toHaveText(/Bitcoin/i);
    await expect(pill(page, 'nostr')).toHaveText(/NOSTR/i);
    await expect(pill(page, 'lfo')).toHaveText(/LFO Community/i);
  });

  // AC-2
  test('on load no pill is selected and every note is shown', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(cards(page)).toHaveCount(3, { timeout: 10_000 });
    for (const ch of ['bitcoin', 'nostr', 'lfo']) {
      await expect(pill(page, ch), `${ch} starts unselected`).toHaveAttribute('aria-pressed', 'false');
    }
  });

  // AC-3
  test('selecting one channel shows only notes in that channel', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(cards(page)).toHaveCount(3, { timeout: 10_000 });
    await pill(page, 'bitcoin').click();
    // n1 (bitcoin) + n3 (bitcoin,nostr) match; n2 (nostr only) is hidden.
    await expect(cards(page)).toHaveCount(2);
    await expect(cardById(page, 'n1')).toBeVisible();
    await expect(cardById(page, 'n3')).toBeVisible();
    await expect(cardById(page, 'n2')).toHaveCount(0);
  });

  // AC-4
  test('selecting two channels shows their union with no duplicate cards', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'bitcoin').click();
    await pill(page, 'nostr').click();
    // Union = all three notes; n3 (in both channels) must appear exactly once.
    await expect(cards(page)).toHaveCount(3);
    await expect(cardById(page, 'n3'), 'a note in both channels appears once').toHaveCount(1);
  });

  // AC-5
  test('a note in two channels appears under each when selected', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'bitcoin').click();
    await expect(cardById(page, 'n3'), 'n3 shows under Bitcoin').toBeVisible();
    await pill(page, 'bitcoin').click(); // deselect bitcoin
    await pill(page, 'nostr').click();
    await expect(cardById(page, 'n3'), 'n3 also shows under NOSTR').toBeVisible();
  });

  // AC-6
  test('deselecting the last channel restores the full feed', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'bitcoin').click();
    await expect(cards(page)).toHaveCount(2);
    await pill(page, 'bitcoin').click(); // deselect → none selected
    await expect(cards(page), 'zero selected = show everything').toHaveCount(3);
  });

  // AC-7
  test('a pill reflects its selected state via aria-pressed', async ({ page }) => {
    await openFeedWith(page, pool());
    const btc = pill(page, 'bitcoin');
    await expect(btc).toHaveAttribute('aria-pressed', 'false');
    await btc.click();
    await expect(btc, 'selected pill is pressed').toHaveAttribute('aria-pressed', 'true');
    await btc.click();
    await expect(btc, 'deselected pill is not pressed').toHaveAttribute('aria-pressed', 'false');
  });

  // AC-8
  test('a selection that matches no note shows the empty state', async ({ page }) => {
    // Pool has no lfo-channel notes; selecting LFO Community filters to zero.
    await openFeedWith(page, pool());
    await pill(page, 'lfo').click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('#feed-empty'), 'an empty filter result shows the empty state').toBeVisible();
  });

  // AC-9
  test('when channels are unavailable the pills are disabled and all notes show', async ({ page }) => {
    await openFeedWith(page, { ...pool(), channelsAvailable: false });
    await expect(cards(page), 'all notes still show when channels are unavailable').toHaveCount(3, { timeout: 10_000 });
    for (const ch of ['bitcoin', 'nostr', 'lfo']) {
      await expect(pill(page, ch), `${ch} pill is disabled when channels are unavailable`).toBeDisabled();
    }
  });

  // AC-10
  test('filtering preserves the payload (newest-first) order', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'bitcoin').click();
    // Payload order is n1 (newest) then n3; filtering must not reorder.
    const ids = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-note-id')));
    expect(ids).toEqual(['n1', 'n3']);
  });

  // AC-11
  test('the header member/post counts reflect the filtered subset', async ({ page }) => {
    await openFeedWith(page, pool());
    const header = page.locator('#feed-header');
    await expect(header).toContainText(/2 members/i, { timeout: 10_000 }); // whole pool: A, B
    await pill(page, 'bitcoin').click(); // → n1, n3, both authored by A
    await expect(header, 'distinct authors recomputed over the filtered subset').toContainText(/1 member\b/i);
    await expect(header, 'post count reflects the 2 shown notes, not the whole pool').toContainText(/\b2 posts\b/i);
  });

  // AC-12
  test('the hashtag panel is titled "Source Hashtags"', async ({ page }) => {
    await openFeedWith(page, { memberCount: 0, channelsAvailable: true, notes: [] });
    const title = page.locator('#feed-hashtags-panel .feed-panel-title');
    await expect(title, 'the hashtag panel is renamed').toContainText(/Source Hashtags/i, { timeout: 10_000 });
    await expect(title, '"Topics" no longer titles the hashtag panel').not.toContainText(/^\s*Topics/i);
  });
});
