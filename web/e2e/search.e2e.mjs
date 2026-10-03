// Home search: find saved bills by name, phone, place, item, weight, amount, date, bill number.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const SHOTS = new URL('../../docs/screenshots/', import.meta.url).pathname;
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
const wait = (ms) => page.waitForTimeout(ms);

async function createBill({ name, phone, place, product, metal, gross }) {
  await page.click('[data-testid=fab-new]');
  await page.waitForSelector('[data-testid=estimate-page]');
  await page.fill('[data-testid=customer-name]', name);
  await page.fill('[data-testid=customer-phone]', phone);
  await page.fill('[data-testid=customer-locality]', place);
  await page.click('[data-testid=add-item]');
  await page.locator('[data-testid=pick-option]').filter({ hasText: product }).first().click();
  await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
  await page.locator('[data-testid=item-card]').first().getByRole('button', { name: metal, exact: true }).click();
  await page.locator('[data-testid=gross]').first().fill(String(gross));
  await page.locator('[data-testid=labour]').first().fill(metal === 'Gold' ? '2' : '900');
  await page.waitForFunction(() => /[1-9]/.test(document.querySelector('[data-testid=grand-total]')?.textContent || ''));
  const total = (await page.textContent('[data-testid=grand-total]')).replace(/[^0-9]/g, '');
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=toast]');
  await page.click('[data-testid=bar-back]');
  await page.waitForSelector('[data-testid=home-page]');
  return total;
}

const totalA = await createBill({ name: 'Ramesh Kumar', phone: '9876543210', place: 'Gandhi Chowk', product: 'Gold Ring – Classic', metal: 'Gold', gross: 10.5 });
const totalB = await createBill({ name: 'Sunita Devi', phone: '9416125950', place: 'Main Bazar', product: 'Silver Anklet – Traditional', metal: 'Silver', gross: 38.5 });
check('two bills saved (A total ' + totalA + ', B total ' + totalB + ')', totalA !== totalB && Number(totalA) > 0 && Number(totalB) > 0);

const bar = page.locator('[data-testid=home-search]');
const tilesVisible = () => page.locator('[data-testid=tile-products]').isVisible();
const results = () => page.locator('[data-testid=search-result]');
const search = async (q) => { await bar.fill(q); await wait(250); return results().count(); };

check('search bar sits above the Products and Rates cards', (await bar.boundingBox()).y < (await page.locator('[data-testid=tile-products]').boundingBox()).y && (await bar.boundingBox()).y < (await page.locator('[data-testid=tile-rates]').boundingBox()).y);
check('no search yet: cards and Recent orders are shown, no results list', (await tilesVisible()) && (await page.locator('[data-testid=recent-card]').count()) === 1 && (await page.locator('[data-testid=search-results]').count()) === 0);
check('new Home layout: no owner / address lines, search placeholder as designed', !(await page.locator('[data-testid=home-page]').innerText()).includes('Sandeep') && (await bar.getAttribute('placeholder')) === 'Search products, items, or orders...');
check('search bar and the three cards are inside the maroon header; Recent orders is below', (await page.locator('.home-head [data-testid=home-search]').count()) === 1 && (await page.locator('.home-head .tile').count()) === 3 && (await page.locator('[data-testid=recent-card]').boundingBox()).y > (await page.locator('.home-head').boundingBox()).y + (await page.locator('.home-head').boundingBox()).height - 5);
check('the three card icons are on one line', await page.evaluate(() => { const ys = [...document.querySelectorAll('.home-head .tile-icon')].map((e) => Math.round(e.getBoundingClientRect().top)); return ys.length === 3 && Math.max(...ys) - Math.min(...ys) <= 1; }));
check('Recent orders arrow opens History', await (async () => { await page.click('[data-testid=recent-open-history]'); const ok = await page.locator('[data-testid=history-page]').isVisible(); await page.click('[data-testid=tab-home]'); await page.waitForSelector('[data-testid=home-page]'); return ok; })());

check('by customer name ("ramesh") -> 1 bill', (await search('ramesh')) === 1 && (await results().first().innerText()).includes('Ramesh Kumar'));
check('results replace Recent orders; the three cards stay in the header', (await tilesVisible()) && (await page.locator('[data-testid=recent-card]').count()) === 0);
await page.screenshot({ path: SHOTS + 'web-search.png' });
check('by customer name, other case ("SUNITA")', (await search('SUNITA')) === 1 && (await results().first().innerText()).includes('Sunita Devi'));
check('by phone number (full)', (await search('9876543210')) === 1 && (await results().first().innerText()).includes('Ramesh'));
check('by phone number (part)', (await search('94161')) === 1 && (await results().first().innerText()).includes('Sunita'));
check('by place (address)', (await search('gandhi')) === 1 && (await search('bazar')) === 1);
await search('anklet');
check('search also lists saved products (Silver Anklet) and opens Products', (await page.locator('[data-testid=search-product]').count()) === 1);
check('by item name', (await search('anklet')) === 1 && (await results().first().innerText()).includes('Sunita'));
check('by item weight (10.5)', (await search('10.5')) === 1 && (await results().first().innerText()).includes('Ramesh'));
check('by item weight (38.500)', (await search('38.500')) === 1 && (await results().first().innerText()).includes('Sunita'));
check('by total amount (digits)', (await search(totalA)) >= 1 && (await results().first().innerText()).includes('Ramesh'));
check('by total amount (with ₹ and commas)', (await search('₹' + new Intl.NumberFormat('en-IN').format(Number(totalB)))) >= 1 && (await results().first().innerText()).includes('Sunita'));
const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
check('by date (dd/mm/yyyy) finds both bills made today', (await search(`${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`)) === 2);
check('by date (2026-style ISO)', (await search(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)) === 2);
check('by bill number', (await search('E-0002')) === 1 && (await results().first().innerText()).includes('Sunita'));
check('several words narrow it ("ramesh gandhi" = 1, "ramesh bazar" = 0)', (await search('ramesh gandhi')) === 1 && (await search('ramesh bazar')) === 0);
check('nothing found shows a clear message', (await page.locator('[data-testid=search-count]').innerText()).toLowerCase().includes('nothing found'));

// open a result, then back
await search('ramesh');
await results().first().click();
await page.waitForSelector('[data-testid=preview-frame]'); await wait(300);
check('tapping a result opens that bill', (await page.locator('[data-testid=preview-frame]').count()) === 1);
await page.goBack().catch(() => {}); await wait(450);
check('Back closes the bill and returns to the search results', (await page.locator('[data-testid=preview-frame]').count()) === 0 && (await results().count()) === 1);

// clear
await page.click('[data-testid=home-search-clear]'); await wait(250);
check('clear button empties the search and brings Recent orders back', (await bar.inputValue()) === '' && (await page.locator('[data-testid=recent-card]').count()) === 1 && (await page.locator('[data-testid=search-results]').count()) === 0);

await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
