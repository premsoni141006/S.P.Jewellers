// System Back (Android button / edge swipe) must go back exactly ONE step each time.
// Uses the browser's real history: page.goBack() fires the same popstate Android's WebView does.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');

const settle = () => page.waitForTimeout(350);
const idx = () => page.evaluate(() => navigation.currentEntry.index);
const entries = () => page.evaluate(() => navigation.entries().length);
// At the very start of history (nothing for Back to return to): the next Back press leaves the app.
const atRoot = async () => (await idx()) === 0 && !(await page.evaluate(() => navigation.canGoBack));
const isHome = () => page.locator('[data-testid=home-page]').isVisible();
// The system Back press: go back in history, then let the app react.
const back = async () => { await page.goBack().catch(() => {}); await settle(); };
const nothingOpen = async () =>
  (await page.locator('.modal-backdrop, .sheet-backdrop').count()) === 0;

await settle();
check('start: on Home, nothing to go back to', (await isHome()) && (await atRoot()), `index=${await idx()} entries=${await entries()}`);

// 1. History -> Back -> Home (one step)
await page.click('[data-testid=tab-history]'); await settle();
check('History is open, one spare entry added', (await page.locator('[data-testid=history-page]').isVisible()) && (await idx()) === 1, `index=${await idx()}`);
await back();
check('Back from History -> Home (one step)', (await isHome()) && (await idx()) === 0, `index=${await idx()}`);

// 2. Estimate -> picker -> Back closes ONLY the picker -> Back -> Home
await page.click('[data-testid=fab-new]'); await page.waitForSelector('[data-testid=estimate-page]'); await settle();
check('Estimate open: still exactly one spare entry', (await idx()) === 1 && (await entries()) === 2, `index=${await idx()} entries=${await entries()}`);
await page.click('[data-testid=add-item]'); await page.waitForSelector('[data-testid=picker-modal]'); await settle();
check('picker open on top of Estimate: still one spare entry', (await idx()) === 1 && (await entries()) === 2, `index=${await idx()} entries=${await entries()}`);
await back();
check('Back #1 closes only the picker (Estimate stays)', (await page.locator('[data-testid=picker-modal]').count()) === 0 && (await page.locator('[data-testid=estimate-page]').isVisible()) && !(await isHome()));
check('spare entry restored after closing the picker', (await idx()) === 1, `index=${await idx()}`);
await back();
check('Back #2 -> Home', await isHome());
check('Home: nothing to go back to (next Back leaves the app)', (await atRoot()) && (await nothingOpen()), `index=${await idx()} entries=${await entries()}`);

// 3. Settings -> Printer settings: Back goes Printer -> Settings -> Home, one at a time
await page.click('[data-testid=open-settings]'); await page.waitForSelector('[data-testid=settings-page]'); await settle();
await page.click('[data-testid=open-printer]'); await page.waitForSelector('[data-testid=printer-page]'); await settle();
check('Printer settings open, one spare entry', (await idx()) === 1, `index=${await idx()}`);
await back();
check('Back from Printer settings -> Settings (not Home)', await page.locator('[data-testid=settings-page]').isVisible());
await back();
check('Back from Settings -> Home', await isHome());
check('Home again clean', await atRoot(), `index=${await idx()}`);

// 4. Rates pop-up on Home: Back closes just the pop-up
await page.click('[data-testid=tile-rates]'); await page.waitForSelector('[data-testid=rates-modal]'); await settle();
await back();
check('Back closes the Rates pop-up and stays on Home', (await page.locator('[data-testid=rates-modal]').count()) === 0 && (await isHome()) && (await idx()) === 0, `index=${await idx()}`);

// 5. UI arrow (not the system Back): history must be cleaned up, not left stale
await page.click('[data-testid=fab-new]'); await page.waitForSelector('[data-testid=estimate-page]'); await settle();
await page.click('[data-testid=bar-back]'); await settle();
check('on-screen back arrow -> Home, and no stale history entry remains', (await isHome()) && (await atRoot()), `index=${await idx()} entries=${await entries()}`);

// 6. Two layers (Estimate + picker) then two quick Back presses: closes both, in order, never more
await page.click('[data-testid=fab-new]'); await page.waitForSelector('[data-testid=estimate-page]'); await settle();
await page.click('[data-testid=add-item]'); await page.waitForSelector('[data-testid=picker-modal]'); await settle();
await page.goBack().catch(() => {}); await page.waitForTimeout(450); // second press after the first has been handled
await page.goBack().catch(() => {}); await settle();
check('two Back presses: picker closed, then Estimate closed, ending on Home', (await isHome()) && (await idx()) === 0, `index=${await idx()}`);

// 7. Preview from History: Back closes the preview only
await page.click('[data-testid=fab-new]'); await page.waitForSelector('[data-testid=estimate-page]');
await page.click('[data-testid=add-item]'); await page.waitForSelector('[data-testid=picker-modal]');
await page.locator('[data-testid=pick-option]').first().click(); await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
await page.locator('[data-testid=gross]').fill('10');
await page.click('[data-testid=save]'); await page.waitForSelector('[data-testid=toast]');
await page.click('[data-testid=bar-back]'); await settle();
await page.click('[data-testid=tab-history]'); await page.waitForSelector('[data-testid=history-page]');
await page.getByRole('button', { name: 'View' }).first().click(); await page.waitForSelector('[data-testid=preview-frame]'); await settle();
check('preview open over History: still one spare entry', (await idx()) === 1 && (await entries()) === 2, `index=${await idx()} entries=${await entries()}`);
await back();
check('Back closes the preview only (History stays)', (await page.locator('[data-testid=preview-frame]').count()) === 0 && (await page.locator('[data-testid=history-page]').isVisible()));
await back();
check('Back -> Home, history clean', (await isHome()) && (await atRoot()), `index=${await idx()}`);

// 8. Open and close the same screen 6 times with the arrow: never accumulates entries
for (let i = 0; i < 6; i++) {
  await page.click('[data-testid=tab-history]'); await settle();
  await page.click('[data-testid=tab-home]'); await settle();
}
check('6x History <-> Home with tabs: still no stale entries', (await isHome()) && (await atRoot()), `index=${await idx()} entries=${await entries()}`);

await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
