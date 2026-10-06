import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
import { launchUnlocked } from './launch.mjs';
const BASE = process.env.SPJ_WEB_URL || 'http://localhost:4173/';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };
const browser = await launchUnlocked(chromium);
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(BASE); await page.waitForSelector('[data-testid=home-page]');
const flat = async (loc) => (await loc.textContent()).replace(/\s/g, '');

// Rates pop-up: the gold karat -> purity table (22K = 92 %, 24K = 100 %, 18K = 75 % ...)
await page.click('[data-testid=tile-rates]'); await page.waitForSelector('[data-testid=rates-modal]');
check('Rates pop-up has the karat table with 24K = 100, 22K = 92, 18K = 75', (await page.inputValue('[data-testid=karat-24]')) === '100' && (await page.inputValue('[data-testid=karat-22]')) === '92' && (await page.inputValue('[data-testid=karat-18]')) === '75');
check('the old 22K / 24K rate switch is gone', (await page.locator('.karat-pick').count()) === 0);
await page.fill('[data-testid=gold-input]', '72000'); // rate per 10 g
await page.click('[data-testid=rates-save]'); await page.waitForSelector('[data-testid=rates-modal]', { state: 'detached' });

// A gold item asks for the karat, not the tunch
await page.click('[data-testid=fab-new]'); await page.waitForSelector('[data-testid=estimate-page]');
await page.click('[data-testid=add-item]'); await page.waitForSelector('[data-testid=picker-modal]');
await page.locator('[data-testid=pick-option]').filter({ hasText: 'Gold Ring' }).click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
const card = page.locator('[data-testid=item-card]').first();
await card.getByRole('button', { name: 'Gold', exact: true }).click();
await page.waitForFunction(() => document.querySelector('[data-testid=karat]')?.value === '22', null, { timeout: 3000 }).catch(() => {});
check('a gold item shows Karat (22 by default), not Tunch', (await card.locator('[data-testid=karat]').count()) === 1 && (await card.locator('[data-testid=tunch]').count()) === 0 && (await card.locator('[data-testid=karat]').inputValue()) === '22', await card.locator('[data-testid=karat]').inputValue().catch(() => 'none'));
// the item name can be typed over (the pencil beside the chooser)
await card.locator('[data-testid=desc-edit]').click();
await card.locator('[data-testid=desc-input]').fill('Heavy Gold Ring 22K');
await card.locator('[data-testid=desc-input]').press('Enter');
check('the item name can be edited by hand', (await card.locator('[data-testid=desc]').getAttribute('data-value')) === 'Heavy Gold Ring 22K' && (await card.locator('[data-testid=desc-input]').count()) === 0);
await card.locator('[data-testid=gross]').fill('10');
await page.waitForFunction(() => document.querySelector('[data-testid=amount]')?.textContent.replace(/\s/g, '') === '₹66,240', null, { timeout: 3000 }).catch(() => {});
check('22K uses 92 %: 10 g -> ₹66,240', (await flat(card.locator('[data-testid=amount]'))) === '₹66,240', await flat(card.locator('[data-testid=amount]')));
await card.locator('[data-testid=karat]').fill('24');
await page.waitForFunction(() => document.querySelector('[data-testid=amount]')?.textContent.replace(/\s/g, '') === '₹72,000', null, { timeout: 3000 }).catch(() => {});
check('typing 24 switches to 100 %: ₹72,000', (await flat(card.locator('[data-testid=amount]'))) === '₹72,000', await flat(card.locator('[data-testid=amount]')));
await card.locator('[data-testid=karat]').fill('18');
await page.waitForFunction(() => document.querySelector('[data-testid=amount]')?.textContent.replace(/\s/g, '') === '₹54,000', null, { timeout: 3000 }).catch(() => {});
check('18 uses 75 %: ₹54,000', (await flat(card.locator('[data-testid=amount]'))) === '₹54,000', await flat(card.locator('[data-testid=amount]')));
await card.locator('[data-testid=karat]').fill('24');
await page.waitForTimeout(300);
await page.click('[data-testid=preview]');
const frame = page.frameLocator('[data-testid=preview-frame]');
await frame.locator('body').waitFor();
await page.waitForTimeout(400);
const text = await frame.locator('body').innerText();
check('the bill has no Tunch column (the karat only sets the purity used for the amount)', !/Tunch/.test(text), text.slice(0, 300));
await page.getByLabel('Close preview').click();

// Silver stays on Tunch
await page.click('[data-testid=add-item]'); await page.waitForSelector('[data-testid=picker-modal]');
await page.locator('[data-testid=pick-option]').filter({ hasText: 'Silver Ring' }).click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
const silver = page.locator('[data-testid=item-card]').nth(1);
await silver.getByRole('button', { name: 'Silver', exact: true }).click().catch(() => {});
check('a silver item still shows Tunch (100)', (await silver.locator('[data-testid=tunch]').count()) === 1 && (await silver.locator('[data-testid=karat]').count()) === 0);
await browser.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
