// Answer card behaviour with mocked answers: procedure checklist, translation note, evidence
// excerpts, conflict and abstention routing, feedback reasons and the mobile source sheet.
// Usage: PORTAL_TEST_URL=http://127.0.0.1:5000 node tests/answers.cjs [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5000';
const out = process.argv[2];
const shot = (page, name) => (out ? page.screenshot({ path: `${out}/${name}.png` }) : Promise.resolve());
const text = 'Tinerii antreprenori pot solicita granturi de până la 200 de mii de lei. Programul municipal „STARTUP pentru TINERI ȘI MIGRANȚI” este adresat persoanelor între 18 și 40 de ani cu viza de reședință în municipiul Chișinău.';
const answerRu = 'Подать заявку могут жители Кишинэу в возрасте от 18 до 40 лет.\n1. Иметь вид на жительство в муниципии Кишинэу.\n2. Иметь предприятие, зарегистрированное в Кишинэу, или доказать намерение открыть бизнес.\n3. Подать заявку на грант до 200 000 леев.';
const idx = (s) => Array.from(answerRu).length && Array.from(answerRu.slice(0, answerRu.indexOf(s))).length;
const procedure = {
  status: 'answered', answer: answerRu, conflict: null, next_steps: [], request_id: 'r-proc', elapsed_ms: 2100,
  answer_highlights: [{ start: idx('от 18 до 40 лет'), end: idx('от 18 до 40 лет') + 15, sources: [{ chunk_id: 'c1', start: 0, end: 10 }] },
    { start: idx('до 200 000 леев'), end: idx('до 200 000 леев') + 15, sources: [{ chunk_id: 'c1', start: 0, end: 10 }] }],
  citations: [{ document_id: 'd1', chunk_id: 'c1', title: 'STARTUP pentru tineri și migranți', url: 'https://proiecte.chisinau.md/ro/pv-289-startup-pentru-tineri-si-migranti', section: 'Auto chunk 1', language: 'ro', text,
    highlights: [{ start: Array.from(text.slice(0, text.indexOf('între 18'))).length, end: Array.from(text.slice(0, text.indexOf(' ani cu'))).length, matches: ['answer_evidence'] }] }],
};
const conflict = {
  status: 'conflict', answer: 'Documentele indică valori diferite: o fișă menționează 3 grupe noi, alta o anexă pentru încă 2 grupe și reconstrucția unei alte grupe.', conflict: { message: 'Numărul grupelor noi diferă între cele două pagini ale proiectului.' },
  next_steps: [], request_id: 'r-conf', elapsed_ms: 1800, answer_highlights: [],
  citations: [
    { document_id: 'd2', chunk_id: 'c2', title: 'Extinderea Grădiniței nr. 125', url: 'https://proiecte.chisinau.md/ro/pv-1311-extinderea-gradinitei-nr-125', language: 'ro', text: 'În Grădinița-creșă Nr. 125 din sectorul Centru al Capitalei au fost deschise suplimentar 3 grupe noi, în urma finalizării proiectului de extindere.', highlights: [{ start: 70, end: 108, matches: ['answer_evidence'] }] },
    { document_id: 'd3', chunk_id: 'c3', title: 'Un bloc nou la Grădinița nr. 125', url: 'https://proiecte.chisinau.md/ro/gradinita-125-bloc-nou', language: 'ro', text: 'Un proiect care a costat 9,3 milioane lei şi a prevăzut construcția unei anexe pentru încă 2 grupe și reconstrucția capitală a unei alte grupe de copii.', highlights: [{ start: 55, end: 100, matches: ['answer_evidence'] }] },
  ],
};
const abstain = { status: 'abstained', answer: 'Informația solicitată nu se regăsește în documentele disponibile.', conflict: null, next_steps: [], request_id: 'r-abs', elapsed_ms: 900, answer_highlights: [], citations: [] };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const feedback = [];
    await page.route('**/api/ask', (route) => {
      const q = JSON.parse(route.request().postData()).question;
      route.fulfill({ json: q.includes('grupe') ? conflict : q.includes('înscri') ? abstain : procedure });
    });
    await page.route('**/api/feedback', (route) => { feedback.push(JSON.parse(route.request().postData())); route.fulfill({ status: 201, json: { ok: true, id: 7 } }); });
    await page.goto(BASE);
    await page.locator('#sector-title').waitFor();
    await shot(page, `home2-${theme}`);
    await page.locator('#question').fill('Кто может подать заявку на программу STARTUP?');
    await page.locator('.askbar .ask-button').click();
    await page.locator('.answer__steps').waitFor();
    assert.equal(await page.locator('.answer__steps li').count(), 3);
    await page.locator('.answer__steps input').first().check();
    assert.equal(await page.locator('.answer__steps li.is-done').count(), 1);
    assert.equal(await page.locator('.answer__translated').count(), 1);
    assert.equal(await page.locator('.evidence__quote mark').count(), 1);
    await page.locator('.grounded').first().click();
    await page.waitForTimeout(400);
    await shot(page, `answer-proc-${theme}`);
    await page.getByRole('button', { name: /Нет|Nu/ }).last().click();
    await page.locator('.feedback__reason').nth(3).click();
    await page.locator('.feedback__form button[type=submit]').click();
    await page.waitForTimeout(200);
    assert.equal(feedback.length, 2);
    assert.deepEqual(feedback[1].reasons, ['outdated']);
    assert.equal(feedback[1].feedback_id, 7);
    assert.equal(feedback[0].sources[0].chunk_id, 'c1');
    await page.locator('#assistant-question').fill('Câte grupe noi are Grădinița nr. 125?');
    await page.keyboard.press('Enter');
    await page.locator('.answer--conflict').waitFor();
    await page.locator('#assistant-question').fill('Cum se face înscrierea la grădiniță?');
    await page.keyboard.press('Enter');
    await page.locator('.answer--abstained').waitFor();
    await page.locator('.answer--abstained .contact-route__sector').waitFor();
    await page.locator('.answer--abstained .contact-route__sector button', { hasText: 'Botanica' }).click();
    await page.locator('.answer--abstained a[href="https://detsbotanica.md/"]').waitFor();
    await page.waitForTimeout(300);
    await page.locator('.answer--conflict').scrollIntoViewIfNeeded();
    await shot(page, `answer-conflict-${theme}`);
    await page.locator('.answer--abstained').scrollIntoViewIfNeeded();
    await shot(page, `answer-abstain-${theme}`);
    await context.close();
  }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await mobile.newPage();
  await p.route('**/api/ask', (route) => route.fulfill({ json: procedure }));
  await p.goto(`${BASE}/#/asistent`);
  await p.locator('#assistant-question').fill('Кто может подать заявку?');
  await p.keyboard.press('Enter');
  await p.locator('.answer__steps').waitFor();
  await p.locator('.evidence__actions button').first().click();
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'viewer-title');
  await shot(p, `m-viewer`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  assert.match(await p.evaluate(() => document.activeElement?.textContent || ''), /Фрагмент 1|Vezi pasajul 1/);
  await browser.close();
  assert.deepEqual(errors, []);
  console.log('PASS: procedure checklist, translation note, evidence excerpt, conflict, abstain sector routing, feedback reasons, mobile source focus.');
})().catch((error) => { console.error(error); process.exit(1); });
