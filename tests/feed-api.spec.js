// L5 — E2E (Story 5): the client sources the feed from the server endpoint /api/feed,
// and the AI key never reaches the browser. Written BEFORE implementation.
//
// - "getFeed() sources from /api/feed" is RED until getFeed()'s body becomes
//   `return (await fetch('/api/feed')).json()` (ADR 0033 / 0029 migration).
// - "no AI key in client code" is a GUARD — already green today; it must STAY green
//   (the key lives only in the serverless function, never shipped to the browser).
import { test, expect } from '@playwright/test';

const PAYLOAD = {
  memberCount: 2,
  notes: [
    { id: 'a1', pubkey: '11'.repeat(32), created_at: 1_730_000_200, content: 'lightning stuff ⚡', author: { displayName: 'Ada', npubShort: 'npub1a…a', picture: '' } },
    { id: 'b2', pubkey: '22'.repeat(32), created_at: 1_730_000_100, content: 'nostr stuff', author: { displayName: 'Bee', npubShort: 'npub1b…b', picture: '' } },
  ],
};

test('getFeed() sources the feed from GET /api/feed', async ({ page }) => {
  let hit = false;
  await page.route('**/api/feed', (route) => {
    hit = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) });
  });
  await page.goto('/');
  const result = await page.evaluate(() => window.getFeed());
  expect(hit, 'getFeed() should request /api/feed').toBe(true);
  expect(result).toEqual(PAYLOAD);
});

test('GUARD: the AI API key never appears in client-delivered code', async ({ page }) => {
  await page.goto('/');
  const html = await page.content();
  expect(html).not.toMatch(/sk-ant-/);
  expect(html).not.toMatch(/ANTHROPIC_API_KEY/);
});
