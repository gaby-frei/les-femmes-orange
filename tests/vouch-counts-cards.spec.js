// E2E spec for trust-weighted-membership Story 2 (ADR 0049): vouch counts on member cards,
// the voucher list behind the count (hover / tap / keyboard), dimmed non-counting vouchers,
// the Vouch button on verified cards, and in-place card updates after a vouch.
// Written BEFORE implementation — RED until public/index.html renders the count.
//
// Seam contract (ADR 0049 implementation notes):
//   DOM:   grid cards gain  button.vouch-count  (text "N vouches" / "N of M vouches")
//          controlling  .vouch-list  (hidden until opened) of  li  entries; a non-counting
//          entry is  li.not-counting  and carries a text marker. The verified by-line
//          (.member-attested-by — "by …" / "Founding curator") is gone from grid cards.
//   Vouch: .attest-btn now also on verified cards (not own, not already vouched by me).
//   Fixtures: same seams as tests/trust-weighted-signin.spec.js (getTagItems, queryRelay
//          kind-0, LFOSigner, publishEventToRelay, **/rank/pubkeys).

import { test, expect } from '@playwright/test';

const SEED = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const ME = '11'.repeat(32);
const A  = 'aa'.repeat(32);
const B  = 'bb'.repeat(32);
const C  = 'cc'.repeat(32);
const D  = 'dd'.repeat(32);
const E  = 'ee'.repeat(32);

let seq = 0;
const vouch = (tagger, target) => ({
  kind: 39999, pubkey: tagger, created_at: ++seq, id: String(++seq).padStart(64, '0'),
  tags: [['d', `profile-tag-lfo-${target.slice(0, 8)}-${tagger.slice(0, 8)}`], ['p', target], ['polarity', '1']],
});

// The card world (same as test/vouch-breakdown.test.js):
//   ME  Mae   trusted  seed                  → verified "1 vouch"          (own card: no Vouch)
//   A   Ann   trusted  seed + ME             → verified "2 vouches"        (I vouched: no Vouch)
//   B   Bea   neutral  seed + A              → verified "2 vouches"        (Vouch shown)
//   C   Cal   trusted  self + D (unverified) → pending  "0 of 1 vouch"
//   D   Dee   low      self                  → pending  "0 of 3 vouches"
//   E   Eve   neutral  seed                  → pending  "1 of 2 vouches"   (rolled back)
// The seed has no profile → it is listed by short npub.
const ITEMS = () => [
  vouch(SEED, ME), vouch(SEED, A), vouch(ME, A), vouch(SEED, B), vouch(A, B),
  vouch(C, C), vouch(D, C), vouch(D, D), vouch(SEED, E),
];
const SCORES = { [ME]: 0.9, [A]: 0.9, [B]: 0.6, [C]: 0.9, [D]: 0.2, [E]: 0.6 };
const PROFILES = {
  [ME]: { display_name: 'Mae Member' }, [A]: { display_name: 'Ann Trusted' }, [B]: { display_name: 'Bea Neutral' },
  [C]: { display_name: 'Cal Self' }, [D]: { display_name: 'Dee Lowtrust' }, [E]: { display_name: 'Eve Rolledback' },
};

async function stubRank(page, table) {
  await page.route('**/rank/pubkeys', async (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200, headers: { 'Access-Control-Allow-Origin': '*' },
      json: { results: (body.pubkeys || []).filter((pk) => pk in table).map((pk) => ({ pubkey: pk, rank: table[pk] })), ttl: 3600 },
    });
  });
}

async function openMembers(page, { tagItems = ITEMS(), scores = SCORES, profiles = PROFILES } = {}) {
  await stubRank(page, scores);
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate(({ tagItems, profiles, me }) => {
    currentPubkey = me;
    _isVerifiedMember = true;
    window.__noReload = 'still-here';   // a reload would drop this
    window.__tagItems = tagItems;
    window.getTagItems = async () => window.__tagItems;
    window.__profiles = profiles;
    window.__signed = []; window.__published = [];
    let evSeq = 0;
    window.queryRelay = async (relayUrl, filter) => {
      if (!Array.isArray(filter.kinds) || !filter.kinds.includes(0)) return [];
      return (filter.authors || []).filter((h) => window.__profiles[h]).map((h) => ({
        kind: 0, pubkey: h, created_at: 1000, content: JSON.stringify(window.__profiles[h]), id: String(++evSeq).padStart(64, '0'),
      }));
    };
    window.LFOSigner = {
      get mode() { return 'extension'; }, canSign: () => true, getPublicKey: async () => me,
      sign: async (unsigned) => { window.__signed.push(unsigned); return { ...unsigned, id: 'f0'.repeat(32), pubkey: me, sig: '00'.repeat(64) }; },
      clear: () => {},
    };
    window.publishEventToRelay = async (relay, event) => { window.__published.push({ relay, event }); return { ok: true, relay }; };
    window.showView('members');
  }, { tagItems, profiles, me: ME });
  await expect(page.locator('#verified-members-grid .member-card').first(), 'members grid rendered').toBeVisible({ timeout: 10_000 });
}

const cardFor  = (page, grid, hex) => page.locator(`#${grid} .member-card:has(.member-copy-btn[data-hex="${hex}"])`);
const verified = (page, hex) => cardFor(page, 'verified-members-grid', hex);
const pending  = (page, hex) => cardFor(page, 'pending-members-grid', hex);
const countBtn = (card) => card.locator('.vouch-count');
const listOf   = (card) => card.locator('.vouch-list');
const seedLabel = (page) => page.evaluate((h) => hexToNpubShort(h), SEED);

test.describe('Vouch counts on member cards (trust-weighted-membership #2)', () => {

  // C1 — AC "Verified count" (+ D1: replaces the by-line; curator-style seed vouch counts)
  test('verified cards read "N vouches" (singular "1 vouch") and no longer show a "by …" / "Founding curator" line', async ({ page }) => {
    await openMembers(page);
    await expect(countBtn(verified(page, ME)), 'one counting vouch, singular').toHaveText('1 vouch');
    await expect(countBtn(verified(page, A)), 'seed + me').toHaveText('2 vouches');
    await expect(countBtn(verified(page, B)), 'neutral member with seed + Ann').toHaveText('2 vouches');
    await expect(page.locator('#verified-members-grid .member-attested-by'), 'by-line removed (D1)').toHaveCount(0);
    await expect(page.locator('#verified-members-grid'), 'no "Founding curator" label').not.toContainText('Founding curator');
  });

  // C2 — AC "Pending count"
  test('pending cards read "N of M vouches" — self-only and unverified-only applicants have 0', async ({ page }) => {
    await openMembers(page);
    await expect(countBtn(pending(page, E)), 'rolled-back neutral: one of two').toHaveText('1 of 2 vouches');
    await expect(countBtn(pending(page, D)), 'low trust, self-vouch only').toHaveText('0 of 3 vouches');
    await expect(countBtn(pending(page, C)), 'trusted, self + unverified voucher; M=1 is singular').toHaveText('0 of 1 vouch');
  });

  // C3 — AC "Voucher list opens from the count" (pointer hover) + the list is not covered by a neighbour card
  test('hovering the count opens the list of every voucher; moving away closes it', async ({ page }) => {
    await openMembers(page);
    const card = verified(page, A);
    await expect(listOf(card), 'closed until asked').toBeHidden();
    await countBtn(card).hover();
    await expect(listOf(card)).toBeVisible();
    await expect(listOf(card).locator('li')).toHaveCount(2);
    await expect(listOf(card)).toContainText('Mae Member');
    await expect(listOf(card), 'profile-less voucher (the seed) is shown by short npub').toContainText(await seedLabel(page));
    // The open list sits on top — not underneath the next card in the grid.
    const onTop = await listOf(card).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height - 2, 12));
      return !!hit && el.contains(hit);
    });
    expect(onTop, 'the open list is the topmost element at its own position').toBe(true);
    await page.mouse.move(2, 2);
    await expect(listOf(card), 'pointer left → closed').toBeHidden();
  });

  // C4 — AC "Voucher list opens from the count" (keyboard)
  test('keyboard: Enter opens the list, Escape closes it and returns focus to the count; Space toggles too', async ({ page }) => {
    await openMembers(page);
    const btn = countBtn(verified(page, A));
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(listOf(verified(page, A))).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(listOf(verified(page, A))).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn, 'focus returns to the count').toBeFocused();
    await page.keyboard.press('Space');
    await expect(listOf(verified(page, A))).toBeVisible();
    await page.keyboard.press('Space');
    await expect(listOf(verified(page, A))).toBeHidden();
  });

  // C5 — AC "Non-counting vouchers dimmed"
  test('non-counting vouchers are listed after counting ones, dimmed, and marked in text', async ({ page }) => {
    // E gets a counting (seed), an unverified (D) and a self vouch, in that worst-case event order.
    const items = [vouch(SEED, ME), vouch(D, D), vouch(E, E), vouch(D, E), vouch(SEED, E)];
    await openMembers(page, { tagItems: items });
    const card = pending(page, E);
    await countBtn(card).click();
    const lis = listOf(card).locator('li');
    await expect(lis).toHaveCount(3);
    await expect(lis.nth(0), 'counting voucher first, full strength').not.toHaveClass(/not-counting/);
    await expect(lis.nth(0)).toContainText(await seedLabel(page));
    await expect(lis.nth(1)).toHaveClass(/not-counting/);
    await expect(lis.nth(1)).toContainText('Dee Lowtrust');
    await expect(lis.nth(1), 'text marker: not verified').toContainText(/not verified/i);
    await expect(lis.nth(2)).toHaveClass(/not-counting/);
    await expect(lis.nth(2)).toContainText('Eve Rolledback');
    await expect(lis.nth(2), 'text marker: self-vouch').toContainText(/self/i);
    const opacity = (i) => lis.nth(i).evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await opacity(1), 'dimmed').toBeLessThan(await opacity(0));
    expect(await opacity(2), 'dimmed').toBeLessThan(await opacity(0));
  });

  // C6 — AC "Count and list agree" + AC "Follows the live verdict", on every card
  test('on every card the non-dimmed entries equal N, verified cards have N ≥ M and pending cards N < M', async ({ page }) => {
    await openMembers(page);
    const cards = page.locator('#verified-members-grid .member-card, #pending-members-grid .member-card');
    await expect(cards).toHaveCount(6);
    // Address cards by pubkey: the trust re-sort (ADR 0044) may reorder them mid-loop.
    const hexes = await cards.evaluateAll((els) => els.map((el) => el.querySelector('.member-copy-btn').dataset.hex));
    for (const hex of hexes) {
      const card = page.locator(`.member-card:has(.member-copy-btn[data-hex="${hex}"])`).first();
      const text = (await countBtn(card).textContent()).trim();
      const m = text.match(/^(\d+)(?: of (\d+))? vouch(?:es)?$/);
      expect(m, `count copy is "N vouches" or "N of M vouches" (got "${text}")`).not.toBeNull();
      const n = Number(m[1]);
      const isPending = await card.evaluate((el) => !!el.closest('#pending-members-grid'));
      expect(!!m[2], 'pending cards and only pending cards show "of M"').toBe(isPending);
      if (isPending) expect(n, `pending card ${text}`).toBeLessThan(Number(m[2]));
      await countBtn(card).click();
      await expect(listOf(card)).toBeVisible();
      await expect(listOf(card).locator('li:not(.not-counting)'), `card "${text}": counting entries == N`).toHaveCount(n);
      await countBtn(card).click();
    }
  });

  // C7 — AC "Vouch on verified cards" (+ D5 exclusions; pending rule unchanged)
  test('a Vouch button appears on other verified members I have not vouched for — never on my own card or one I already vouched', async ({ page }) => {
    await openMembers(page);
    await expect(verified(page, B).locator('.attest-btn'), 'verified, not yet vouched by me').toHaveText(/Vouch/);
    await expect(verified(page, ME).locator('.attest-btn'), 'never on my own card').toHaveCount(0);
    await expect(verified(page, A).locator('.attest-btn'), 'I already vouched for Ann').toHaveCount(0);
    await expect(pending(page, D).locator('.attest-btn'), 'pending rule unchanged: vouchable').toHaveText(/Vouch/);
  });

  // C8 — AC "After vouching a verified member"
  test('vouching a verified member raises their count in place, lists me as counting, and acknowledges — no reload, no duplicate card', async ({ page }) => {
    await openMembers(page);
    const card = verified(page, B);
    await card.locator('.attest-btn').click();
    await expect(countBtn(verified(page, B)), 'count went up by one').toHaveText('3 vouches', { timeout: 10_000 });
    await expect(verified(page, B), 'exactly one card for Bea').toHaveCount(1);
    await expect(page.locator('#verified-members-grid .member-card')).toHaveCount(3);
    await expect(verified(page, B).locator('.attest-btn'), 'button replaced').toHaveCount(0);
    await expect(verified(page, B), 'acknowledged').toContainText('Vouched');
    await countBtn(verified(page, B)).click();
    await expect(listOf(verified(page, B)).locator('li:not(.not-counting)'), 'me among the counting vouchers').toContainText(['Mae Member']);
    expect(await page.evaluate(() => window.__noReload), 'no page reload').toBe('still-here');
    expect(await page.evaluate(() => window.__signed.length), 'one vouch signed').toBe(1);
  });

  // C9 — AC "After vouching a pending member" (still short)
  test('vouching a still-short applicant updates "N of M" in place and lists me', async ({ page }) => {
    await openMembers(page);
    await pending(page, D).locator('.attest-btn').click();
    await expect(countBtn(pending(page, D)), 'one of three now').toHaveText('1 of 3 vouches', { timeout: 10_000 });
    await expect(pending(page, D), 'story #1 feedback kept').toContainText('Vouched — 2 more vouches needed');
    await countBtn(pending(page, D)).click();
    await expect(listOf(pending(page, D)).locator('li:not(.not-counting)')).toHaveText([/Mae Member/]);
    await expect(pending(page, D)).toHaveCount(1);
  });

  // C10 — AC "After vouching a pending member" (completes the requirement)
  test('a vouch that completes the requirement moves the card to the verified grid with its "N vouches" line', async ({ page }) => {
    await openMembers(page);
    await pending(page, E).locator('.attest-btn').click();
    await expect(verified(page, E), 'seed + me = 2 of 2 → verified').toBeVisible({ timeout: 10_000 });
    await expect(pending(page, E)).toHaveCount(0);
    await expect(countBtn(verified(page, E))).toHaveText('2 vouches');
    await countBtn(verified(page, E)).click();
    await expect(listOf(verified(page, E))).toContainText('Mae Member');
  });

  // C11 — D3: search-result rows are unchanged
  test('search-result rows do not get a vouch count', async ({ page }) => {
    await openMembers(page);
    await page.locator('#member-search-input').fill(B);
    const cand = page.locator('#member-search-panel .member-card.candidate');
    await expect(cand).toBeVisible({ timeout: 10_000 });
    await expect(cand.locator('.vouch-count')).toHaveCount(0);
  });
});

// C13 — PO layout amendment (2026-11-18): the Vouch button is left-justified if and only if
// it does not fit on the pills' line (trust chip, badge, vouch count).
test.describe('Vouch button placement on grid cards (PO layout amendment, 2026-11-18)', () => {
  // Geometry of one card's footer: is the button on the pills' line, and where does it sit?
  const placement = (card) => card.evaluate((el) => {
    const footer = el.querySelector('.member-footer');
    const pills = footer.querySelector('.member-footer-pills');
    const btn = footer.querySelector('.attest-btn');
    const f = footer.getBoundingClientRect(), p = pills.getBoundingClientRect(), b = btn.getBoundingClientRect();
    return {
      sameLine: b.top < p.bottom && b.bottom > p.top,
      leftGap: Math.round(b.left - f.left),
      rightGap: Math.round(f.right - b.right),
    };
  });
  const setColumns = (page, cols) => page.evaluate((cols) => {
    for (const g of document.querySelectorAll('.members-grid')) g.style.gridTemplateColumns = cols;
  }, cols);

  test('wide card: the button shares the pills\' line at the right end; narrow card: it wraps and starts at the left edge', async ({ page }) => {
    await openMembers(page);
    const card = pending(page, D);
    await expect(card.locator('.candidate-trust-score'), 'chip patched into the pills').toBeVisible();

    await setColumns(page, '1fr');           // one wide column — everything fits
    let pos = await placement(card);
    expect(pos.sameLine, 'fits → same line as the pills').toBe(true);
    expect(pos.rightGap, 'fits → right-justified').toBeLessThanOrEqual(1);

    await setColumns(page, '240px');         // narrow cards — the button cannot fit
    pos = await placement(card);
    expect(pos.sameLine, 'does not fit → its own line').toBe(false);
    expect(pos.leftGap, 'wrapped → left-justified').toBeLessThanOrEqual(1);
  });

  test('the trust chip, badge and count stay together in one group on the pills\' line', async ({ page }) => {
    await openMembers(page);
    const pills = verified(page, B).locator('.member-footer-pills');
    await expect(pills.locator('.candidate-trust-score')).toBeVisible();
    await expect(pills.locator('.member-badge')).toBeVisible();
    await expect(pills.locator('.vouch-count')).toBeVisible();
    await expect(verified(page, B).locator('.member-footer-pills .attest-btn'), 'the button is outside the group').toHaveCount(0);
  });
});

// C12 — AC "Voucher list opens from the count" (touch, PO D2): tap opens, tap elsewhere closes.
test.describe('Vouch counts on a touch screen (trust-weighted-membership #2)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('tapping the count opens the voucher list; tapping elsewhere closes it', async ({ page }) => {
    await openMembers(page);
    const card = verified(page, A);
    await countBtn(card).tap();
    await expect(listOf(card), 'tap opens (and stays open — no hover flicker)').toBeVisible();
    await page.waitForTimeout(300);
    await expect(listOf(card)).toBeVisible();
    await expect(listOf(card)).toContainText('Mae Member');
    await page.locator('#verified-members-section .members-section-header').tap();
    await expect(listOf(card), 'tap outside closes').toBeHidden();
  });
});
