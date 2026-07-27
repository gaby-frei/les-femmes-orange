// E2E spec for v1-release Story 1: the "Home" rename + the public "Solution" page.
// Written BEFORE implementation — expected to FAIL until the nav rename, the fourth
// tab, and #page-solution land in public/index.html.
//
// Seam contract the implementation must satisfy (story ACs + PO determinations):
//   Nav: the first tab's label becomes "Home" (internal view name stays 'about');
//        a new always-visible tab <button id="nav-solution-btn" onclick="showView('solution')">
//        sits LAST in .nav-center (order: Home | Members | Feed | Solution — PO override);
//        Members/Feed <li>s keep their signed-out display:none gating.
//   View: <div id="page-solution" class="page hidden"> — static, public, PO copy verbatim,
//        four top-level headers + two Enabling-Technologies subheadings, 7 ✗ items,
//        8 ✔ items, and the PDF's bold/italic/underline preserved as real HTML emphasis.
//   Purity: opening Solution triggers no /api/* request, no relay WebSocket, no sign-in UI.

import { test, expect } from '@playwright/test';

const HEADERS = [
  'What is this app?',
  'Online Communities Today are Broken',
  'How the LFO Hub Fixes a Broken Model',
  'Enabling Technologies',
];

const navBtns = (page) => page.locator('nav .nav-center .nav-link-btn');
const visibleNavBtns = (page) => page.locator('nav .nav-center li:visible .nav-link-btn');
const solutionBtn = (page) => page.locator('#nav-solution-btn');
const solutionPage = (page) => page.locator('#page-solution');
const homePage = (page) => page.locator('#page-about'); // internal id unchanged by design

test.describe('v1 shell — Home rename + Solution page (v1-release #1)', () => {
  // T1
  test('signed-out nav: "Home" first, no "About", Solution visible, Members/Feed gated', async ({ page }) => {
    await page.goto('/');
    const visible = visibleNavBtns(page);
    await expect(visible.first(), 'first visible tab reads Home').toHaveText('Home');
    await expect(navBtns(page).filter({ hasText: /^About$/ }), 'no tab reads About').toHaveCount(0);
    await expect(solutionBtn(page), 'Solution is public — visible signed out').toBeVisible();
    await expect(page.locator('#nav-members-li'), 'Members stays gated').toBeHidden();
    await expect(page.locator('#nav-feed-li'), 'Feed stays gated').toBeHidden();
  });

  // T2 — DOM order carries the PO determination even for tabs currently hidden.
  test('tab order in the DOM is Home, Members, Feed, Solution', async ({ page }) => {
    await page.goto('/');
    await expect(navBtns(page)).toHaveText(['Home', 'Members', 'Feed', 'Solution']);
  });

  // T3
  test('the renamed tab still lands on the same default view with its hero CTA', async ({ page }) => {
    await page.goto('/');
    await expect(homePage(page), 'the Home (né About) view is the default').toBeVisible();
    await expect(solutionPage(page)).toBeHidden();
    await expect(page.locator('#hero-cta-btn'), 'hero CTA untouched by the rename').toBeVisible();
  });

  // T4
  test('clicking Solution swaps to the Solution view and back', async ({ page }) => {
    await page.goto('/');
    await solutionBtn(page).click();
    await expect(solutionPage(page)).toBeVisible();
    await expect(homePage(page)).toBeHidden();
    await page.locator('#nav-about-btn').click();
    await expect(homePage(page), 'Home tab returns to the default view').toBeVisible();
    await expect(solutionPage(page)).toBeHidden();
  });

  // T5
  test('exactly one nav tab is active at a time', async ({ page }) => {
    await page.goto('/');
    const active = page.locator('nav .nav-center .nav-link-btn.active');
    await expect(active).toHaveText(['Home']);
    await solutionBtn(page).click();
    await expect(active, 'active state moves to Solution alone').toHaveText(['Solution']);
    await page.locator('#nav-about-btn').click();
    await expect(active).toHaveText(['Home']);
  });

  // T6 — the public promise: no gated fetch, no relay socket, no sign-in prompt.
  test('opening Solution triggers no /api call, no relay WebSocket, no sign-in UI', async ({ page }) => {
    await page.goto('/');
    const sideEffects = [];
    page.on('request', (req) => { if (/\/api\//.test(req.url())) sideEffects.push(req.url()); });
    page.on('websocket', (ws) => sideEffects.push(ws.url()));
    await solutionBtn(page).click();
    await expect(solutionPage(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(sideEffects, 'Solution is a static public view').toEqual([]);
    await expect(page.locator('#nav-signin-btn'), 'sign-in affordance unchanged, not forced').toBeVisible();
  });

  // T7
  test('all four section headers and both technology subheadings render in order', async ({ page }) => {
    await page.goto('/');
    await solutionBtn(page).click();
    const heads = solutionPage(page).locator('h1, h2');
    await expect(heads).toHaveText(HEADERS);
    const subs = solutionPage(page).locator('h3');
    await expect(subs).toHaveText(['Nostr Protocol', 'Tapestry Graph']);
  });

  // T8
  test('seven ✗ limitations and eight ✔ features, each opening with a bold label', async ({ page }) => {
    await page.goto('/');
    await solutionBtn(page).click();
    const broken = solutionPage(page).locator('.solution-item-x');
    const fixed = solutionPage(page).locator('.solution-item-check');
    await expect(broken).toHaveCount(7);
    await expect(fixed).toHaveCount(8);
    for (const list of [broken, fixed]) {
      const n = await list.count();
      for (let i = 0; i < n; i++) {
        await expect(list.nth(i).locator('strong').first(), `item ${i} opens with a bold label`).toBeVisible();
      }
    }
    await expect(broken.first()).toContainText('Member management:');
    await expect(fixed.first()).toContainText('Permissionless organizing:');
  });

  // T9 — the PDF's emphasis must survive as real rendered emphasis, not flattened text.
  test('underline/italic/bold fidelity spot checks (computed styles)', async ({ page }) => {
    await page.goto('/');
    await solutionBtn(page).click();
    const styleOf = (locator) => locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      // text-decoration-line inherits visually but not computationally — walk up for underline.
      let underlined = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).textDecorationLine.includes('underline')) { underlined = true; break; }
      }
      return { italic: cs.fontStyle === 'italic', underlined, weight: Number(cs.fontWeight) };
    });

    const vouch = solutionPage(page).locator('u, .term').filter({ hasText: /^vouch$/ }).first();
    await expect(vouch).toBeVisible();
    expect(await styleOf(vouch), 'vouch is underlined italic').toMatchObject({ italic: true, underlined: true });

    const tagline = solutionPage(page).getByText('This is sovereign infrastructure built for sovereign communities.');
    expect((await styleOf(tagline)).italic, 'the tagline is italic').toBe(true);

    const millions = solutionPage(page).locator('em').filter({ hasText: /^millions$/ }).first();
    expect((await styleOf(millions)).italic).toBe(true);

    const wot = solutionPage(page).locator('u').filter({ hasText: /^Web of Trust$/ }).first();
    expect((await styleOf(wot)).underlined, 'Web of Trust is underlined').toBe(true);

    const lfoHub = solutionPage(page).locator('strong').filter({ hasText: /^LFO Hub$/ }).first();
    expect((await styleOf(lfoHub)).weight, 'LFO Hub is bold').toBeGreaterThanOrEqual(600);
  });

  // T10 — verbatim copy spot checks, one per section.
  test('PO copy appears verbatim', async ({ page }) => {
    await page.goto('/');
    await solutionBtn(page).click();
    const body = solutionPage(page);
    for (const sentence of [
      'This app is an all-in-one hub for the Les Femmes Orange (LFO) community, a global network of over 2,000 Bitcoin and freedom advocates.',
      'The conclusion is clear: modern communities are not safe on legacy platforms.',
      'Enabled by the above features, the LFO Hub mirrors how communities thrive in the physical world – not as restricted databases, but as living social webs.',
      'This means that no platform can delete your account, seize your following, or erase your history.',
      'The result of these trust metrics is a user experience reflective of each individual’s evolving network, entirely personalized and dynamic.',
    ]) {
      await expect(body.getByText(sentence, { exact: false }), sentence.slice(0, 40)).toBeVisible();
    }
  });
});
