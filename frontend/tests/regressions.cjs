// Regression checks for the frontend findings in docs/repository-review.md.
// It changes data (imports conversations, marks a report solved), so run it only against a
// throwaway database with the demo board seeded and an employee account, for example:
//   DATABASE_URL=sqlite:////tmp/review.db flask --app run db upgrade && ... seed-reports && ... create-user --role employee
//   PORTAL_TEST_URL=http://127.0.0.1:5056 PORTAL_EMPLOYEE=ana@primaria.md:parola-sigura node tests/regressions.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5056';
const [EMAIL, PASSWORD] = (process.env.PORTAL_EMPLOYEE || 'ana@primaria.md:parola-sigura').split(':');
const answer = (text, extra = {}) => ({ status: 'answered', answer: text, conflict: null, next_steps: [], request_id: 'r', elapsed_ms: 10, answer_highlights: [], citations: [], ...extra });
const results = [];
const check = async (name, fn) => { try { results.push(`${(await fn()) === 'skip' ? 'SKIP' : 'PASS'} ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message.split('\n')[0]}`); } };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const fresh = async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  };
  const signIn = async (page) => {
    await page.goto(BASE);
    const ok = await page.evaluate((credentials) => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }).then((r) => r.ok), { email: EMAIL, password: PASSWORD });
    assert.ok(ok, 'login');
    await page.reload();
    await page.locator('.account-menu__trigger').waitFor();
  };

  await check('1 guest answers survive a reload', async () => {
    const page = await fresh();
    await page.route('**/api/ask', (route) => route.fulfill({ json: answer(`Răspuns la: ${JSON.parse(route.request().postData()).question}`) }));
    await page.goto(`${BASE}/#/asistent`);
    await page.locator('#assistant-question').fill('Prima întrebare');
    await page.keyboard.press('Enter');
    await page.getByText('Răspuns la: Prima întrebare').waitFor();
    await page.reload();
    await page.locator('#assistant-question').fill('A doua întrebare');
    await page.keyboard.press('Enter');
    await page.getByText('Răspuns la: A doua întrebare').waitFor();
    assert.equal(await page.getByText('Răspuns la: Prima întrebare').count(), 1);
  });

  // Two saved conversations for the employee account.
  const setup = await fresh();
  await signIn(setup);
  const ids = await setup.evaluate(async (data) => {
    const make = (question) => fetch('/api/conversations/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turns: [{ question, language: 'ro', data }] }) }).then((r) => r.json()).then((j) => j.conversation);
    return [await make('Conversația A despre grădinițe'), await make('Conversația B despre parcuri')];
  }, answer('Răspuns salvat'));
  const [A, B] = ids;

  await check('2 a late answer does not pull the user back to its thread', async () => {
    const page = await fresh();
    await signIn(page);
    await page.route('**/api/ask', async (route) => { await new Promise((r) => setTimeout(r, 1500)); route.fulfill({ json: answer('Răspuns întârziat', { conversation_id: A.id, conversation_title: A.title, message_id: 9999 }) }); });
    await page.goto(`${BASE}/#/asistent/${A.id}`);
    await page.locator('#assistant-title', { hasText: A.title }).waitFor();
    await page.locator('#assistant-question').fill('Întrebare lentă');
    await page.keyboard.press('Enter');
    await page.locator(`.conv-item__link[href="#/asistent/${B.id}"]`).click();
    await page.locator('#assistant-title', { hasText: B.title }).waitFor();
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('#assistant-title').innerText(), B.title);
    assert.equal(await page.evaluate(() => location.hash), `#/asistent/${B.id}`);
    assert.equal(await page.getByText('Răspuns întârziat').count(), 0);
  });

  await check('4 New, then reopening the same conversation', async () => {
    const page = await fresh();
    await signIn(page);
    await page.goto(`${BASE}/#/asistent/${A.id}`);
    await page.locator('#assistant-title', { hasText: A.title }).waitFor();
    await page.locator('.assistant__head').getByRole('button', { name: 'Conversație nouă' }).click().catch(() => page.locator('.conv-sidebar').getByRole('button', { name: 'Conversație nouă' }).click());
    await page.waitForFunction(() => location.hash === '#/asistent');
    await page.locator(`.conv-item__link[href="#/asistent/${A.id}"]`).click();
    await page.locator('#assistant-title', { hasText: A.title }).waitFor({ timeout: 3000 });
    await page.getByText('Răspuns salvat').waitFor({ timeout: 3000 });
  });

  await check('5 failed logout keeps the account signed in', async () => {
    const page = await fresh();
    await signIn(page);
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto(BASE);
    await page.locator('.account-menu__trigger').click();
    await page.getByRole('menuitem', { name: 'Ieșire' }).click();
    await page.getByText('Ieșirea nu a reușit', { exact: false }).waitFor();
    assert.equal(await page.locator('.account-menu__trigger').count(), 1);
  });

  await check('10 staff status change updates counts and the filtered list', async () => {
    // Each run turns one report into "solved", so it first adds a fresh one to work on.
    const form = new FormData();
    Object.entries({ title: 'Test: groapă de verificat', description: 'Creată de testul de regresie.', sector: 'centru', category: 'pothole' }).forEach(([key, value]) => form.append(key, value));
    form.append('photo', new Blob([require('node:fs').readFileSync(require('node:path').join(__dirname, '../../app/seed/reports/pothole-dilova.jpg'))], { type: 'image/jpeg' }), 'photo.jpg');
    assert.equal((await fetch(`${BASE}/api/reports`, { method: 'POST', body: form })).status, 201);
    const page = await fresh();
    await signIn(page);
    await page.goto(`${BASE}/#/probleme`);
    await page.locator('.tally__reported').click();
    await page.waitForTimeout(400);
    const count = async (status) => Number((await page.locator(`.tally__${status}`).innerText()).match(/\d+/)[0]);
    const reported = await count('reported');
    const solved = await count('solved');
    const title = await page.locator('.issue-card__title button').first().innerText();
    await page.locator('.issue-card__title button').first().click();
    await page.locator('.staff-update select').selectOption('solved');
    await page.getByRole('button', { name: 'Salvează starea' }).click();
    await page.waitForTimeout(800);
    assert.equal(await count('reported'), reported - 1);
    assert.equal(await count('solved'), solved + 1);
    assert.equal(await page.locator('.issue-card', { hasText: title }).count(), 0, 'solved card left in the Reported tab');
    assert.equal(await page.locator('.issue-dialog .progress-tape--solved').count(), 1, 'detail stays open with the new status');
  });

  await check('11 skip link keeps the current page', async () => {
    const page = await fresh();
    await page.goto(`${BASE}/#/probleme`);
    await page.locator('.issue-card').first().waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => location.hash), '#/probleme');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  });

  await check('14 suggestions clear when the selection changes', async () => {
    const page = await fresh();
    await page.goto(`${BASE}/#/probleme`);
    const open = await page.evaluate(() => fetch('/api/reports?status=open').then((r) => r.json()).then((j) => j.items[0]));
    await page.locator('.issues__head .solid-action').click();
    await page.locator('.report-row select').selectOption(open.sector);
    await page.locator(`.category-chip:has(input[value="${open.category}"])`).click();
    await page.locator('.similar li').first().waitFor();
    await page.route('**/api/reports?*', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.locator('.report-row select').selectOption(open.sector === 'buiucani' ? 'ciocana' : 'buiucani');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.similar').count(), 0);
  });

  await check('swipe game records a vote and reports agreement', async () => {
    const page = await fresh();
    await page.goto(BASE);
    // A fresh database (as in CI) has no crawled projects to vote on.
    if (!(await page.evaluate(() => fetch('/api/swipe/deck').then((r) => r.json()))).cards.length) return 'skip';
    await page.locator('.swipe-launcher').click();
    await page.locator('.swipe-card.is-top').waitFor();
    const title = await page.locator('.swipe-card.is-top .swipe-card__title').innerText();
    await page.keyboard.press('ArrowRight');
    await page.locator('.swipe-verdict').filter({ hasText: /\S/ }).waitFor();
    // Skipping right after a vote is queued behind the card still flying off, not dropped.
    await page.locator('.swipe-skip').click();
    await page.waitForFunction(() => /^3 /.test(document.querySelector('.swipe-foot span')?.textContent || ''), null, { timeout: 3000 });
    const ranking = await page.evaluate(() => fetch('/api/swipe/results').then((r) => r.json()));
    const mine = ranking.items.find((item) => item.title === title);
    assert.ok(mine && ranking.mine[String(mine.id)] === 'like', 'the liked project is in the ranking with my vote');
  });

  console.log(results.join('\n'));
  console.log('page errors:', errors);
  await browser.close();
  if (results.some((line) => line.startsWith('FAIL')) || errors.length) process.exit(1);
})();
