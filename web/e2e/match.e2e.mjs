import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
import { launchUnlocked } from './launch.mjs';
const BASE = process.env.SPJ_WEB_URL || 'http://localhost:4173/';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };
const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mk = (id, type, weight, item, metal, date) => ({ id, date, type, metal, item, tunch: 92, weight, pcs: 1, note: '', createdAt: `${date}T10:00:00Z` });
await ctx.addInitScript((stock) => { if (!localStorage.getItem('spj.stock.v1')) localStorage.setItem('spj.stock.v1', JSON.stringify(stock)); }, [
  mk('g1', 'in', 5.5, 'Gold Ring – Classic', 'gold', '2026-10-01'),
  mk('g2', 'in', 5.5, 'Gold Ring – Classic', 'gold', '2026-10-02'),
  mk('g3', 'in', 6, 'Gold Ring – Classic', 'gold', '2026-10-02'),
  mk('s1', 'in', 38.5, 'Silver Anklet – Traditional', 'silver', '2026-10-02'),
]);
const page = await ctx.newPage();
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
const stockLs = () => page.evaluate(() => JSON.parse(localStorage.getItem('spj.stock.v1')));

async function sell(metal, product, gross) {
  await page.click('[data-testid=fab-new]');
  await page.waitForSelector('[data-testid=estimate-page]');
  await page.click('[data-testid=add-item]');
  await page.waitForSelector('[data-testid=picker-modal]');
  await page.locator('[data-testid=pick-option]').filter({ hasText: product }).click();
  await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
  await page.locator('[data-testid=item-card]').first().getByRole('button', { name: metal, exact: true }).click();
  await page.locator('[data-testid=gross]').first().fill(String(gross));
  await page.locator('[data-testid=labour]').first().fill(metal === 'Gold' ? '2' : '900');
  await page.click('[data-testid=save]');
}

await sell('Gold', 'Gold Ring – Classic', 5.5);
await page.waitForSelector('[data-testid=match-modal]');
check('saving a 5.500 g gold ring offers the two matching 5.500 g gold rings (not the 6 g one)', (await page.locator('[data-testid=match-slide]').count()) === 2);
check('a "Remove all" button is shown for the group', await page.locator('[data-testid=match-remove-all]').isVisible());
await page.locator('[data-testid=match-remove]').first().click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid=match-slide]').length === 1);
let st = await stockLs();
const outs = st.filter((e) => e.type === 'out');
check('Remove takes one piece out of stock (an OUT entry of 5.5 g, noted with the bill number)', outs.length === 1 && outs[0].weight === 5.5 && outs[0].item === 'Gold Ring – Classic' && outs[0].note.includes('E-0001'), JSON.stringify(outs));
await page.locator('[data-testid=match-remove]').first().click();
await page.waitForSelector('[data-testid=match-modal]', { state: 'detached' });
st = await stockLs();
check('removing the last match closes the window; both pieces are out, the 6 g one stays', st.filter((e) => e.type === 'out').length === 2 && st.filter((e) => e.type === 'in').length === 4);
check('the bill preview is still there behind it', await page.locator('[data-testid=preview-screen]').isVisible());
await page.getByLabel('Close preview').click();

await sell('Silver', 'Silver Anklet – Traditional', 38.5);
await page.waitForSelector('[data-testid=match-modal]');
check('silver works the same way', (await page.locator('[data-testid=match-slide]').count()) === 1);
await page.click('[data-testid=match-done]');
await page.waitForSelector('[data-testid=match-modal]', { state: 'detached' });
st = await stockLs();
check('Done leaves the stock unchanged', st.filter((e) => e.type === 'out').length === 2);
await page.getByLabel('Close preview').click();

await sell('Gold', 'Gold Ring – Classic', 4.2);
await page.waitForSelector('[data-testid=preview-screen]');
check('no similar piece in stock -> no stock window', (await page.locator('[data-testid=match-modal]').count()) === 0);
// Stock OUT page: metal, category, estimated weight, then pieces near that weight
await page.getByLabel('Close preview').click();
await page.click('[data-testid=tab-home]');
await page.click('[data-testid=tile-stock]');
await page.click('[data-testid=stock-add-out]');
await page.waitForSelector('[data-testid=stock-entry-page]');
check('Stock OUT opens on its own page, with no photo row and no search bar', (await page.locator('[data-testid=stock-modal]').count()) === 0 && (await page.getByText('Product photo').count()) === 0 && (await page.locator('[data-testid=find-search]').count()) === 0);
check('before a weight is entered the list asks for it', (await page.locator('[data-testid=find-piece]').count()) === 0 && (await page.locator('[data-testid=find-box]').innerText()).includes('Enter the weight'));
await page.fill('[data-testid=stock-weight]', '5.9');
await page.waitForFunction(() => document.querySelectorAll('[data-testid=find-piece]').length > 0, null, { timeout: 3000 }).catch(() => {});
let ws = await page.locator('[data-testid=find-piece]').allInnerTexts();
check('gold: pieces within 1 g of 5.9 g (the 6 g ring; the 5.5 g ones were already removed; not 4.4 or 8.35)', ws.length === 1 && ws[0].includes('6.000'), JSON.stringify(ws));
await page.getByTestId('stock-silver').click();
await page.fill('[data-testid=stock-weight]', '35');
await page.waitForFunction(() => document.querySelectorAll('[data-testid=find-piece]').length > 0, null, { timeout: 3000 }).catch(() => {});
ws = await page.locator('[data-testid=find-piece]').allInnerTexts();
check('silver: pieces within 10 g of 35 g (the 38.5 g anklet, not the 7.8 g ring)', ws.length === 1 && ws[0].includes('38.500'), JSON.stringify(ws));
await page.getByTestId('stock-gold').click();
await page.fill('[data-testid=stock-weight]', '6.2');
await page.waitForFunction(() => document.querySelectorAll('[data-testid=find-piece]').length > 0, null, { timeout: 3000 }).catch(() => {});
await page.locator('[data-testid=find-piece]').first().click();
await page.waitForFunction(() => document.querySelector('[data-testid=stock-weight]')?.value === '6', null, { timeout: 3000 }).catch(() => {});
{ const v = [await page.inputValue('[data-testid=stock-weight]'), await page.getAttribute('[data-testid=stock-item]', 'data-value'), await page.inputValue('[data-testid=stock-tunch]')]; check('picking a piece fills its category, exact weight and tunch', v[0] === '6' && v[1] === 'Gold Ring – Classic' && v[2] === '92', JSON.stringify(v)); }
check('tunch, pieces, date and note are all optional', (await page.locator('.field-label', { hasText: 'Tunch (optional)' }).count()) === 1 && (await page.locator('.field-label', { hasText: 'No. of pieces (optional)' }).count()) === 1 && (await page.locator('.field-label', { hasText: 'Date (optional' }).count()) === 1);
await browser.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
