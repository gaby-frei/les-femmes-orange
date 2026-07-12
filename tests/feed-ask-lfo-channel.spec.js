// E2E spec for Story 9 (epic community-feed): the Ask LFO channel pill and multi-pill
// notes. Written BEFORE implementation — the fourth banner button does not exist yet.
//
// Seam contract (ADR 0037 Decision 3):
//   #feed-channels gains a fourth static button:
//   <button class="feed-channel" data-channel="ask-lfo" aria-pressed="false">Ask LFO</button>
//   All #6 semantics (toggle, union filter, aria-pressed, uniform disable on
//   channelsAvailable=false) extend to it via the existing generic banner wiring.

import { test, expect } from '@playwright/test';

const A = '11'.repeat(32);
const Z = '99'.repeat(32);

const NOTE = (id, pubkey, channels, over = {}) => ({
  id, pubkey,
  created_at: over.created_at ?? Math.floor(Date.now() / 1000) - 3600,
  content: over.content ?? 'hello world',
  channels,
  ...(over.taggedWith ? { taggedWith: over.taggedWith } : {}),
  author: { displayName: over.displayName ?? 'Member', npubShort: 'npub1x…x', picture: '' },
});

function pool() {
  return {
    memberCount: 2,
    channelsAvailable: true,
    notes: [
      NOTE('q1', Z, ['ask-lfo'], {
        created_at: 4000, content: 'Where is the next LFO retreat?',
        taggedWith: [{ name: 'Ask LFO', description: 'This tag is reserved for notes posing a question directed at the Les Femmes Orange community.' }],
      }),
      NOTE('b1', A, ['bitcoin'], { created_at: 3000 }),
      NOTE('multi1', A, ['bitcoin', 'nostr'], {
        created_at: 2000, content: 'tagged both ways',
        taggedWith: [
          { name: 'Bitcoin', description: 'Bitcoin content for the LFO community.' },
          { name: 'Nostr', description: 'Nostr content for the LFO community.' },
        ],
      }),
    ],
  };
}

async function openFeedWith(page, payload) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate((p) => { window.getFeed = async () => p; }, payload);
  await page.evaluate(() => window.showView('feed'));
}

const pill = (page, ch) => page.locator(`#feed-channels .feed-channel[data-channel="${ch}"]`);
const cards = (page) => page.locator('#feed-notes .feed-note');
const cardById = (page, id) => page.locator(`#feed-notes .feed-note[data-note-id="${id}"]`);

test.describe('Community feed — Ask LFO channel (Story 9)', () => {
  test('the banner shows FOUR pills, including Ask LFO', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(page.locator('#feed-channels')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#feed-channels .feed-channel')).toHaveCount(4);
    await expect(pill(page, 'ask-lfo'), 'the new pill exists and is labeled').toHaveText(/Ask LFO/i);
    await expect(pill(page, 'ask-lfo')).toHaveAttribute('aria-pressed', 'false');
  });

  test('selecting Ask LFO alone shows exactly the ask-lfo-channel notes', async ({ page }) => {
    await openFeedWith(page, pool());
    await expect(cards(page)).toHaveCount(3, { timeout: 10_000 });
    await pill(page, 'ask-lfo').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardById(page, 'q1'), 'only the tagged question shows').toBeVisible();
  });

  test('Ask LFO unions with other selected channels (#6 semantics)', async ({ page }) => {
    await openFeedWith(page, pool());
    await pill(page, 'ask-lfo').click();
    await pill(page, 'bitcoin').click();
    await expect(cards(page), 'union of ask-lfo + bitcoin').toHaveCount(3);
  });

  test('channelsAvailable=false disables ALL FOUR pills (uniform degradation — PO decision)', async ({ page }) => {
    await openFeedWith(page, { ...pool(), channelsAvailable: false });
    await expect(cards(page)).toHaveCount(3, { timeout: 10_000 });
    for (const ch of ['bitcoin', 'nostr', 'lfo', 'ask-lfo']) {
      await expect(pill(page, ch), `${ch} pill disabled in degraded mode`).toBeDisabled();
    }
  });

  test('the Feed Source Relays panel lists the tagging relay alongside the feed relays', async ({ page }) => {
    await openFeedWith(page, pool());
    const items = page.locator('#feed-relays-list li');
    await expect(items, 'three relays listed: nos.lol, damus, tagging relay').toHaveCount(3, { timeout: 10_000 });
    const tagging = items.filter({ hasText: 'tags.brainstorm.world' });
    await expect(tagging, 'the tagging relay row renders').toHaveCount(1);
    await expect(tagging.locator('.relay-dot'), 'with the same status-dot chrome').toHaveCount(1);
  });

  test('a multi-tagged note renders one pill per tag, each toggling its own description independently', async ({ page }) => {
    await openFeedWith(page, pool());
    const notePills = cardById(page, 'multi1').locator('.feed-note-tag-pill');
    await expect(notePills).toHaveCount(2, { timeout: 10_000 });
    const btc = notePills.filter({ hasText: 'Bitcoin' });
    const nos = notePills.filter({ hasText: 'Nostr' });
    await btc.click();
    await expect(btc).toHaveAttribute('aria-expanded', 'true');
    await expect(nos, 'the sibling pill stays closed').toHaveAttribute('aria-expanded', 'false');
    const descs = cardById(page, 'multi1').locator('.feed-note-tag-desc');
    await expect(descs.filter({ hasText: /Bitcoin content/ })).toBeVisible();
    await expect(descs.filter({ hasText: /Nostr content/ })).toBeHidden();
  });
});
