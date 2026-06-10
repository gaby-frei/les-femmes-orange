// E2E spec for Story 1 (epic local-signing): in-browser local signing for non-NIP-07 users.
// Written BEFORE implementation — these are expected to FAIL until the feature lands.
//
// A fresh Playwright browser has no `window.nostr`, so every test here runs as a
// "no NIP-07 extension" user (the exact case the feature targets), except the one
// test that injects a mock extension to guard the unchanged extension path.
//
// Selector contract the implementation must satisfy (from ADR 0028):
//   - New sign-in states `#state-set-passphrase` and `#state-unlock` (toggled by showState()).
//   - Each new state's primary action uses the app's `.signin-full-btn` button convention.
//   - Set-passphrase state has two `input[type="password"]` fields (passphrase + confirm).
//   - Unlock state has one `input[type="password"]` and surfaces an error on a bad passphrase.
//   - Persisted account lives in localStorage key `lfo_account` and contains only an
//     `ncryptsec` — never the raw nsec or secret-key hex.

import { test, expect } from '@playwright/test';
import { generateSecretKey, getPublicKey, nip19, verifyEvent } from 'nostr-tools';
import { encrypt as nip49encrypt } from 'nostr-tools/nip49';

const LFO_TAG_EVENT_ID = '4ddde08a7b1b3c2dffda5161ff5b0151554b9e86d94a059b1434aab95d546795';
const SEED_PUBKEY = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const PASS = 'correct-horse-battery-staple';

function mintAccount(passphrase = PASS) {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return {
    sk,
    skHex: Buffer.from(sk).toString('hex'),
    pubkey,
    npub: nip19.npubEncode(pubkey),
    nsec: nip19.nsecEncode(sk),
    ncryptsec: nip49encrypt(sk, passphrase),
  };
}

// Drive the idle-state "sign in with your secret key" form.
async function enterNsecOnIdle(page, nsec) {
  await page.goto('/');
  const input = page.locator('#manual-key-input');
  await expect(input).toBeVisible();
  await input.fill(nsec);
  await page.locator('#state-idle').getByRole('button', { name: 'Continue' }).click();
}

// Seed a returning-user account into localStorage before the page scripts run.
async function seedStoredAccount(page, acct) {
  await page.addInitScript((account) => {
    localStorage.setItem('lfo_account', JSON.stringify(account));
  }, { pubkey: acct.pubkey, npub: acct.npub, ncryptsec: acct.ncryptsec, createdAt: 1730000000 });
}

// Generate a new key in-app, back it up (download) so the sign-in gate clears, and
// continue to the passphrase screen.
async function generateKeyAndBackup(page) {
  await page.goto('/');
  await page.locator('#state-idle').getByRole('button', { name: /generate a key pair/i }).click();
  await page.locator('#state-generate').getByRole('button', { name: /generate my key pair/i }).click();
  const download = page.waitForEvent('download');
  await page.locator('#state-secure').getByRole('button', { name: /download key backup/i }).click();
  await download;
  await page.locator('#state-secure').getByRole('button', { name: /sign in to check status/i }).click();
}

test.describe('Local signer — sign-in & passphrase setup', () => {
  // AC-1
  test('entering a secret key prompts the user to set a passphrase (not immediate sign-in)', async ({ page }) => {
    const acct = mintAccount();
    await enterNsecOnIdle(page, acct.nsec);
    await expect(page.locator('#state-set-passphrase')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#state-set-passphrase input[type="password"]')).toHaveCount(2);
  });

  // AC-2 (security-critical invariant)
  test('after setting a passphrase, localStorage holds only an ncryptsec — never the raw nsec or secret hex', async ({ page }) => {
    const acct = mintAccount();
    await enterNsecOnIdle(page, acct.nsec);

    const pw = page.locator('#state-set-passphrase input[type="password"]');
    await expect(pw).toHaveCount(2, { timeout: 10_000 });
    await pw.nth(0).fill(PASS);
    await pw.nth(1).fill(PASS);
    await page.locator('#state-set-passphrase .signin-full-btn').first().click();

    // Once the passphrase is set, we leave the set-passphrase state.
    await expect(page.locator('#state-set-passphrase')).toBeHidden({ timeout: 15_000 });

    const stored = await page.evaluate(() => localStorage.getItem('lfo_account'));
    expect(stored, 'an encrypted account must be persisted').toBeTruthy();
    expect(stored).toContain('ncryptsec1');

    const allStorage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(allStorage, 'raw nsec must never be persisted').not.toContain(acct.nsec);
    expect(allStorage, 'raw secret-key hex must never be persisted').not.toContain(acct.skHex);
  });

  // AC-9
  test('passphrase setup warns that the passphrase is unrecoverable and the nsec must be backed up', async ({ page }) => {
    const acct = mintAccount();
    await enterNsecOnIdle(page, acct.nsec);
    const state = page.locator('#state-set-passphrase');
    await expect(state).toBeVisible({ timeout: 10_000 });
    await expect(state).toContainText(/can.?t be recovered|cannot be recovered|unrecoverable/i);
    await expect(state).toContainText(/back ?up|backup|nsec/i);
  });

  // AC-9 (generate path) — the warning must also appear when a key is generated in-app,
  // not only when an existing nsec is pasted.
  test('generating a key in-app also reaches the passphrase warning', async ({ page }) => {
    await generateKeyAndBackup(page);

    const state = page.locator('#state-set-passphrase');
    await expect(state).toBeVisible({ timeout: 10_000 });
    await expect(state).toContainText(/can.?t be recovered|cannot be recovered|unrecoverable/i);
    await expect(state).toContainText(/back ?up|backup|nsec/i);
  });

  // Backup gate: trying to sign in before saving the generated key warns first and blocks.
  test('signing in without backing up the generated key shows a warning and blocks until acknowledged', async ({ page }) => {
    await page.goto('/');
    await page.locator('#state-idle').getByRole('button', { name: /generate a key pair/i }).click();
    await page.locator('#state-generate').getByRole('button', { name: /generate my key pair/i }).click();
    // Do NOT back up — go straight for sign-in.
    await page.locator('#state-secure').getByRole('button', { name: /sign in to check status/i }).click();

    const modal = page.locator('#backup-warning-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#state-set-passphrase')).toBeHidden();

    // Acknowledging the risk proceeds to the passphrase screen.
    await modal.getByRole('button', { name: /understand the risk|continue/i }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#state-set-passphrase')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Local signer — returning user (unlock)', () => {
  // AC-3
  test('a returning user is asked to unlock with a passphrase, not to re-enter their nsec', async ({ page }) => {
    const acct = mintAccount();
    await seedStoredAccount(page, acct);
    await page.goto('/');

    await expect(page.locator('#state-unlock')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#state-unlock input[type="password"]')).toHaveCount(1);
    // The nsec entry form should NOT be the active path for a returning user.
    await expect(page.locator('#manual-key-input')).toBeHidden();
  });

  // AC-3 (correct passphrase)
  test('the correct passphrase unlocks and leaves the unlock screen', async ({ page }) => {
    const acct = mintAccount();
    await seedStoredAccount(page, acct);
    // Avoid live-relay dependence: membership computes against an empty tag set.
    await page.goto('/');
    await page.evaluate(() => { window.getTagItems = async () => []; });

    await expect(page.locator('#state-unlock')).toBeVisible({ timeout: 10_000 });
    await page.locator('#state-unlock input[type="password"]').fill(PASS);
    await page.locator('#state-unlock .signin-full-btn').first().click();

    await expect(page.locator('#state-unlock')).toBeHidden({ timeout: 15_000 });
  });

  // AC-4
  test('a wrong passphrase shows an error and does not sign the user in', async ({ page }) => {
    const acct = mintAccount();
    await seedStoredAccount(page, acct);
    await page.goto('/');

    await expect(page.locator('#state-unlock')).toBeVisible({ timeout: 10_000 });
    await page.locator('#state-unlock input[type="password"]').fill('the-wrong-passphrase');
    await page.locator('#state-unlock .signin-full-btn').first().click();

    await expect(page.locator('#state-unlock')).toBeVisible();
    await expect(page.locator('#state-unlock')).toContainText(/incorrect|wrong|invalid/i);
  });
});

test.describe('Local signer — signing membership events', () => {
  // AC-6
  test('a local-key non-member can apply, producing a validly signed application event', async ({ page }) => {
    const acct = mintAccount();
    await enterNsecOnIdle(page, acct.nsec);

    const pw = page.locator('#state-set-passphrase input[type="password"]');
    await expect(pw).toHaveCount(2, { timeout: 10_000 });
    await pw.nth(0).fill(PASS);
    await pw.nth(1).fill(PASS);
    // No live relays / membership: behave as a brand-new non-member, capture publishes.
    await page.evaluate(() => { window.getTagItems = async () => []; });
    await page.locator('#state-set-passphrase .signin-full-btn').first().click();

    await expect(page.locator('#state-not-member')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      window.__published = [];
      window.publishEventToRelay = (url, ev) => { window.__published.push(ev); return Promise.resolve({ ok: true, relay: url }); };
    });

    await page.locator('#state-not-member').getByRole('button', { name: /apply/i }).click();
    await page.locator('#state-apply-confirm').getByRole('button', { name: /confirm/i }).click();

    await expect.poll(async () => page.evaluate(() => (window.__published || []).length), { timeout: 15_000 }).toBeGreaterThan(0);

    const ev = await page.evaluate(() => window.__published[0]);
    expect(verifyEvent(ev), 'published application event must carry a valid signature').toBe(true);
    expect(ev.pubkey).toBe(acct.pubkey);
    expect(ev.kind).toBe(39999);
    const tag = (name) => (ev.tags.find((t) => t[0] === name) || [])[1];
    expect(tag('e')).toBe(LFO_TAG_EVENT_ID);
    expect(tag('p')).toBe(acct.pubkey);
    expect(tag('polarity')).toBe('1');
  });

  // AC-5
  test('an unlocked local-key verified member sees an enabled attest button and can sign an attestation', async ({ page }) => {
    const member = mintAccount();
    const applicant = mintAccount('whatever-applicant-pass');
    await seedStoredAccount(page, member);
    await page.goto('/');

    // Synthetic tag set: SEED tags our member (→ verified); applicant self-tags (→ pending).
    await page.evaluate(({ seed, lfoId, memberPk, applicantPk }) => {
      const item = (taggerPk, targetPk) => ({
        id: Math.random().toString(16).slice(2),
        pubkey: taggerPk,
        kind: 39999,
        created_at: 1730000000,
        content: '',
        tags: [['e', lfoId], ['p', targetPk], ['polarity', '1']],
      });
      const items = [item(seed, memberPk), item(applicantPk, applicantPk)];
      window.getTagItems = async () => items;
      window.fetchMetadata = async () => new Map();
    }, { seed: SEED_PUBKEY, lfoId: LFO_TAG_EVENT_ID, memberPk: member.pubkey, applicantPk: applicant.pubkey });

    await expect(page.locator('#state-unlock')).toBeVisible({ timeout: 10_000 });
    await page.locator('#state-unlock input[type="password"]').fill(PASS);
    await page.locator('#state-unlock .signin-full-btn').first().click();

    const attestBtn = page.locator('#pending-members-grid .attest-btn').first();
    await expect(attestBtn).toBeVisible({ timeout: 15_000 });
    await expect(attestBtn).toBeEnabled();
    // The "install an extension to attest" gate must be gone for a local signer.
    await expect(page.locator('text=Install a Nostr extension to attest')).toHaveCount(0);

    await page.evaluate(() => {
      window.__published = [];
      window.publishEventToRelay = (url, ev) => { window.__published.push(ev); return Promise.resolve({ ok: true, relay: url }); };
    });
    await attestBtn.click();

    await expect.poll(async () => page.evaluate(() => (window.__published || []).length), { timeout: 15_000 }).toBeGreaterThan(0);
    const ev = await page.evaluate(() => window.__published[0]);
    expect(verifyEvent(ev), 'attestation must be validly signed by the local key').toBe(true);
    expect(ev.pubkey).toBe(member.pubkey);
    const pTag = (ev.tags.find((t) => t[0] === 'p') || [])[1];
    expect(pTag).toBe(applicant.pubkey);
  });
});

test.describe('Local signer — extension path unchanged (guard)', () => {
  // AC-8 — this is a regression guard; it should hold both before and after the feature.
  test('a NIP-07 extension user signs in without the app storing any key locally', async ({ page }) => {
    const ext = mintAccount();
    await page.addInitScript((pubkey) => {
      window.nostr = {
        getPublicKey: async () => pubkey,
        signEvent: async (e) => ({ ...e, id: 'x'.repeat(64), sig: 'y'.repeat(128), pubkey }),
      };
    }, ext.pubkey);
    await page.goto('/');
    await page.evaluate(() => { window.getTagItems = async () => []; });

    await page.locator('#state-idle').getByRole('button', { name: /sign in with extension/i }).click();

    // Extension users are never asked to set a passphrase and nothing is persisted.
    await expect(page.locator('#state-set-passphrase')).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem('lfo_account'));
    expect(stored).toBeNull();
  });
});
