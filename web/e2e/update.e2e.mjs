import { launchUnlocked } from './launch.mjs';
// A newer published copy is loaded by itself when the app comes back to the front; "Update app now" is in Settings.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4173/';
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };
const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
await page.route(/index\.html\?v=/, async (route) => {
  const res = await route.fetch();
  const html = (await res.text()).replace(/\/assets\/index-[^"']+\.js/, '/assets/index-NEWVERSION.js');
  await route.fulfill({ response: res, body: html });
});
await page.waitForTimeout(500);
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(2500);
check('a newer published copy makes the app reload itself', navs >= 1, `navigations: ${navs}`);
await page.waitForSelector('[data-testid=home-page]');
await page.click('[data-testid=open-settings]');
check('Settings has an "Update app now" button', (await page.locator('[data-testid=update-app]').count()) === 1);
await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
