// E2E spec for note-tagging Story 2 (ADR 0040): "Search existing" applies a real tagging
// attestation. Signer + publish + feed are all stubbed in-page; what these tests pin is
// the CLIENT contract: list rendering from the armed payload, applied-state, the
// local-mode consent panel (PO copy, every apply), the §2 wire shape handed to the
// signer, single-relay publish, optimistic reflection, and every recovery path.
// Written BEFORE implementation — RED until the modal is wired.
//
// Seam contract (ADR 0040 implementation notes):
//   Payload: top-level `tagging` = { taPubkey, tags:[{authorPubkey, slug, name, description,
//            headerAuthorPubkey, headerCoord}] }; notes' taggedWith entries carry slug+appliers.
//   DOM (Search existing, armed): .tag-option[data-slug] rows (name + description),
//        data-applied="true" when the signed-in member is among that tag's appliers on this note;
//        unarmed → #tag-modal-message /unavailable/i.
//   Consent (LFOSigner.mode === 'local' only, EVERY apply): #tag-modal .tag-consent showing the
//        tag name, "create a public Nostr event signed with your key" + the member's npub-short,
//        and "publish the Nostr event to the community tagging relay";
//        .tag-consent-cancel returns to the list; .tag-consent-confirm = "Sign & publish".
//   Extension mode: selection goes straight to LFOSigner.sign (no in-app consent).
//   Publish: window.publishEventToRelay(TAGGING_RELAY, signed, …) — exactly once per apply.
//   Errors: .tag-modal-error inline; failed publish shows NO optimistic state.
//   Success: modal closes, #tag-toast confirmation, the card gains the tag's pill.

import { test, expect } from '@playwright/test';

const ME = '11'.repeat(32);      // the signed-in member (MEMBER_1-style)
const OTHER = '22'.repeat(32);
const TA = 'ad'.repeat(32);
const TAG_AUTHOR = '6d'.repeat(32);
const NOTE_ID = 'cd'.repeat(32);
const TAGGED_ID = 'ef'.repeat(32);

const SUPPORTED = ['lfo-community', 'bitcoin', 'nostr', 'ask-lfo'];
const tagCfg = (slug, name, description) => ({
  authorPubkey: TAG_AUTHOR, slug, name, description,
  headerAuthorPubkey: TAG_AUTHOR,
  headerCoord: `39999:${TAG_AUTHOR}:tagging:${slug}-tagging`,
});

function payload() {
  return {
    memberCount: 2, channelsAvailable: true, memberNames: {}, relayStatus: [],
    tagging: {
      taPubkey: TA,
      tags: [
        tagCfg('lfo-community', 'LFO Community', 'Community life.'),
        tagCfg('bitcoin', 'Bitcoin', 'Bitcoin content.'),
        tagCfg('nostr', 'Nostr', 'Nostr content.'),
        tagCfg('ask-lfo', 'Ask LFO', 'Questions for the community.'),
      ],
    },
    notes: [
      { id: NOTE_ID, pubkey: OTHER, created_at: Math.floor(Date.now() / 1000) - 600,
        content: 'an untagged note', channels: ['bitcoin'], media: [],
        author: { displayName: 'Bea', npubShort: 'npub1be…aa', picture: '' } },
      { id: TAGGED_ID, pubkey: OTHER, created_at: Math.floor(Date.now() / 1000) - 1200,
        content: 'already tagged by me', channels: ['lfo'], media: [],
        taggedWith: [{ slug: 'lfo-community', name: 'LFO Community', description: 'Community life.', appliers: [ME] }],
        taggers: [ME],
        author: { displayName: 'Bea', npubShort: 'npub1be…aa', picture: '' } },
    ],
  };
}

// Stub feed + signer + publish; open the feed. mode: 'local' | 'extension'.
async function openArmedFeed(page, { mode = 'local', publishOk = true, signThrows = false, pool = payload() } = {}) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate(({ p, mode, publishOk, signThrows, me }) => {
    window.getFeed = async () => p;
    currentPubkey = me;                       // top-level let — same global scope
    window.__signed = []; window.__published = [];
    window.LFOSigner = {
      get mode() { return mode; },
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
  }, { p: pool, mode, publishOk, signThrows, me: ME });
  await page.evaluate(() => window.showView('feed'));
}

const card = (page, id) => page.locator(`#feed-notes .feed-note[data-note-id="${id}"]`);
const modal = (page) => page.locator('#tag-modal');
const option = (page, slug) => page.locator(`#tag-modal .tag-option[data-slug="${slug}"]`);
const consent = (page) => page.locator('#tag-modal .tag-consent');

async function openModalOn(page, noteId) {
  await card(page, noteId).locator('.feed-note-tag-btn').click();
  await expect(modal(page)).toBeVisible({ timeout: 10_000 });
}

test.describe('Apply attestation — Search existing (note-tagging Story 2)', () => {
  test('Search existing lists exactly the four armed tags with live names and descriptions', async ({ page }) => {
    await openArmedFeed(page);
    await openModalOn(page, NOTE_ID);
    await expect(page.locator('#tag-modal .tag-option')).toHaveCount(4);
    for (const slug of SUPPORTED) await expect(option(page, slug)).toBeVisible();
    await expect(option(page, 'ask-lfo')).toContainText('Ask LFO');
    await expect(option(page, 'ask-lfo')).toContainText('Questions for the community.');
  });

  test('a tag this member already applied is marked applied yet still clickable (idempotent re-apply)', async ({ page }) => {
    await openArmedFeed(page);
    await openModalOn(page, TAGGED_ID);
    const applied = option(page, 'lfo-community');
    await expect(applied, 'marked from taggedWith[].appliers').toHaveAttribute('data-applied', 'true');
    await applied.click();                       // local mode → consent, then confirm
    await page.locator('#tag-modal .tag-consent-confirm').click();
    await expect(page.locator('#tag-toast')).toBeVisible();
    expect(await page.evaluate(() => window.__published.length), 're-apply publishes (replaceable overwrite)').toBe(1);
  });

  test('local mode: the consent panel appears with the PO copy and the member\'s npub; Cancel signs and publishes nothing', async ({ page }) => {
    await openArmedFeed(page, { mode: 'local' });
    await openModalOn(page, NOTE_ID);
    await option(page, 'bitcoin').click();
    await expect(consent(page)).toBeVisible();
    await expect(consent(page)).toContainText(/Sign & publish this tag\?/i);
    await expect(consent(page)).toContainText('Bitcoin');
    await expect(consent(page)).toContainText(/create a public Nostr event signed with your key/i);
    await expect(consent(page), 'shows the member\'s own npub-short').toContainText(/npub1/);
    await expect(consent(page)).toContainText(/publish the Nostr event to the community tagging relay/i);

    await page.locator('#tag-modal .tag-consent-cancel').click();
    await expect(consent(page), 'Cancel returns to the list').toBeHidden();
    await expect(option(page, 'bitcoin')).toBeVisible();
    expect(await page.evaluate(() => window.__signed.length), 'nothing signed').toBe(0);
    expect(await page.evaluate(() => window.__published.length), 'nothing published').toBe(0);
  });

  test('local mode: confirm signs a §2-shaped assertion and publishes it once to the tagging relay', async ({ page }) => {
    await openArmedFeed(page, { mode: 'local' });
    await openModalOn(page, NOTE_ID);
    await option(page, 'ask-lfo').click();
    await page.locator('#tag-modal .tag-consent-confirm').click();
    await expect(page.locator('#tag-toast')).toBeVisible();

    const signed = await page.evaluate(() => window.__signed);
    expect(signed.length, 'exactly one unsigned event handed to the signer').toBe(1);
    const ev = signed[0];
    expect(ev.kind).toBe(39999);
    const tags = ev.tags;
    expect(tags).toContainEqual(['e', NOTE_ID]);
    expect(tags).toContainEqual(['z', `39998:${TA}:nostr-event-tag`]);
    expect(tags).toContainEqual(['z', `39999:${TAG_AUTHOR}:tagging:ask-lfo-tagging`]);
    expect(tags).toContainEqual(['polarity', '1']);
    expect(tags, 'deterministic replaceability key')
      .toContainEqual(['d', `event-tag-ask-lfo-${NOTE_ID.slice(0, 8)}-${ME.slice(0, 8)}`]);

    const published = await page.evaluate(() => window.__published);
    expect(published.length, 'published exactly once').toBe(1);
    expect(published[0].relay).toMatch(/tags\.brainstorm\.world\/relay/);
    expect(published[0].event.sig, 'the SIGNED event is what goes out').toBeTruthy();
  });

  test('success reflects optimistically: pill on the card, modal closed, no page reload', async ({ page }) => {
    await openArmedFeed(page);
    await expect(card(page, NOTE_ID).locator('.feed-note-tag-pill')).toHaveCount(0);
    await openModalOn(page, NOTE_ID);
    await option(page, 'ask-lfo').click();
    await page.locator('#tag-modal .tag-consent-confirm').click();
    await expect(modal(page)).toBeHidden();
    await expect(card(page, NOTE_ID).locator('.feed-note-tag-pill'), 'the tag pill appears immediately')
      .toHaveText(/Ask LFO/);
    // Amendment (2026-07-13): the optimistic entry counts its applier immediately.
    await card(page, NOTE_ID).locator('.feed-note-tag-pill').click();
    await expect(card(page, NOTE_ID).locator('.feed-note-tag-count'),
      'the just-applied member is counted without a reload').toHaveText('Applied by 1 member');
  });

  test('extension mode: no in-app consent — selection goes straight to the signer', async ({ page }) => {
    await openArmedFeed(page, { mode: 'extension' });
    await openModalOn(page, NOTE_ID);
    await option(page, 'nostr').click();
    await expect(consent(page)).toHaveCount(0);
    await expect(page.locator('#tag-toast')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__signed.length)).toBe(1);
  });

  test('signer declined → modal recovers, nothing published', async ({ page }) => {
    await openArmedFeed(page, { mode: 'extension', signThrows: true });
    await openModalOn(page, NOTE_ID);
    await option(page, 'bitcoin').click();
    await expect(page.locator('#tag-modal .tag-modal-error')).toBeVisible();
    expect(await page.evaluate(() => window.__published.length)).toBe(0);
    await expect(card(page, NOTE_ID).locator('.feed-note-tag-pill'), 'no optimistic state').toHaveCount(0);
  });

  test('relay rejection → inline error, no optimistic state, retry publishes again', async ({ page }) => {
    await openArmedFeed(page, { mode: 'local', publishOk: false });
    await openModalOn(page, NOTE_ID);
    await option(page, 'bitcoin').click();
    await page.locator('#tag-modal .tag-consent-confirm').click();
    await expect(page.locator('#tag-modal .tag-modal-error')).toBeVisible();
    await expect(card(page, NOTE_ID).locator('.feed-note-tag-pill')).toHaveCount(0);
    await page.locator('#tag-modal .tag-consent-confirm').click();   // retry (idempotent d-tag)
    expect(await page.evaluate(() => window.__published.length), 'retry re-publishes').toBe(2);
  });

  test('unarmed payload (no `tagging` field) → Search existing shows the unavailable message; nothing applies', async ({ page }) => {
    const pool = payload(); delete pool.tagging;
    await openArmedFeed(page, { pool });
    await openModalOn(page, NOTE_ID);
    await expect(page.locator('#tag-modal .tag-option')).toHaveCount(0);
    await expect(page.locator('#tag-modal-message')).toContainText(/unavailable/i);
    expect(await page.evaluate(() => window.__published.length)).toBe(0);
  });

  test('Apply new remains a placeholder with the updated copy; interacting with it publishes nothing', async ({ page }) => {
    await openArmedFeed(page);
    await openModalOn(page, NOTE_ID);
    await page.locator('#tag-modal .tag-tab[data-tab="apply"]').click();
    await expect(page.locator('#tag-modal-message')).toContainText(/authoring new tags isn.t supported yet/i);
    await page.locator('#tag-modal .tag-modal-close').click();
    expect(await page.evaluate(() => window.__signed.length)).toBe(0);
    expect(await page.evaluate(() => window.__published.length)).toBe(0);
  });
});
