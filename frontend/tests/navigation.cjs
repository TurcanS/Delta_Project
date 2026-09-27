// Self-contained navigation regression checks. Build first, then run: node tests/navigation.cjs
// Serves the built files through Playwright interception; all API requests are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const dist = path.resolve(__dirname, '../dist');
const origin = 'http://navigation.test';
const sectors = ['centru', 'botanica', 'buiucani', 'ciocana', 'rascani'].map((id) => ({
  id, label: id === 'centru' ? 'Centru' : id, description: 'Sector municipal', categories: [],
  website: 'https://example.test/', petitions_url: 'https://example.test/contact',
  contact: { address: 'Chișinău', phone: '+37322000000', phone_label: '022 000 000', email: 'test@example.test' },
}));

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      for (const colorScheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.navigationAnimations = [];
          window.snapshotTransitions = 0;
          const animate = Element.prototype.animate;
          Element.prototype.animate = function (...args) {
            const animation = animate.apply(this, args);
            if (this.id === 'main') window.navigationAnimations.push(animation);
            return animation;
          };
          const start = document.startViewTransition?.bind(document);
          if (start) document.startViewTransition = (...args) => { window.snapshotTransitions++; return start(...args); };
        });
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user: null } });
          if (url.pathname === '/api/sectors') return route.fulfill({ json: sectors });
          if (url.pathname === '/api/reports') return route.fulfill({ json: { items: [], counts: { reported: 0, in_progress: 0, solved: 0 } } });
          const file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
          return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
        });
        await page.goto(origin);
        await page.locator('#sector-title').waitFor();
        const header = await page.locator('.topbar__inner').boundingBox();
        const nav = (hash) => page.locator(`.nav a[href="${hash}"]`);

        await nav('#/asistent').click();
        await page.locator('#assistant-question').waitFor();
        assert.equal(await page.evaluate(() => window.navigationAnimations.length), 1);
        const during = await page.locator('.topbar__inner').boundingBox();
        assert.ok(Math.abs(during.x - header.x) < 1, 'header shifts horizontally');
        assert.ok(Math.abs(during.width - header.width) < 1, 'header width changes');
        assert.equal(await page.evaluate(() => {
          const link = document.querySelector('.nav a[href="#/probleme"]');
          const rect = link.getBoundingClientRect();
          return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('a') === link;
        }), true, 'transition blocks the next navigation click');

        // Click again before the previous fade can finish, without locator stability waits.
        for (const hash of ['#/probleme', '#/', '#/asistent', '#/probleme']) {
          const box = await nav(hash).boundingBox();
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForFunction((target) => document.querySelector('.nav__link--active')?.getAttribute('href') === target, hash);
        }
        await page.locator('.issues').waitFor();
        await page.waitForTimeout(220);
        assert.equal(await page.evaluate(() => location.hash), '#/probleme');
        assert.equal(await page.evaluate(() => window.snapshotTransitions), 0);
        assert.equal(await page.locator('#main').evaluate((node) => getComputedStyle(node).opacity), '1');
        assert.equal(await page.evaluate(() => window.navigationAnimations.some((animation) => animation.playState === 'idle')), true, 'interrupted fade was not canceled');

        await page.goBack();
        await page.locator('#assistant-question').waitFor();
        await page.goForward();
        await page.locator('.issues').waitFor();

        // Navigation from a scrolled page settles at the top rather than scrolling during the fade.
        await nav('#/').click();
        await page.locator('#question').waitFor();
        await page.evaluate(() => {
          window.scrollTo({ top: 700, behavior: 'instant' });
          document.querySelector('.nav a[href="#/probleme"]').click();
        });
        await page.locator('.issues').waitFor();
        assert.equal(await page.evaluate(() => window.scrollY), 0);

        const beforeKeyboard = await page.evaluate(() => window.navigationAnimations.length);
        await nav('#/asistent').focus();
        await page.keyboard.press('Enter');
        await page.locator('#assistant-question').waitFor();
        assert.equal(await page.evaluate(() => window.navigationAnimations.length), beforeKeyboard, 'keyboard navigation should be instant');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await nav('#/').click();
        await page.locator('#question').waitFor();
        assert.equal(await page.evaluate(() => window.navigationAnimations.length), beforeKeyboard, 'reduced-motion navigation should be instant');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.deepEqual(errors, []);
        console.log(`PASS: ${width}px ${colorScheme}: rapid navigation, live header, history, scroll, keyboard, reduced motion`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
