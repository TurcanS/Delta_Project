const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5000');
    await page.locator('#sector-title').waitFor();
    assert.equal(await page.locator('#sector-title').innerText(), 'Centru');
    const sectors = [['botanica', 'Botanica', 'https://botanica.md/'], ['buiucani', 'Buiucani', 'https://preturabuiucani.md/'], ['ciocana', 'Ciocana', 'https://ciocana.md/'], ['rascani', 'Râșcani', 'https://rascani.md/'], ['centru', 'Centru', 'https://chisinaucentru.md/']];
    for (const [id, label, url] of sectors) {
      await page.locator(`.sector-label[data-sector="${id}"]`).click();
      assert.equal(await page.locator('#sector-title').innerText(), label);
      assert.equal(await page.locator(`.sector-dots--${id}`).getAttribute('class').then(c => c.includes('is-selected')), true);
      assert.equal(await page.locator('.sector-panel__link').getAttribute('href'), url);
      await page.getByRole('button', { name: 'Contacte', exact: true }).click();
      assert.equal(await page.locator('.sector-contact a[href^="tel:"]').count(), 1);
      assert.equal(await page.locator('.sector-contact a[href^="mailto:"]').count(), 1);
    }
    await page.getByRole('button', { name: 'Servicii', exact: true }).click();
    await page.getByRole('button', { name: 'Transport', exact: false }).filter({ has: page.locator('.category-list__icon') }).click();
    assert.equal(await page.locator('#topic-transport').isVisible(), true);
    assert.match(await page.locator('#topic-transport').innerText(), /Abonamente/);
    await page.getByRole('button', { name: 'Închide detaliile sectorului' }).click();
    assert.equal(await page.locator('.sector-panel--empty').isVisible(), true);
    await page.locator('.sector-picker').getByRole('button', { name: 'Buiucani' }).click();
    assert.equal(await page.locator('#sector-title').innerText(), 'Buiucani');
    assert.equal(await page.locator('.category-detail').count(), 0);
    await page.locator('.sector-label[data-sector="rascani"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#sector-title').innerText(), 'Râșcani');
    const circle = await page.locator('.sector-dots--ciocana circle').nth(40).boundingBox();
    await page.mouse.click(circle.x + circle.width / 2, circle.y + circle.height / 2);
    assert.equal(await page.locator('#sector-title').innerText(), 'Ciocana');
    await page.getByRole('button', { name: 'Telecentru, cartier în sectorul Centru' }).click();
    assert.equal(await page.locator('#sector-title').innerText(), 'Centru');
    await page.locator('.search-suggestions').getByRole('button', { name: 'Grădinițe' }).click();
    assert.match(await page.locator('.search-results').innerText(), /Educație/);
    await page.locator('#question').fill('xyzqzz');
    await page.locator('.searchbar__submit').click();
    assert.equal(await page.locator('.empty-search').isVisible(), true);
    await page.getByRole('button', { name: 'Șterge căutarea ×' }).click();
    await page.locator('.topbar').getByRole('button', { name: 'Raportează o problemă', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.getByLabel('Subiect', { exact: true }).fill('Felinar stins');
    await page.getByLabel('Ce ai observat?').fill('Iluminatul nu funcționează pe strada de test.');
    await page.getByRole('button', { name: 'Copiază textul' }).click();
    await page.getByText('Textul a fost copiat.', { exact: false }).waitFor();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Felinar stins/);
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('report-btn'));
    await page.getByRole('button', { name: 'Contrast sporit' }).click();
    assert.equal(await page.locator('.portal--contrast').count(), 1);
    await page.getByRole('button', { name: 'Contrast sporit' }).click();
    await page.locator('.help-questions summary').first().click();
    assert.equal(await page.locator('.help-questions details[open]').count(), 1);
    await page.locator('.help-questions summary').first().click();
    await page.locator('h1').click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: process.env.PORTAL_DESKTOP_SCREENSHOT || '/tmp/portal-refined-desktop.png', fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Overflow at ${width}`);
      await page.locator('.sector-picker').getByRole('button', { name: 'Botanica' }).click();
      assert.equal(await page.locator('#sector-title').innerText(), 'Botanica');
      if (width === 390) await page.screenshot({ path: process.env.PORTAL_MOBILE_SCREENSHOT || '/tmp/portal-refined-mobile.png', fullPage: true });
    }
    // A failed initial API request must provide a working retry, not a blank page.
    const failurePage = await context.newPage();
    let fail = true;
    await failurePage.route('**/api/sectors', route => fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
    await failurePage.goto(process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5000');
    await failurePage.getByRole('button', { name: 'Încearcă din nou' }).waitFor();
    assert.equal(await failurePage.locator('h1').isVisible(), true);
    fail = false;
    await failurePage.getByRole('button', { name: 'Încearcă din nou' }).click();
    await failurePage.locator('#sector-title').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: five sectors, polygon/keyboard/Telecentru selection, category details, contacts, close/reopen, search/empty state, report copy/Escape, contrast, help, 5 viewport widths, API retry, no JS errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
