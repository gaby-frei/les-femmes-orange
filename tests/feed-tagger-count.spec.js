// E2E spec for Story 10 (epic community-feed): the "Z active content taggers" header
// line. Written BEFORE implementation — RED until renderFeedNotes emits the line.
//
// Seam contract (ADR 0038): notes carry optional `taggers: [hex…]`; the header subtitle
// gains a second line computed over the VISIBLE pool — `new Set(flatMap taggers).size` —
// re-rendered on every channel toggle, always present (zero included), singular at 1.
// The existing members/posts line is unchanged.

import { test, expect } from '@playwright/test';

const A = '11'.repeat(32);
const ALICE = 'a1'.repeat(32);
const BOB = 'b2'.repeat(32);

const NOTE = (id, pubkey, channels, over = {}) => ({
  id, pubkey,
  created_at: over.created_at ?? Math.floor(Date.now() / 1000) - 3600,
  content: over.content ?? 'hello world',
  channels,
  ...(over.taggers ? { taggers: over.taggers } : {}),
  author: { displayName: 'Member', npubShort: 'npub1x…x', picture: '' },
});

// alice tags two notes (lfo + ask-lfo), bob co-tags one; the bitcoin note is untagged.
function pool() {
  return {
    memberCount: 2,
    channelsAvailable: true,
    notes: [
      NOTE('t1', A, ['lfo'], { created_at: 4000, taggers: [ALICE, BOB] }),
      NOTE('t2', A, ['ask-lfo'], { created_at: 3000, taggers: [ALICE] }),
      NOTE('b1', A, ['bitcoin'], { created_at: 2000 }),
    ],
  };
}

async function openFeedWith(page, payload) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, payload);
  await page.evaluate(() => window.showView('feed'));
}

const header = (page) => page.locator('#feed-header');
const pill = (page, ch) => page.locator(`#feed-channels .feed-channel[data-channel="${ch}"]`);

test.describe('Community feed — active content taggers line (Story 10)', () => {
  test('the header shows the taggers line beneath members/posts, deduped across notes and tags', async ({ page }) => {
    await openFeedWith(page, pool());
    // alice (2 notes) + bob (1 note) = 2 distinct taggers over the full pool.
    await expect(header(page), 'second line present with deduped count').toContainText(/2 active content taggers/i, { timeout: 10_000 });
    await expect(header(page), 'the existing first line is unchanged').toContainText(/2 members contributing across/i);
  });

  test('the count follows the channel selection live, including down to zero', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(header(page)).toContainText(/2 active content taggers/i, { timeout: 10_000 });
    await pill(page, 'ask-lfo').click();       // visible: t2 → alice only
    await expect(header(page), 'scoped to visible notes').toContainText(/1 active content tagger\b/i);
    await pill(page, 'ask-lfo').click();
    await pill(page, 'bitcoin').click();       // visible: b1 → no taggers
    await expect(header(page), 'zero state renders, never hides').toContainText(/0 active content taggers/i);
  });

  test('singular copy at exactly one tagger', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'ask-lfo').click();
    await expect(header(page)).toContainText(/1 active content tagger(?!s)/i, { timeout: 10_000 });
  });

  test('a pool with no tagged notes still shows the line at zero', async ({ page }) => {
    await openFeedWith(page, { memberCount: 1, channelsAvailable: true, notes: [NOTE('b9', A, ['bitcoin'])] });
    await expect(header(page)).toContainText(/0 active content taggers/i, { timeout: 10_000 });
  });
});
