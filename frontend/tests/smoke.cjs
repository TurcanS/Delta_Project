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
    // The map sits below the question box; bring it into view before clicking by coordinates.
    await page.locator('.mapcard__map').scrollIntoViewIfNeeded();
    const circle = await page.locator('.sector-dots--ciocana rect').nth(40).boundingBox();
    await page.mouse.click(circle.x + circle.width / 2, circle.y + circle.height / 2);
    assert.equal(await page.locator('#sector-title').innerText(), 'Ciocana');
    await page.getByRole('button', { name: 'Telecentru, cartier în sectorul Centru' }).click();
    assert.equal(await page.locator('#sector-title').innerText(), 'Centru');
    // Assistant: mocked API so the flow is deterministic.
    const mockAnswer = { status: 'answered', answer: 'S-a investit 9 300 000 MDL.', conflict: null, next_steps: [], request_id: 'test', elapsed_ms: 1200,
      answer_highlights: [{ start: 13, end: 26, text: '9 300 000 MDL', sources: [{ chunk_id: 'c1', start: 29, end: 42 }] }],
      citations: [{ document_id: 'd1', chunk_id: 'c1', title: 'Extinderea Grădiniței Nr. 125', url: 'https://proiecte.chisinau.md/ro/pv-1311', section: 'Auto chunk 1', language: 'ro', text: 'Investiția totală din buget: 9 300 000 MDL pentru grădinița din sectorul Centru.', highlights: [{ start: 0, end: 10, matches: ['answer_evidence'] }] }] };
    let feedback = null;
    await page.route('**/api/ask', route => route.fulfill({ json: JSON.parse(route.request().postData()).question.includes('Paris') ? { ...mockAnswer, status: 'abstained', answer: 'Nu am găsit această informație în documentele selectate.', citations: [], answer_highlights: [] } : mockAnswer }));
    await page.route('**/api/feedback', route => { feedback = JSON.parse(route.request().postData()); route.fulfill({ status: 201, json: { ok: true } }); });
    await page.locator('#question').fill('Cât s-a investit în Grădinița nr. 125?');
    await page.locator('.askbar .ask-button').click();
    await page.locator('.answer--answered').waitFor();
    assert.equal(await page.locator('.nav__link--active').innerText(), 'Asistent');
    await page.locator('.grounded').first().click();
    assert.equal(await page.locator('.viewer mark.is-focus').innerText(), '9 300 000 MDL');
    assert.equal(await page.locator('#viewer-title').innerText(), 'Extinderea Grădiniței Nr. 125');
    await page.locator('.answer').getByRole('button', { name: 'Da' }).click();
    await page.getByText('Mulțumim.', { exact: false }).waitFor();
    assert.equal(feedback.rating, 'up');
    await page.locator('#assistant-question').fill('Cât costă un bilet spre Paris în sectorul Botanica?');
    await page.keyboard.press('Enter');
    await page.locator('.answer--abstained').waitFor();
    assert.match(await page.locator('.answer--abstained .contact-route').innerText(), /Pretura sectorului Botanica/);
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    assert.equal(await page.locator('#assistant-title').innerText(), 'Муниципальный ассистент');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'ru');
    await page.getByRole('button', { name: 'RO', exact: true }).click();
    await page.locator('.nav').getByRole('link', { name: 'Acasă' }).click();
    await page.locator('#sector-title').waitFor();
    await page.locator('.topbar').getByRole('button', { name: 'Raportează o problemă', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('dialog[open]').count(), 1);
    // Photo report: validation first, then a mocked publish so the smoke run never writes to the board.
    await page.route('**/api/reports', (route) => route.request().method() !== 'POST' ? route.continue() : route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ id: 999, title: 'Felinar stins', description: 'Iluminatul nu funcționează pe strada de test.', address: 'str. Test 1', sector: 'centru', category: 'lighting', status: 'reported', confirmations: 1, confirmed: true, photo: '/api/reports/photos/demo-lamp-verhorechye.jpg', after_photo: null, created_at: new Date().toISOString() }),
    }));
    await page.getByRole('button', { name: 'Publică sesizarea' }).click();
    assert.equal(await page.locator('.field-error').count() >= 3, true);
    await page.locator('#report-photo').setInputFiles(require('node:path').join(__dirname, '../../app/seed/reports/lamp-verhorechye.jpg'));
    await page.locator('.photo-field > img').waitFor();
    await page.locator('.category-chip', { hasText: 'Iluminat stradal' }).click();
    await page.getByLabel('Numiți problema').fill('Felinar stins');
    await page.getByLabel('Descriere').fill('Iluminatul nu funcționează pe strada de test.');
    await page.getByRole('button', { name: 'Publică sesizarea' }).click();
    await page.locator('.report-success').waitFor();
    await page.getByRole('button', { name: 'Copiază textul' }).click();
    await page.getByText('Textul a fost copiat.', { exact: false }).waitFor();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Felinar stins/);
    await page.unroute('**/api/reports');
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('report-btn'));
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
    console.log('PASS: five sectors, polygon/keyboard/Telecentru selection, category details, contacts, close/reopen, assistant answer/source/feedback/abstain routing/RU, photo report validate/publish/copy/Escape, help, 5 viewport widths, API retry, no JS errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
