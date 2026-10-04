import { launchUnlocked } from './launch.mjs';
// Shop stock: Silver/Gold register (photo, category from saved products, weight, tunch) and Cash register.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const SHOTS = new URL('../../docs/screenshots/', import.meta.url).pathname;
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

// 1x1 PNG used as the "camera picture"
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
const settle = () => page.waitForTimeout(350);
const txt = (id) => page.locator(`[data-testid=${id}]`).first().innerText();
const flat = async (id) => (await txt(id)).replace(/\s+/g, '');
const rows = () => page.locator('[data-testid=stock-row]');
const crows = () => page.locator('[data-testid=cash-row]');
const idx = () => page.evaluate(() => navigation.currentEntry.index);
const photoCount = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('spj-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; r.onerror = () => res(-1); }));

async function pickItem(name) {
  await page.click('[data-testid=stock-item]');
  await page.waitForSelector('[data-testid=picker-modal]');
  await page.locator('[data-testid=pick-option]').filter({ hasText: name }).first().click();
  await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
}
async function addStock(type, { metal, item, weight, tunch, pcs = '', note = '', photo = false }) {
  await page.click(`[data-testid=stock-add-${type}]`);
  await page.waitForSelector('[data-testid=stock-modal]');
  await page.click(`[data-testid=stock-${metal}]`);
  await pickItem(item);
  await page.fill('[data-testid=stock-weight]', String(weight));
  if (tunch !== undefined) await page.fill('[data-testid=stock-tunch]', String(tunch));
  if (pcs !== '') await page.fill('[data-testid=stock-pcs]', String(pcs));
  if (note) await page.fill('[data-testid=stock-note]', note);
  if (photo) await page.setInputFiles('[data-testid=photo-input-camera]', { name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await page.click('[data-testid=stock-save]');
  await page.waitForSelector('[data-testid=stock-modal]', { state: 'detached' });
}
async function addCash(type, amount, note = '') {
  await page.click(`[data-testid=cash-add-${type}]`);
  await page.waitForSelector('[data-testid=cash-modal]');
  await page.fill('[data-testid=cash-amount]', String(amount));
  if (note) await page.fill('[data-testid=cash-note]', note);
  await page.click('[data-testid=cash-save]');
  await page.waitForSelector('[data-testid=cash-modal]', { state: 'detached' });
}

// ------------------------------------------------------------ the page and its two cards
check('Home has a Shop stock card', (await page.locator('.tile').count()) === 3 && (await page.locator('[data-testid=tile-stock]').innerText()).includes('Shop stock'));
await page.click('[data-testid=tile-stock]');
await page.waitForSelector('[data-testid=stock-page]'); await settle();
check('two cards: Silver / Gold and Cash', (await page.locator('[data-testid=card-metal]').innerText()).includes('Silver / Gold') && (await page.locator('[data-testid=card-cash]').innerText()).includes('Cash'));
check('Silver / Gold card is selected first; zero totals; empty state', (await page.locator('[data-testid=card-metal]').getAttribute('aria-selected')) === 'true' && (await txt('stock-gold-sum-net')) === '0.000 g' && (await page.getByText('No stock entries yet.').count()) === 1);
await page.screenshot({ path: SHOTS + 'web-stock-empty.png' });

// ------------------------------------------------------------ validation
await page.click('[data-testid=stock-add-in]'); await page.waitForSelector('[data-testid=stock-modal]');
await page.click('[data-testid=stock-save]');
check('no category chosen is refused', (await txt('stock-error')).toLowerCase().includes('item'));
await pickItem('Gold Ring – Classic');
check('choosing the category fills its tunch from the saved item (92)', (await page.inputValue('[data-testid=stock-tunch]')) === '92');
await page.click('[data-testid=stock-save]');
check('no weight is refused', (await txt('stock-error')).toLowerCase().includes('weight'));
check('modal is blurred like the other pop-ups', /blur/.test(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=stock-backdrop]')).backdropFilter || '')));
// "+" in the category list opens the products pop-up; closing it brings the list back
await page.click('[data-testid=stock-item]'); await page.waitForSelector('[data-testid=picker-modal]');
await page.click('[data-testid=pick-add]'); await page.waitForSelector('[data-testid=prod-name]');
await page.click('[data-testid=products-close]'); await page.waitForSelector('[data-testid=picker-modal]');
check('"+" in the category list opens Products here, and closing returns to the list', true);
await page.click('[data-testid=picker-close]'); await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
await page.click('[data-testid=stock-close]'); await page.waitForSelector('[data-testid=stock-modal]', { state: 'detached' });

// ------------------------------------------------------------ metal entries with photo
await addStock('in', { metal: 'gold', item: 'Gold Ring – Classic', weight: 100, pcs: 2, note: 'From party A', photo: true });
check('Stock IN gold 100 g with a photo -> thumbnail in the list, gold 100.000 g', (await txt('stock-gold-sum-net')) === '100.000 g' && (await rows().count()) === 1 && (await page.locator('[data-testid=stock-thumb]').count()) === 1);
check('row shows category, metal and tunch', (await rows().first().innerText()).includes('Gold Ring – Classic') && (await rows().first().innerText()).includes('92%'));
check('the photo is kept on the phone (1 stored photo)', (await photoCount()) === 1);
await addStock('out', { metal: 'gold', item: 'Gold Ring – Classic', weight: 30.5, pcs: 1, note: 'Sold' });
check('Stock OUT gold 30.5 g -> 69.500 g', (await txt('stock-gold-sum-net')) === '69.500 g' && (await rows().count()) === 2);
await addStock('in', { metal: 'silver', item: 'Silver Anklet – Traditional', weight: 500, pcs: 10, photo: true });
check('Silver tracked separately: 500.000 g; 2 photos stored', (await txt('stock-silver-sum-net')) === '500.000 g' && (await txt('stock-gold-sum-net')) === '69.500 g' && (await photoCount()) === 2);
check('newest entry first', (await rows().first().innerText()).includes('Silver Anklet'));
// ------------------------------------------------------------ search (stock register)
const sbar = page.locator('[data-testid=stock-search]');
const find = async (q) => { await sbar.fill(q); await settle(); return rows().count(); };
check('stock page has a search bar at the top', (await sbar.count()) === 1 && (await sbar.boundingBox()).y < (await page.locator('[data-testid=card-metal]').boundingBox()).y);
check('search: by category (anklet) -> 1 entry', (await find('anklet')) === 1);
check('search: by note (party) -> the IN gold entry (green)', (await find('party')) === 1 && (await rows().first().locator('.stock-amt.in').count()) === 1);
check('search: by note (sold) -> the OUT entry', (await find('sold')) === 1 && (await rows().first().locator('.stock-amt.out').count()) === 1);
check('search: by weight (30.5)', (await find('30.5')) === 1);
check('search: by weight (500.000)', (await find('500.000')) === 1 && (await rows().first().innerText()).includes('Silver Anklet'));
check('search: by tunch (92) -> both gold ring entries', (await find('92')) === 2);
check('search: by metal (gold) -> 2, (silver) -> 1', (await find('gold')) === 2 && (await find('silver')) === 1);
check('search: several words narrow ("gold sold" = 1)', (await find('gold sold')) === 1);
const nowD = new Date(); const pp = (n) => String(n).padStart(2, '0');
check('search: by date (dd/mm/yyyy) -> all 3 made today', (await find(`${pp(nowD.getDate())}/${pp(nowD.getMonth() + 1)}/${nowD.getFullYear()}`)) === 3);
check('search: no match shows a message and the count', (await find('zzzz')) === 0 && (await page.getByText('No entry matches').count()) === 1);
check('search count line', (await find('gold')) === 2 && (await txt('stock-search-count')).includes('2 of 3'));
await page.click('[data-testid=stock-search-clear]'); await settle();
check('clear brings all 3 entries back', (await rows().count()) === 3 && (await sbar.inputValue()) === '');

check('stock by item: Gold Ring – Classic 69.500 g', (await page.locator('[data-testid=stock-item-row]').filter({ hasText: 'Gold Ring' }).innerText()).includes('69.500'));

await page.click('[data-testid=stock-add-out]'); await page.waitForSelector('[data-testid=stock-modal]');
await page.fill('[data-testid=stock-weight]', '500');
check('OUT larger than the stock shows a warning (not a block)', (await page.locator('[data-testid=stock-warn]').count()) === 1);
await page.click('[data-testid=stock-close]'); await page.waitForSelector('[data-testid=stock-modal]', { state: 'detached' });

await page.click('[data-testid=stock-filter-out]');
check('filter OUT shows only the OUT entry', (await rows().count()) === 1 && (await rows().first().locator('.stock-amt.out').count()) === 1);
await page.click('[data-testid=stock-filter-all]');
await page.screenshot({ path: SHOTS + 'web-stock.png', fullPage: true });

// edit keeps the photo
await rows().filter({ hasText: 'Sold' }).locator('.stock-main').click();
await page.waitForSelector('[data-testid=stock-modal]');
await page.fill('[data-testid=stock-weight]', '40');
await page.click('[data-testid=stock-save]'); await page.waitForSelector('[data-testid=stock-modal]', { state: 'detached' });
check('editing updates the totals (100 - 40 = 60)', (await txt('stock-gold-sum-net')) === '60.000 g');

// ------------------------------------------------------------ cash card
await page.click('[data-testid=card-cash]');
await page.waitForSelector('[data-testid=section-cash]'); await settle();
check('Cash card shows the cash register (empty, ₹0)', (await page.locator('[data-testid=card-cash]').getAttribute('aria-selected')) === 'true' && (await flat('cash-balance')) === '₹0' && (await page.getByText('No cash entries yet.').count()) === 1);
await page.click('[data-testid=cash-add-in]'); await page.waitForSelector('[data-testid=cash-modal]');
await page.click('[data-testid=cash-save]');
check('cash entry without amount is refused', (await txt('cash-error')).toLowerCase().includes('amount'));
await page.click('[data-testid=cash-close]'); await page.waitForSelector('[data-testid=cash-modal]', { state: 'detached' });
await addCash('in', 50000, 'Sale – Ramesh');
await addCash('out', 12000, 'Rent');
await addCash('in', 2500, 'Advance');
check('cash: in 52,500, out 12,000, balance ₹40,500', (await flat('cash-balance')) === '₹40,500' && (await flat('cash-in-total')) === '₹52,500' && (await flat('cash-out-total')) === '₹12,000' && (await crows().count()) === 3);
check('Silver / Gold card still shows the metal stock while on Cash', (await txt('stock-gold-sum-net')) === '60.000 g');
await page.waitForSelector('[data-testid=section-cash]');
const cbar = page.locator('[data-testid=stock-search]');
const cfind = async (q) => { await cbar.fill(q); await settle(); return crows().count(); };
check('cash register has its own search (empty, separate from the stock one)', (await cbar.inputValue()) === '' && (await cbar.getAttribute('placeholder')).toLowerCase().includes('cash'));
check('cash search: by amount (50000)', (await cfind('50000')) === 1 && (await crows().first().innerText()).includes('Sale'));
check('cash search: by amount with commas and ₹ (₹12,000)', (await cfind('₹12,000')) === 1 && (await crows().first().innerText()).includes('Rent'));
check('cash search: by note (advance)', (await cfind('advance')) === 1);
check('cash search: by date (today) -> all 3', (await cfind(`${pp(nowD.getDate())}/${pp(nowD.getMonth() + 1)}/${nowD.getFullYear()}`)) === 3);
check('cash search: no match', (await cfind('qqqq')) === 0 && (await page.getByText('No entry matches').count()) === 1);
await page.click('[data-testid=stock-search-clear]'); await settle();
check('cash search cleared: all 3 back', (await crows().count()) === 3);
await page.click('[data-testid=stock-filter-out]');
check('cash filter OUT shows only Rent', (await crows().count()) === 1 && (await crows().first().innerText()).includes('Rent'));
await page.click('[data-testid=stock-filter-all]');
await crows().filter({ hasText: 'Rent' }).locator('.stock-main').click();
await page.waitForSelector('[data-testid=cash-modal]');
await page.fill('[data-testid=cash-amount]', '10000');
await page.click('[data-testid=cash-save]'); await page.waitForSelector('[data-testid=cash-modal]', { state: 'detached' });
check('editing a cash entry updates the balance (₹42,500)', (await flat('cash-balance')) === '₹42,500');
await page.screenshot({ path: SHOTS + 'web-stock-cash.png', fullPage: true });

// ------------------------------------------------------------ persistence
await page.waitForTimeout(300);
await page.reload(); await page.waitForSelector('[data-testid=home-page]'); await settle();
const baseIdx = await idx();
await page.click('[data-testid=tile-stock]'); await page.waitForSelector('[data-testid=stock-page]'); await settle();
check('metal entries, totals and photos survive closing and reopening the app', (await rows().count()) === 3 && (await txt('stock-gold-sum-net')) === '60.000 g' && (await photoCount()) === 2);
await page.waitForFunction(() => document.querySelectorAll('[data-testid=stock-thumb]').length === 2, null, { timeout: 4000 }).catch(() => {});
check('thumbnails load from the phone after restart', (await page.locator('[data-testid=stock-thumb]').count()) === 2 && (await page.locator('[data-testid=stock-thumb]').first().evaluate((i) => i.complete && i.naturalWidth > 0)));
await page.click('[data-testid=card-cash]'); await settle();
check('cash entries survive too', (await crows().count()) === 3 && (await flat('cash-balance')) === '₹42,500');

// ------------------------------------------------------------ deletes
await crows().filter({ hasText: 'Advance' }).locator('[data-testid=cash-delete]').click();
await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
await page.waitForSelector('.sheet', { state: 'detached' });
check('deleting a cash entry asks first, then updates the balance (₹40,000)', (await crows().count()) === 2 && (await flat('cash-balance')) === '₹40,000');
await page.click('[data-testid=card-metal]'); await settle();
await rows().filter({ hasText: 'Silver Anklet' }).locator('[data-testid=stock-delete]').click();
await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
await page.waitForSelector('.sheet', { state: 'detached' });
await page.waitForTimeout(300);
check('deleting a stock entry removes it and its photo from the phone', (await rows().count()) === 2 && (await txt('stock-silver-sum-net')) === '0.000 g' && (await photoCount()) === 1);

// ------------------------------------------------------------ Back: one step at a time
await page.click('[data-testid=stock-add-in]'); await page.waitForSelector('[data-testid=stock-modal]');
await page.click('[data-testid=stock-item]'); await page.waitForSelector('[data-testid=picker-modal]'); await settle();
await page.goBack().catch(() => {}); await settle();
check('Back #1 closes only the category list (entry pop-up stays)', (await page.locator('[data-testid=picker-modal]').count()) === 0 && (await page.locator('[data-testid=stock-modal]').count()) === 1);
await page.goBack().catch(() => {}); await settle();
check('Back #2 closes the entry pop-up (Stock stays)', (await page.locator('[data-testid=stock-modal]').count()) === 0 && (await page.locator('[data-testid=stock-page]').isVisible()));
await page.goBack().catch(() => {}); await settle();
check('Back #3 -> Home, history back where it started', (await page.locator('[data-testid=home-page]').isVisible()) && (await idx()) === baseIdx, `index=${await idx()} base=${baseIdx}`);

await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
