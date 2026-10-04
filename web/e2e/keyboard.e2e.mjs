import { launchUnlocked } from './launch.mjs';
// When the on-screen keyboard opens, the tapped field must be fully visible and (where the page can
// scroll) in the middle of the space left above the keyboard. The keyboard is simulated by shrinking
// the viewport, which is exactly what Android's adjustResize does to the page.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

const FULL = { width: 390, height: 844 };
const KB = { width: 390, height: 430 }; // what is left above a ~410 px keyboard

const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: FULL, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
const wait = (ms) => page.waitForTimeout(ms);

/** Focus a field, then "open the keyboard" and report where the field ended up. */
async function withKeyboard(selector) {
  await page.setViewportSize(FULL); await wait(350);
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ force: true });
  await page.setViewportSize(KB);
  await wait(1100);
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const top = document.querySelector('.appbar, .app-bar, header')?.getBoundingClientRect().bottom ?? 0;
    return { top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2, vh: window.innerHeight, barBottom: top, active: document.activeElement === el, kb: document.documentElement.classList.contains('kb-open') };
  }, selector);
}
const visible = (m) => m.active && m.top >= m.barBottom - 1 && m.bottom <= m.vh + 1;
const centred = (m) => Math.abs(m.mid - (m.vh + m.barBottom) / 2) <= 80;

// --- Estimate page: build one item so there are fields low on the page
await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
await page.click('[data-testid=add-item]');
await page.locator('[data-testid=pick-option]').first().click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
await wait(300);

for (const [name, sel, mustCentre] of [
  ['Customer name', '[data-testid=customer-name]', false], // already near the top of the page: cannot scroll further up
  ['Contact number', '[data-testid=customer-phone]', false],
  ['G. Wt.', '[data-testid=gross]', true],
  ['Less Wt.', '[data-testid=less]', true],
  ['Tunch', '[data-testid=tunch]', true],
  ['No. of pieces', '[data-testid=pcs]', true],
  ['Making charge', '[data-testid=labour]', true],
]) {
  const m = await withKeyboard(sel);
  check(`${name}: visible above the keyboard${mustCentre ? ' and in the middle' : ''}`, visible(m) && (!mustCentre || centred(m)), JSON.stringify(m));
}
const m0 = await withKeyboard('[data-testid=labour]');
check('keyboard open: the fixed bottom bars step aside', m0.kb && (await page.locator('[data-testid=totals]').evaluate((e) => getComputedStyle(e).display)) === 'none');
await page.locator('[data-testid=labour]').blur();
await page.setViewportSize(FULL); await wait(600);
check('keyboard closed: bars are back', !(await page.evaluate(() => document.documentElement.classList.contains('kb-open'))) && (await page.locator('[data-testid=totals]').evaluate((e) => getComputedStyle(e).display)) !== 'none');

// --- fields inside pop-ups
await page.setViewportSize(FULL);
await page.click('[data-testid=bar-back]'); await wait(300);
await page.click('[data-testid=tile-rates]'); await page.waitForSelector('[data-testid=rates-modal]'); await wait(500);
for (const [name, sel] of [['Silver rate', '[data-testid=silver-input]'], ['Gold rate', '[data-testid=gold-input]']]) {
  const m = await withKeyboard(sel);
  check(`Rates pop-up, ${name}: visible above the keyboard`, visible(m) && m.top >= 0, JSON.stringify(m));
}
await page.setViewportSize(FULL); await page.click('[data-testid=rates-close]'); await page.waitForSelector('[data-testid=rates-modal]', { state: 'detached' });

await page.click('[data-testid=tile-stock]'); await page.waitForSelector('[data-testid=stock-page]'); await wait(300);
await page.click('[data-testid=stock-add-in]'); await page.waitForSelector('[data-testid=stock-entry-page]'); await wait(500);
for (const [name, sel] of [['Weight', '[data-testid=stock-weight]'], ['Tunch', '[data-testid=stock-tunch]'], ['Pieces', '[data-testid=stock-pcs]'], ['Note', '[data-testid=stock-note]']]) {
  const m = await withKeyboard(sel);
  check(`Stock pop-up, ${name}: visible above the keyboard`, visible(m) && m.top >= 0 && m.bottom <= m.vh, JSON.stringify(m));
}
{
  const m = await withKeyboard('[data-testid=stock-note]');
  check('Stock pop-up, Note (last field): near the middle of the visible area', Math.abs(m.mid - m.vh / 2) <= 110, JSON.stringify(m));
}

await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
