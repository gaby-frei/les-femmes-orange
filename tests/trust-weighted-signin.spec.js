// E2E spec for trust-weighted-membership Story 1 (ADR 0048): the sign-in gate under the
// trust-weighted closure, the PO's copy for the short / untagged / provider-failure states,
// the strict house-POV score contract, post-vouch feedback, and grids following the closure.
// Written BEFORE implementation — RED until public/index.html wires the shared closure.
//
// Seam contract (ADR 0048 implementation notes):
//   Scores: POST <ORE_HOST>/rank/pubkeys {pubkeys, algorithm:'graperank-pov', pov:<HOUSE_POV>}
//           for EVERY pubkey in the tag events (+ the signing-in user). Always the house
//           perspective — never the member's own, never the global algorithm — for membership.
//   Sign-in: window.getTagItems overridable (as local-signer.spec does); startSignIn() with a
//           stubbed window.nostr drives the real proceedWithPubkey.
//   DOM:    #state-not-member gains #vouch-requirement-line + #vouch-remaining-line;
//           provider failure → #state-error with #error-msg = the PO's D3 copy + Try again.
//   Vouch:  publishVouch feedback in the card footer: "Vouched — {M} more vouch(es) needed".

import { test, expect } from '@playwright/test';

const SEED  = 'e83fff7a10b30dc0c296c62b440aa9071c904d80b18420341b5425a81bd6856c';
const HOUSE = '6ff682438884e32f619d79e1aa1aba7de8f426005bea5891fc64ef854768731c';
const ME = '11'.repeat(32);
const A  = 'aa'.repeat(32);
const B  = 'bb'.repeat(32);
const C  = 'cc'.repeat(32);
const D  = 'dd'.repeat(32);

const D3_COPY = "We couldn't check your membership because Brainstorm scores are temporarily unreachable.";
const PROVIDER_REASON = 'no scores exist for this point of view and none are scheduled (ranking requests never provision new povs)';

let seq = 0;
const vouch = (tagger, target) => ({
  kind: 39999, pubkey: tagger, created_at: ++seq, id: String(++seq).padStart(64, '0'),
  tags: [['d', `profile-tag-lfo-${target.slice(0, 8)}-${tagger.slice(0, 8)}`], ['p', target], ['polarity', '1']],
});

// Stub the ORE rank endpoint. `scores` is {hex: rank} or a function (body, nth) → {status?, body?, abort?, headers?}.
// Returns the node-side call log (parsed POST bodies).
async function stubRank(page, scores) {
  const calls = [];
  await page.route('**/rank/pubkeys', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const r = typeof scores === 'function' ? await scores(body, calls.length) : null;
    if (r?.abort) return route.abort('failed');
    const table = r?.body ? null : (typeof scores === 'function' ? {} : scores);
    return route.fulfill({
      status: r?.status ?? 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'x-reason, retry-after', ...(r?.headers || {}) },
      ...(r?.rawBody != null
        ? { body: r.rawBody, contentType: r.contentType || 'text/html' }
        : { json: r?.body ?? { results: (body.pubkeys || []).filter((pk) => pk in table).map((pk) => ({ pubkey: pk, rank: table[pk] })), ttl: 3600 } }),
    });
  });
  return calls;
}

// Boot the page, install tag items + a NIP-07 stub, and press the real sign-in path.
async function signIn(page, { tagItems, me = ME, activeView } = {}) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.startSignIn), 'app booted').toBe('function');
  await page.evaluate(({ tagItems, me, activeView }) => {
    window.__tagItems = tagItems;
    window.getTagItems = async () => window.__tagItems;
    window.nostr = { getPublicKey: async () => me, signEvent: async (e) => ({ ...e, id: 'f0'.repeat(32), pubkey: me, sig: '00'.repeat(64) }) };
    if (activeView) _activeView = activeView;   // top-level let — same global scope
    window.__published = [];
    window.publishEventToRelay = async (relay, event) => { window.__published.push({ relay, event }); return { ok: true, relay }; };
  }, { tagItems, me, activeView });
  await page.evaluate(() => window.startSignIn());
}

const notMember = (page) => page.locator('#state-not-member');
const reqLine   = (page) => page.locator('#vouch-requirement-line');
const remLine   = (page) => page.locator('#vouch-remaining-line');
const errState  = (page) => page.locator('#state-error');

test.describe('Sign-in under the trust-weighted closure (trust-weighted-membership #1)', () => {

  // T1 — AC "Sign-in, verified" + the score request contract
  test('a trusted pubkey with one verified vouch signs in as a member; scores requested from the house perspective for every pubkey in the events', async ({ page }) => {
    const calls = await stubRank(page, { [ME]: 0.9 });
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(page.locator('#nav-members-li'), 'gated nav unlocked').toBeVisible({ timeout: 15_000 });
    await expect(notMember(page)).toBeHidden();
    expect(calls.length, 'at least one rank batch fired during sign-in').toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.algorithm, 'membership always uses the personalized algorithm').toBe('graperank-pov');
      expect(c.pov, 'membership always evaluates from the HOUSE perspective').toBe(HOUSE);
    }
    const asked = new Set(calls.flatMap((c) => c.pubkeys || []));
    expect(asked.has(ME), 'the signing-in user is scored').toBe(true);
    expect(asked.has(SEED), 'every pubkey in the events is scored (closure is transitive)').toBe(true);
  });

  // T2 — AC "Boundary": 0.745 is the chip's 75
  test('a pubkey at exactly 0.745 with one vouch is trusted and signs in', async ({ page }) => {
    await stubRank(page, { [ME]: 0.745 });
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(page.locator('#nav-members-li')).toBeVisible({ timeout: 15_000 });
  });

  // T3 — AC "Sign-in, tagged but short" (neutral, one vouch — the rolled-back member's state)
  test('a neutral pubkey with one vouch lands on the pending state with the requirement and "1 more vouch needed"', async ({ page }) => {
    await stubRank(page, { [ME]: 0.6 });
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    await expect(reqLine(page)).toHaveText('Your trust level in the community requires 2 vouches from other members.');
    await expect(remLine(page)).toHaveText('1 more vouch needed');
    await expect(page.locator('#already-pending-notice'), 'already tagged → pending notice').toBeVisible();
    await expect(page.locator('#apply-prompt'), 'already tagged → no apply prompt').toBeHidden();
    await expect(page.locator('#nav-members-li')).toBeHidden();
  });

  // T4 — AC "Sign-in, tagged but short": self-vouch does not count; plural form
  test('a low-trust self-applicant sees "requires 3 vouches" and "3 more vouches needed"', async ({ page }) => {
    await stubRank(page, { [ME]: 0.2 });
    await signIn(page, { tagItems: [vouch(ME, ME)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    await expect(reqLine(page)).toHaveText('Your trust level in the community requires 3 vouches from other members.');
    await expect(remLine(page)).toHaveText('3 more vouches needed');
    await expect(page.locator('#already-pending-notice')).toBeVisible();
  });

  // T5 — AC "Sign-in, untagged" (scored)
  test('an untagged neutral pubkey keeps the apply prompt and reads "2 more vouches needed"', async ({ page }) => {
    await stubRank(page, { [ME]: 0.55, [A]: 0.9 });
    await signIn(page, { tagItems: [vouch(SEED, A)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#apply-prompt')).toBeVisible();
    await expect(page.locator('#already-pending-notice')).toBeHidden();
    await expect(reqLine(page)).toHaveText('Your trust level in the community requires 2 vouches from other members.');
    await expect(remLine(page)).toHaveText('2 more vouches needed');
  });

  // T6 — AC "Sign-in, untagged" + unscored → 0 → low
  test('an untagged pubkey the provider has never scored needs 3 vouches', async ({ page }) => {
    await stubRank(page, { [A]: 0.9 });   // ME absent from every result
    await signIn(page, { tagItems: [vouch(SEED, A)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    await expect(reqLine(page)).toHaveText('Your trust level in the community requires 3 vouches from other members.');
    await expect(remLine(page)).toHaveText('3 more vouches needed');
  });

  // T7 — AC "Sign-in, tagged but short" with a trusted score: singular requirement line
  test('a trusted self-applicant reads "requires 1 vouch" and "1 more vouch needed"', async ({ page }) => {
    await stubRank(page, { [ME]: 0.95 });
    await signIn(page, { tagItems: [vouch(ME, ME)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    await expect(reqLine(page)).toHaveText('Your trust level in the community requires 1 vouch from other members.');
    await expect(remLine(page)).toHaveText('1 more vouch needed');
  });

  // T8 — AC "Provider unavailable": transport failure
  test('when the score request fails on the network, sign-in shows the D3 copy with Try again and no verdict', async ({ page }) => {
    const calls = await stubRank(page, () => ({ abort: true }));
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(errState(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#error-msg')).toHaveText(D3_COPY);
    await expect(errState(page).getByRole('button', { name: /try again/i })).toBeVisible();
    await expect(page.locator('#nav-members-li'), 'no verdict: nothing unlocked').toBeHidden();
    await expect(notMember(page), 'no verdict: not shown as a non-member either').toBeHidden();
    for (const c of calls) expect(c.pov, 'no fallback to another perspective or algorithm').toBe(HOUSE);
  });

  // T9 — AC "Provider unavailable": the house perspective refused (422) — no provider text, no fallback
  test('a 422 refusal of the house perspective is an unavailable sign-in, with no provider text and no global fallback', async ({ page }) => {
    const calls = await stubRank(page, () => ({
      status: 422, headers: { 'x-reason': PROVIDER_REASON },
      body: { error: PROVIDER_REASON, fallback: 'graperank', provision: 'https://brainstorm.nosfabrica.com' },
    }));
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(errState(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#error-msg')).toHaveText(D3_COPY);
    const html = await page.content();
    expect(html, 'provider reason must not leak').not.toContain('none are scheduled');
    expect(html).not.toContain('nosfabrica.com');
    expect(calls.every((c) => c.algorithm === 'graperank-pov' && c.pov === HOUSE), 'never re-asks with the global algorithm').toBe(true);
    await expect(page.locator('#nav-members-li')).toBeHidden();
  });

  // T10 — AC "Provider unavailable": scheduled-but-not-ready (202)
  test('a 202 for the house perspective is an unavailable sign-in', async ({ page }) => {
    await stubRank(page, () => ({ status: 202, headers: { 'retry-after': '600' }, body: { status: 'scheduled' } }));
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(errState(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#error-msg')).toHaveText(D3_COPY);
  });

  // T11 — AC "Provider unavailable": unreadable 200
  test('a 200 with an unreadable body is an unavailable sign-in, not a 3-vouch verdict', async ({ page }) => {
    await stubRank(page, () => ({ status: 200, rawBody: '<html>maintenance</html>', contentType: 'text/html' }));
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(errState(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#error-msg')).toHaveText(D3_COPY);
    await expect(notMember(page), 'an unreadable answer must not be read as "unscored"').toBeHidden();
  });

  // T12 — AC "Provider unavailable": Try again returns to the start, and a recovered provider then signs in
  test('Try again after a provider failure leads to a successful sign-in once scores are back', async ({ page }) => {
    let fail = true;
    await stubRank(page, (body) => fail ? { abort: true } : { body: { results: [{ pubkey: ME, rank: 0.9 }], ttl: 3600 } });
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(errState(page)).toBeVisible({ timeout: 15_000 });
    fail = false;
    await errState(page).getByRole('button', { name: /try again/i }).click();
    await page.evaluate(() => window.startSignIn());
    await expect(page.locator('#nav-members-li')).toBeVisible({ timeout: 15_000 });
  });

  // T13 — Policy constraint: My view never influences membership
  test('with My view active, membership is still evaluated from the house perspective', async ({ page }) => {
    const calls = await stubRank(page, { [ME]: 0.9 });
    await signIn(page, { tagItems: [vouch(SEED, ME)], activeView: 'mine' });
    await expect(page.locator('#nav-members-li')).toBeVisible({ timeout: 15_000 });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.pov).toBe(HOUSE);
  });

  // T14 — AC "Memoryless": same events, a score that changed between two loads
  test('the same vouch events with a score that rose between two page loads flips pending → verified', async ({ page }) => {
    let rank = 0.6;
    await stubRank(page, () => ({ body: { results: [{ pubkey: ME, rank }], ttl: 3600 } }));
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(notMember(page)).toBeVisible({ timeout: 15_000 });
    rank = 0.8;
    await signIn(page, { tagItems: [vouch(SEED, ME)] });   // fresh page load, identical events
    await expect(page.locator('#nav-members-li'), 'nothing was remembered from the first load').toBeVisible({ timeout: 15_000 });
    await expect(notMember(page)).toBeHidden();
  });

  // T15 — AC "Memoryless": nothing about membership is persisted
  test('nothing about membership or scores is written to browser storage', async ({ page }) => {
    await stubRank(page, { [ME]: 0.9 });
    await signIn(page, { tagItems: [vouch(SEED, ME)] });
    await expect(page.locator('#nav-members-li')).toBeVisible({ timeout: 15_000 });
    const storage = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(storage).not.toMatch(/verified|member|vouch|rank|score/i);
  });
});

// ── Members page: grids follow the closure; post-vouch feedback ──────────────
async function openMembers(page, { tagItems, profiles }) {
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.showView)).toBe('function');
  await page.evaluate(({ tagItems, profiles, me }) => {
    currentPubkey = me;
    _isVerifiedMember = true;
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
const cardFor = (page, grid, hex) => page.locator(`#${grid} .member-card:has(.member-copy-btn[data-hex="${hex}"])`);
const PROFILES = {
  [ME]: { display_name: 'Mae Member' }, [A]: { display_name: 'Ann Trusted' }, [B]: { display_name: 'Bea Neutral' },
  [C]: { display_name: 'Cal Self' }, [D]: { display_name: 'Dee Applicant' },
};

test.describe('Members page under the trust-weighted closure (trust-weighted-membership #1)', () => {

  // T16 — AC "Grids follow the closure"
  test('verified and pending grids contain exactly the closure\'s sets — a rolled-back neutral member sits in pending', async ({ page }) => {
    await stubRank(page, { [ME]: 0.9, [A]: 0.9, [B]: 0.6, [C]: 0.9 });
    await openMembers(page, { profiles: PROFILES, tagItems: [vouch(SEED, ME), vouch(SEED, A), vouch(SEED, B), vouch(C, C)] });
    await expect(cardFor(page, 'verified-members-grid', ME)).toBeVisible();
    await expect(cardFor(page, 'verified-members-grid', A), 'trusted + 1 vouch → verified').toBeVisible();
    await expect(cardFor(page, 'pending-members-grid', B), 'neutral + 1 vouch → pending (rolled back)').toBeVisible();
    await expect(cardFor(page, 'pending-members-grid', C), 'trusted self-applicant → pending').toBeVisible();
    await expect(page.locator('#verified-members-grid .member-card')).toHaveCount(2);
    await expect(page.locator('#pending-members-grid .member-card')).toHaveCount(2);
    await expect(page.locator('#verified-count')).toHaveText('2');
    await expect(page.locator('#pending-count')).toHaveText('2');
  });

  // T17 — AC "After a vouch": still short → remaining count in the feedback, card stays pending
  test('vouching a neutral self-applicant reports "Vouched — 1 more vouch needed" and leaves the card pending', async ({ page }) => {
    await stubRank(page, { [ME]: 0.9, [D]: 0.6 });
    await openMembers(page, { profiles: PROFILES, tagItems: [vouch(SEED, ME), vouch(D, D)] });
    const card = cardFor(page, 'pending-members-grid', D);
    await expect(card).toBeVisible();
    await card.locator('.attest-btn').click();
    await expect(card, 'feedback carries the remaining count').toContainText('Vouched — 1 more vouch needed', { timeout: 10_000 });
    await expect(cardFor(page, 'pending-members-grid', D), 'one of two counting vouches → still pending').toBeVisible();
    await expect(cardFor(page, 'verified-members-grid', D)).toHaveCount(0);
    expect(await page.evaluate(() => window.__signed.length)).toBe(1);
  });

  // T18 — AC "After a vouch": now verified → moves to the verified grid (today's behavior, under the new rule)
  test('vouching a trusted self-applicant verifies them and moves the card to the verified grid', async ({ page }) => {
    await stubRank(page, { [ME]: 0.9, [D]: 0.9 });
    await openMembers(page, { profiles: PROFILES, tagItems: [vouch(SEED, ME), vouch(D, D)] });
    await cardFor(page, 'pending-members-grid', D).locator('.attest-btn').click();
    await expect(cardFor(page, 'verified-members-grid', D), 'trusted + my vouch → verified').toBeVisible({ timeout: 10_000 });
    await expect(cardFor(page, 'pending-members-grid', D)).toHaveCount(0);
  });

  // T19 — AC "After a vouch": a search-panel vouch of a pubkey that was in NO event is scored before the verdict
  test('vouching a never-tagged pubkey from the search panel fetches its score and reports the remaining count', async ({ page }) => {
    const OUT = 'ee'.repeat(32);
    const calls = await stubRank(page, { [ME]: 0.9, [OUT]: 0.3 });
    await openMembers(page, { profiles: { ...PROFILES, [OUT]: { display_name: 'Olive Outsider' } }, tagItems: [vouch(SEED, ME)] });
    await page.locator('#member-search-input').fill(OUT);
    const cand = page.locator('#member-search-panel .member-card.candidate');
    await expect(cand).toBeVisible({ timeout: 10_000 });
    await cand.locator('.attest-btn').click();
    await expect(cand, 'low trust: my vouch is 1 of 3').toContainText('Vouched — 2 more vouches needed', { timeout: 10_000 });
    expect(new Set(calls.flatMap((c) => c.pubkeys || [])).has(OUT), 'the outsider was scored (house POV)').toBe(true);
    for (const c of calls) expect(c.pov).toBe(HOUSE);
  });
});
