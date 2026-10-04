import { launchUnlocked } from './launch.mjs';
// End-to-end check of the website at phone size. Run: npm run build && npx vite preview --port 4173 & node e2e/web.e2e.mjs
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.SPJ_WEB_URL || 'http://localhost:4173/';
const SHOTS = new URL('../../docs/screenshots/', import.meta.url).pathname;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};


// The estimate screen hides the tab bar (like the mockup): the bar's back arrow returns Home, where the tabs are.
async function goHome(pg) {
  const home = pg.locator('[data-testid=tab-home]');
  for (let i = 0; i < 3 && !(await home.isVisible()); i++) await pg.click('[data-testid=bar-back]');
  await home.click();
}
// Bar = Home, +, History. Settings opens from the gear on Home; Printer settings is a row inside Settings.
async function go(pg, name) {
  await goHome(pg);
  if (name === 'home') return;
  if (name === 'history') return void (await pg.click('[data-testid=tab-history]'));
  await pg.click('[data-testid=open-settings]');
  if (name === 'printer') await pg.click('[data-testid=open-printer]');
}

const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
check('app opens on Home with brand', (await page.textContent('[data-testid=home-brand]')) === 'S.P. JEWELLERS' && (await page.getByText('ELNABAAD').count()) === 0);
check('home: no draft card on a fresh install', (await page.locator('[data-testid=continue-draft]').count()) === 0);
check('home: one button per job (no tile repeats a tab)', (await page.locator('.tile').allTextContents()).join('|').match(/^Products.*\|Rates.*\|Shop stock/) !== null && (await page.locator('.tile').count()) === 3 && (await page.getByText(/Customers|Reports|Create Bill/).count()) === 0);
await page.screenshot({ path: SHOTS + 'web-home.png' });
// Rates card -> pop-up with only Silver then Gold, blurred page behind, per gram / per 10 grams
await page.click('[data-testid=tile-rates]');
await page.waitForSelector('[data-testid=rates-modal]');
check('rates pop-up: page behind is blurred', /blur/.test(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=rates-backdrop]')).backdropFilter || getComputedStyle(document.querySelector('[data-testid=rates-backdrop]')).webkitBackdropFilter || '')));
check('rates pop-up: only Silver then Gold', (await page.locator('[data-testid=rates-modal] h3').allTextContents()).join(',') === 'Silver,Gold' && (await page.locator('[data-testid=rates-modal] input').count()) === 2);
await page.screenshot({ path: SHOTS + 'web-rates.png' });
check('rates are fixed per 10 grams: no unit switch, existing 231/g shows as 2310 and 7200/g as 72000', (await page.locator('[data-testid=rates-modal] .seg').count()) === 0 && (await page.inputValue('[data-testid=silver-input]')) === '2310' && (await page.inputValue('[data-testid=gold-input]')) === '72000' && (await page.locator('[data-testid=rates-modal]').innerText()).includes('per 10 grams') && !(await page.locator('[data-testid=rates-modal]').innerText()).includes('Per gram'));
await page.fill('[data-testid=gold-input]', '73000');
await page.click('[data-testid=rates-save]');
await page.waitForSelector('[data-testid=rates-modal]', { state: 'detached' });
await page.click('[data-testid=tile-rates]');
check('rates are remembered', (await page.inputValue('[data-testid=gold-input]')) === '73000' && (await page.inputValue('[data-testid=silver-input]')) === '2310');
// put the demo rates back (72000 / 10 g) for the calculations below
await page.fill('[data-testid=gold-input]', '72000');
await page.click('[data-testid=rates-save]');
await page.waitForSelector('[data-testid=rates-modal]', { state: 'detached' });
await page.click('[data-testid=tile-rates]');
check('gold back to 72000 per 10 g', (await page.inputValue('[data-testid=gold-input]')) === '72000');
await page.click('[data-testid=rates-close]');
await page.waitForSelector('[data-testid=rates-modal]', { state: 'detached' });
check('rates pop-up closes', (await page.locator('[data-testid=rates-modal]').count()) === 0);

await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
// New estimate: customer first (name, then phone + address on the 2nd row), no "unsaved" card, no items, no totals bar
{
  const box = async (id) => page.locator(`[data-testid=${id}]`).boundingBox();
  const [n, ph, ad] = [await box('customer-name'), await box('customer-phone'), await box('customer-locality')];
  check('estimate page starts with Customer name; phone and address share the 2nd row', ph.y > n.y + 20 && Math.abs(ph.y - ad.y) < 4 && ad.x > ph.x);
  const first = await page.evaluate(() => document.querySelector('[data-testid=estimate-page]').firstElementChild?.getAttribute('data-testid'));
  check('no estimate-number / unsaved card at the top', first === 'customer-card' && (await page.locator('[data-testid=est-no], [data-testid=est-state], [data-testid=new]').count()) === 0);
  check('address field is labelled Address', (await page.locator('[data-testid=customer-card]').innerText()).includes('Address') && !(await page.locator('[data-testid=customer-card]').innerText()).includes('Locality'));
  check('empty estimate: no items, no totals bar, no rate card, just Add item', (await page.locator('[data-testid=item-card]').count()) === 0 && (await page.locator('[data-testid=totals]').count()) === 0 && (await page.locator('[data-testid=gold-rate]').count()) === 0 && (await page.locator('[data-testid=add-item]').isVisible()));
  await page.screenshot({ path: SHOTS + 'web-estimate-empty.png' });
}

const cards = page.locator('[data-testid=item-card]');
const card = (i) => cards.nth(i);
// Description is chosen from the saved items in a pop-up (free typing is gone).
async function choose(pg, cardLoc, name) {
  await cardLoc.locator('[data-testid=desc]').click();
  await pg.locator('[data-testid=pick-option]').filter({ hasText: name }).first().click();
  await pg.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
}
const descOf = (cardLoc) => cardLoc.locator('[data-testid=desc]').getAttribute('data-value');
async function fillItem(i, desc, gross, less = '') {
  if ((await cards.count()) <= i) {
    // "Add item" opens the item picker straight away
    await page.click('[data-testid=add-item]');
    await page.locator('[data-testid=pick-option]').filter({ hasText: desc }).first().click();
    await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
  } else await choose(page, card(i), desc);
  await card(i).locator('[data-testid=gross]').fill(String(gross));
  if (less !== '') await card(i).locator('[data-testid=less]').fill(String(less));
}

// 1 product: picking a product name fills tunch / making charge from the product list
await fillItem(0, 'Silver Anklet – Traditional', 82.4, 2.4);
await card(0).locator('[data-testid=pcs]').fill('2');
check('picking a saved item does not pre-fill the making charge', (await card(0).locator('[data-testid=labour]').inputValue()) === '');
await card(0).locator('[data-testid=labour]').fill('900');
check('product fills tunch; no pieces/pair option anywhere', (await card(0).locator('[data-testid=tunch]').inputValue()) === '100' && (await page.locator('[data-testid=pcs-unit]').count()) === 0 && (await page.getByText(/^(pc|pair|Pieces|Pairs)$/).count()) === 0);
check('net weight = 82.4 - 2.4', (await card(0).locator('[data-testid=net]').textContent()) === '80.000');
// pure metal = 80 × 100% = 80 (no wastage); amount = 80 × 231/g + 900 fixed making charge = 18480 + 900
{
  const b = async (id) => card(0).locator(`[data-testid=${id}]`).boundingBox();
  const [d, t, g, l, n, pc, mk] = [await b('desc'), await b('tunch'), await b('gross'), await b('less'), await b('net'), await b('pcs'), await b('labour')];
  const sameRow = (...xs) => xs.every((x) => Math.abs(x.y - xs[0].y) < 6);
  check('item card row 1: Description and Tunch together', sameRow(d, t) && t.x > d.x);
  check('item card row 2: G. Wt., Less Wt., Net Wt. together, below row 1', sameRow(g, l, n) && g.y > d.y + 20);
  check('item card row 3: pieces and total making charge together, below row 2', sameRow(pc, mk) && pc.y > g.y + 20);
  check('item card has no Silver / Fine wt. lines', (await card(0).locator('[data-testid=silver], [data-testid=fine]').count()) === 0);
  check('item amount is read-only (no edit button, no manual-amount field)', (await card(0).locator('[data-testid=amount-override]').count()) === 0 && (await card(0).getByText(/Edit amount|Use calculated/).count()) === 0 && (await card(0).locator('input[data-testid=amount], [data-testid=amount] input').count()) === 0);
}
const amt1 = (await card(0).locator('[data-testid=amount]').textContent())?.replace(/\s/g, '');
check('amount calculated', amt1 === '₹19,380', amt1);
check('grand total rounded', (await page.textContent('[data-testid=grand-total]'))?.replace(/\s/g, '') === '₹19,380');
await page.screenshot({ path: SHOTS + 'web-estimate.png' });

// 10 products
const names = ['Gold Ring – Classic', 'Gold Chain – Daily Wear', 'Gold Earrings – Floral', 'Gold Bracelet – Designer', 'Silver Ring – Plain', 'Silver Anklet – Traditional', 'Gold Ring – Classic', 'Silver Ring – Plain', 'Gold Chain – Daily Wear'];
for (let i = 0; i < names.length; i++) {
  await fillItem(i + 1, names[i], (3.5 + i).toFixed(3));
}
check('10 items', (await cards.count()) === 10);

// edit
await card(1).locator('[data-testid=less]').fill('0.5');
await card(1).locator('[data-testid=net]').filter({ hasText: '3.000' }).waitFor({ timeout: 3000 }).catch(() => {});
{ const net = await card(1).locator('[data-testid=net]').textContent(); check('edit recalculates net', net === '3.000', `net=${net} gross=${await card(1).locator('[data-testid=gross]').inputValue()} less=${await card(1).locator('[data-testid=less]').inputValue()}`); }


// delete (with confirm sheet)
await card(2).locator('[data-testid=delete]').click();
await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
await page.waitForSelector('.sheet', { state: 'detached' });
check('delete item', (await cards.count()) === 9);
// duplicate
await card(0).locator('[data-testid=duplicate]').click();
check('duplicate item', (await cards.count()) === 10 && (await descOf(card(1))) === 'Silver Anklet – Traditional');

// preview (from History after saving) has the nine columns
await page.click('[data-testid=preview]');
const frame = page.frameLocator('[data-testid=preview-frame]');
await frame.locator('th').first().waitFor();
const ths = await frame.locator('th').allTextContents();
check('preview has exactly the 9 columns (no Wstg; Making; one Silver/Gold column)', JSON.stringify(ths) === JSON.stringify(['Description', 'G. Wt.', 'Less Wt.', 'Net Wt.', 'Tunch', 'Pcs', 'Making', 'Silver/Gold', 'Amount']), ths.join('|'));
check('preview header', (await frame.locator('.shop').textContent()) === 'S.P. JEWELLERS' && (await frame.locator('.code').count()) === 0 && !(await frame.locator('body').textContent()).includes('ELNABAAD'));
const descs = (await frame.locator('td.d').allTextContents()).filter((t) => t.trim());
check('preview item rows', descs.length === 10, String(descs.length));
await page.screenshot({ path: SHOTS + 'web-preview.png' });
await page.getByLabel('Close preview').click();
await page.waitForSelector('[data-testid=estimate-page]');

// save

// draft auto-save survives reload
check('customer fields are always visible (no collapsed card)', (await page.locator('[aria-expanded]').count()) === 0 && (await page.locator('[data-testid=customer-name]').isVisible()) && (await page.locator('[data-testid=customer-phone]').isVisible()) && (await page.locator('[data-testid=customer-locality]').isVisible()));
await page.fill('[data-testid=customer-name]', 'Ramesh Kumar');
await page.fill('[data-testid=customer-phone]', '98765 43210');
await page.fill('[data-testid=customer-locality]', 'Gandhi Chowk');
await page.waitForTimeout(700);
await page.reload();
await page.waitForSelector('[data-testid=home-page]');
check('home has no big draft card', (await page.locator('[data-testid=continue-draft], [data-testid=create-estimate], .big-card').count()) === 0);
await page.click('[data-testid=tab-history]');
check('the unsaved estimate is listed in History as a draft after a reload', (await page.locator('[data-testid=draft-row]').count()) === 1);
await page.click('[data-testid=draft-continue]');
await page.waitForSelector('[data-testid=estimate-page]');
check('reload keeps estimate', (await cards.count()) === 10);
check('reload keeps unsaved draft edit', (await page.locator('[data-testid=customer-name]').count()) === 1 && (await page.inputValue('[data-testid=customer-name]')) === 'Ramesh Kumar' && (await page.inputValue('[data-testid=customer-phone]')) === '98765 43210' && (await page.inputValue('[data-testid=customer-locality]')) === 'Gandhi Chowk');
await page.click('[data-testid=save]');
await page.waitForSelector('[data-testid=preview-screen]');
check('Save opens the final bill preview automatically', await page.locator('[data-testid=preview-screen]').isVisible());
check('save assigns E-0001', (await page.textContent('[data-testid=toast]')).includes('E-0001'));
await page.getByLabel('Close preview').click();
await page.waitForSelector('[data-testid=history-page]');

// history + reopen
await go(page, 'history');
check('history row', (await page.locator('[data-testid=history-row]').count()) === 1 && (await page.locator('[data-testid=history-row]').textContent()).includes('Ramesh Kumar'));
check('saved estimate has no dot until Pending / Clear is chosen, and no draft row', (await page.locator('[data-testid=dot-done], [data-testid=dot-pending]').count()) === 0 && (await page.locator('[data-testid=draft-row]').count()) === 0);
check('saved bills in History cannot be opened for editing or deleted', (await page.getByRole('button', { name: 'Open', exact: true }).count()) === 0 && (await page.getByRole('button', { name: 'Delete', exact: true }).count()) === 0);
await page.getByRole('button', { name: 'View' }).first().click();
await page.click('[data-testid=mark-clear]');
await page.waitForSelector('[data-testid=preview-screen]', { state: 'detached' });
await go(page, 'history');
check('Clear shows a green dot', (await page.locator('[data-testid=dot-done]').count()) === 1);
await page.fill('[data-testid=history-search]', 'pending');
check('History search: "pending" finds nothing yet', (await page.locator('[data-testid=history-row]').count()) === 0);
await page.fill('[data-testid=history-search]', 'clear');
check('History search: "clear" finds the bill', (await page.locator('[data-testid=history-row]').count()) === 1);
await page.fill('[data-testid=history-search]', '');
await page.screenshot({ path: SHOTS + 'web-history.png' });
await page.click('[data-testid=fab-new]');
check('new estimate starts empty', (await cards.count()) === 0);
// an empty new estimate is not a draft
await go(page, 'history');
check('empty new estimate is not listed as a draft', (await page.locator('[data-testid=draft-row]').count()) === 0);
// add a product, go back: it shows in History as a draft with a red dot
await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
await fillItem(0, 'Gold Ring – Classic', 5);
await page.click('[data-testid=bar-back]');
await page.click('[data-testid=tab-history]');
check('draft shows in History with a red dot', (await page.locator('[data-testid=draft-row] .dot-draft').count()) === 1 && (await page.locator('[data-testid=draft-row]').textContent()).includes('Draft'));
check('saved estimate still has its green dot next to the draft', (await page.locator('[data-testid=history-row] .dot-done').count()) === 1);
await page.click('[data-testid=draft-continue]');
await page.waitForSelector('[data-testid=estimate-page]');
check('Continue opens the draft with its product', (await descOf(card(0))) === 'Gold Ring – Classic');
// "+" while a draft is open: no pop-up, the draft is kept in History
await page.click('[data-testid=bar-back]');
await page.click('[data-testid=tab-history]');
await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
check('+ starts a fresh estimate with no pop-up', (await page.getByText('Unsaved estimate').count()) === 0 && (await cards.count()) === 0);
await page.click('[data-testid=bar-back]');
await page.click('[data-testid=tab-history]');
check('the earlier draft is still in History after pressing +', (await page.locator('[data-testid=draft-row]').count()) === 1);
await page.click('[data-testid=draft-discard]');
await page.getByRole('button', { name: 'Discard' }).last().click();
await page.waitForSelector('.sheet', { state: 'detached' });
check('discarding removes the draft', (await page.locator('[data-testid=draft-row]').count()) === 0);
await go(page, 'history');
// validation before print
await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
await page.click('[data-testid=add-item]');
await page.click('[data-testid=picker-close]');
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
await page.click('[data-testid=save]');
check('save validates (blank item is refused with the reason)', (await page.locator('[data-testid=issues]').count()) === 1);
await page.getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('.sheet', { state: 'detached' });

// thermal mode without a chosen printer -> real reason + retry
await go(page, 'printer');
await page.screenshot({ path: SHOTS + 'web-printer.png' });
await page.click('[data-testid=mode-thermal]');
await page.click('[data-testid=test-print]');
await page.waitForSelector('[data-testid=print-error]');
const reason = await page.textContent('[data-testid=print-error]');
check('thermal failure shows reason', !!reason && reason.length > 10, reason);
check('retry offered', (await page.getByRole('button', { name: 'Retry' }).count()) === 1);
await page.getByRole('button', { name: 'Close' }).click();
await page.waitForSelector('.sheet', { state: 'detached' });
await page.screenshot({ path: SHOTS + 'web-printer-thermal.png' });
await page.click('[data-testid=mode-system]');

// system print: the dialog cannot be shown headless; stub print() inside the iframe to confirm the hand-off
await page.evaluate(() => {
  const orig = HTMLIFrameElement.prototype.appendChild;
  void orig;
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get() {
      const w = desc.get.call(this);
      if (w && !w.__stubbed) { w.__stubbed = true; w.print = () => { window.__printedHtml = this.contentDocument.documentElement.outerHTML; }; }
      return w;
    },
  });
});
await go(page, 'history');
await page.locator('[data-testid=reprint]').first().click();
await page.waitForFunction(() => /print dialog/i.test(document.querySelector('[data-testid=toast]')?.textContent || ''));
const printed = await page.evaluate(() => window.__printedHtml || '');
check('reprint sends A4 document to print dialog', !printed.includes('ELNABAAD') && printed.includes('S.P. JEWELLERS') && printed.includes('ESTIMATE') && printed.includes('Sandeep Soni') && printed.includes('M.: 94166 25950') && printed.includes('Main Bazar, Near Gandhi Chowk, Ellenabad-125102') && printed.includes('Customer: <b>Ramesh Kumar</b>') && printed.includes('Bill No.: <b>E-0001</b>') && printed.includes('Silver/Gold'));
check('history shows printed', (await page.locator('[data-testid=history-row]').first().textContent()).includes('Printed'));

// settings
await go(page, 'settings');
await page.screenshot({ path: SHOTS + 'web-settings.png', fullPage: true });
{
  const t = await page.locator('[data-testid=settings-page]').innerText();
  const titles = await page.locator('[data-testid=settings-page] .section-title').allTextContents();
  check('Settings no longer has the Rates and pricing or Products cards (they are on Home)', titles.join(',') === 'Shop,GST,Password' && !t.includes('Default gold rate') && (await page.locator('[data-testid=product]').count()) === 0, titles.join(','));
  check('Settings keeps Printer settings, Shop, and the GST switch', t.includes('Printer settings') && t.includes('Shop') && t.includes('Charge GST'));
}

// Description picker pop-up: blurred page, all saved items, "+" last, new items only via Settings
await page.click('[data-testid=fab-new]');
await page.waitForSelector('[data-testid=estimate-page]');
await page.click('[data-testid=add-item]');
await page.waitForSelector('[data-testid=picker-modal]');
check('Add item opens the item picker straight away', true);
check('item picker: page behind is blurred', /blur/.test(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=picker-backdrop]')).backdropFilter || '')));
const optionNames = await page.locator('[data-testid=pick-option] .pick-name').allTextContents();
check('no wastage / Wstg field anywhere on the item card or in the products pop-up', (await page.locator('[data-testid=wstg], [data-testid=prod-wstg]').count()) === 0 && !(await page.locator('body').innerText()).includes('Wstg'));
check('item picker lists all six saved items', optionNames.length === 6 && optionNames.includes('Gold Ring – Classic') && optionNames.includes('Silver Ring – Plain'));
check('item picker: "+" is the last row', (await page.locator('.pick-list li').last().locator('[data-testid=pick-add]').count()) === 1);
await page.screenshot({ path: SHOTS + 'web-picker.png' });
await page.locator('[data-testid=pick-option]').filter({ hasText: 'Gold Earrings – Floral' }).click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
await page.waitForFunction(() => document.querySelector('[data-testid=item-card] [data-testid=tunch]')?.value === '100', null, { timeout: 3000 }).catch(() => {});
{ const d = await descOf(card(0)); const t = await card(0).locator('[data-testid=tunch]').inputValue(); check('choosing an item fills its details', d === 'Gold Earrings – Floral' && t === '100', `desc=${d} tunch=${t}`); }
// metal is chosen on the item; picking a product must not change it
await card(0).getByRole('button', { name: 'Gold', exact: true }).click();
await page.locator('[data-testid=desc]').first().click();
await page.locator('[data-testid=pick-option]').filter({ hasText: 'Silver Ring – Plain' }).click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
check('picking a product keeps the metal chosen on the item', (await card(0).getByRole('button', { name: 'Gold', exact: true }).getAttribute('aria-pressed')) === 'true');
// making charge: Gold = percentage of gold value, Silver = rupees typed directly
check('Gold item asks for the making charge as a percentage', (await card(0).innerText()).includes('Making charge (%)') && !(await card(0).innerText()).includes('Making charge (₹)'));
await card(0).locator('[data-testid=gross]').fill('10');
await card(0).locator('[data-testid=labour]').fill('5');
await card(0).locator('[data-testid=amount]').filter({ hasText: '69,552' }).waitFor({ timeout: 3000 }).catch(() => {});
{ const a = (await card(0).locator('[data-testid=amount]').textContent())?.replace(/\s/g, ''); check('Gold 10 g, 92 % (gold default tunch), rate 72,000 per 10 g, making 5 % -> item amount ₹69,552', a === '₹69,552', a); }
check('Gold shows the making charge in rupees under the field', (await card(0).locator('[data-testid=making-note]').innerText()).includes('3,312'));
const amountText = async () => (await card(0).locator('[data-testid=amount]').textContent())?.replace(/\s/g, '');
const lab = () => card(0).locator('[data-testid=labour]');
const settleField = (v) => lab().evaluate((el, want) => new Promise((r) => { const t = Date.now(); const f = () => (el.value === want || Date.now() - t > 2000 ? r() : requestAnimationFrame(f)); f(); }), v);
check('Gold starts as %, with the switch showing % selected', (await card(0).locator('[data-testid=making-pct]').getAttribute('aria-pressed')) === 'true');
await card(0).locator('[data-testid=making-amt]').click();
await settleField('3312');
check('Gold: switching to ₹ shows the same charge as rupees (3312) and the amount does not change', (await card(0).innerText()).includes('Making charge (₹)') && (await lab().inputValue()) === '3312' && (await amountText()) === '₹69,552', `${await lab().inputValue()} ${await amountText()}`);
await card(0).locator('[data-testid=making-pct]').click();
await settleField('5');
check('Gold: switching back to % returns 5 and the amount does not change', (await card(0).innerText()).includes('Making charge (%)') && Number(await lab().inputValue()) === 5 && (await amountText()) === '₹69,552', `${await lab().inputValue()} ${await amountText()}`);
await card(0).getByRole('button', { name: 'Silver', exact: true }).click();
await card(0).locator('[data-testid=labour]').evaluate((el) => new Promise((r) => { const t = Date.now(); const f = () => (el.value === '' || Date.now() - t > 2000 ? r() : requestAnimationFrame(f)); f(); }));
check('switching to Silver changes the field to rupees and clears the number', (await card(0).innerText()).includes('Making charge (₹)') && (await card(0).locator('[data-testid=labour]').inputValue()) === '');
check('Silver starts as ₹ amount, with the switch showing ₹ selected', (await card(0).locator('[data-testid=making-amt]').getAttribute('aria-pressed')) === 'true');
await lab().fill('10');
await card(0).locator('[data-testid=making-pct]').click();
await settleField('0');
await card(0).locator('[data-testid=labour]').fill('10');
await card(0).locator('[data-testid=amount]').filter({ hasText: '2,541' }).waitFor({ timeout: 3000 }).catch(() => {});
check('Silver can use %: 10 % of silver value (9.25 g x 231) -> amount ₹2,541 and the note says silver', (await amountText()) === '₹2,541' && (await card(0).locator('[data-testid=making-note]').innerText()).toLowerCase().includes('silver value'), `${await amountText()}`);
await card(0).locator('[data-testid=making-amt]').click();
await card(0).getByRole('button', { name: 'Gold', exact: true }).click();
await page.locator('[data-testid=desc]').first().click();
await page.locator('[data-testid=pick-option]').filter({ hasText: 'Gold Earrings – Floral' }).click();
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
// "+" in the picker opens the Products pop-up right here (blank new-item form); closing brings the picker back
await page.locator('[data-testid=desc]').first().click();
await page.click('[data-testid=pick-add]');
await page.waitForSelector('[data-testid=prod-name]');
check('"+" opens the Products pop-up with a blank new-item form (no Settings trip)', (await page.locator('[data-testid=settings-page]').count()) === 0 && (await page.inputValue('[data-testid=prod-name]')) === '');
await page.click('[data-testid=prod-save]');
check('an item without a name is refused', (await page.locator('[data-testid=prod-error]').count()) === 1);
check('Products form no longer asks for a making charge', (await page.locator('[data-testid=prod-labour]').count()) === 0 && !(await page.locator('[data-testid=products-modal]').innerText()).toLowerCase().includes('making'));
await page.fill('[data-testid=prod-name]', 'Gold Bangle – Plain');
check('products form has no Gold/Silver buttons (metal is chosen on the item)', (await page.locator('[data-testid=prod-gold], [data-testid=prod-silver]').count()) === 0);
await page.fill('[data-testid=prod-tunch]', '91.6');
await page.click('[data-testid=prod-save]');
check('saved item shows in the pop-up list', (await page.locator('[data-testid=prod-item]').filter({ hasText: 'Gold Bangle – Plain' }).count()) === 1);
await page.click('[data-testid=products-close]');
await page.waitForSelector('[data-testid=picker-modal]');
check('closing the Products pop-up brings the picker back, with the new item and "+" last', (await page.locator('[data-testid=pick-option]').filter({ hasText: 'Gold Bangle – Plain' }).count()) === 1 && (await page.locator('.pick-list li').last().locator('[data-testid=pick-add]').count()) === 1);
await page.click('[data-testid=picker-close]');
await page.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
check('estimate untouched by adding an item', (await descOf(card(0))) === 'Gold Earrings – Floral');

// Home -> Products card: same kind of pop-up; delete / add / edit right there
await go(page, 'home');
await page.click('[data-testid=tile-products]');
await page.waitForSelector('[data-testid=products-modal]');
check('products pop-up: page behind is blurred', /blur/.test(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=products-backdrop]')).backdropFilter || '')));
check('products pop-up lists all saved products (7 now)', (await page.locator('[data-testid=prod-item]').count()) === 7);
await page.screenshot({ path: SHOTS + 'web-products.png' });
await page.locator('[data-testid=prod-item]').filter({ hasText: 'Gold Bangle – Plain' }).locator('[data-testid=prod-edit]').click();
await page.fill('[data-testid=prod-tunch]', '90');
await page.click('[data-testid=prod-save]');
check('editing a product keeps it in the list', (await page.locator('[data-testid=prod-item]').filter({ hasText: 'Gold Bangle – Plain' }).textContent()).includes('Tunch 90%'));
await page.locator('[data-testid=prod-item]').filter({ hasText: 'Gold Bangle – Plain' }).locator('[data-testid=prod-delete]').click();
await page.click('[data-testid=prod-delete-yes]');
check('delete asks first, then removes the product', (await page.locator('[data-testid=prod-item]').count()) === 6 && (await page.locator('[data-testid=prod-item]').filter({ hasText: 'Gold Bangle' }).count()) === 0);
await page.click('[data-testid=prod-add]');
await page.fill('[data-testid=prod-name]', 'Silver Chain – Light');
await page.click('[data-testid=prod-save]');
check('add from Home pop-up', (await page.locator('[data-testid=prod-item]').count()) === 7);
await page.locator('[data-testid=prod-item]').filter({ hasText: 'Silver Chain – Light' }).locator('[data-testid=prod-delete]').click();
await page.click('[data-testid=prod-delete-yes]');
await page.click('[data-testid=products-close]');
await page.waitForSelector('[data-testid=products-modal]', { state: 'detached' });
check('products pop-up closes', (await page.locator('[data-testid=products-modal]').count()) === 0);

// no sideways scrolling at 360 px
await page.setViewportSize({ width: 360, height: 760 });
for (const t of ['home', 'history', 'settings', 'printer']) {
  await go(page, t);
  // The page is shown at 90% scale, so a 360 px phone has a 400 px wide layout: compare with the real viewport.
  const [w, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(`no horizontal overflow at 360px (${t})`, w <= vw + 1, `${w} vs ${vw}`);
}
await go(page, 'history');
const [w, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
check('no overflow on History at 360px', w <= vw + 1, `${w} vs ${vw}`);

// ---- Android app path (window.Capacitor + SpjPrinter plugin mocked) ----
{
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await nctx.addInitScript(() => {
    window.__calls = [];
    let escFails = 1;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SpjPrinter: {
          printHtml: async (o) => { window.__calls.push(['printHtml', o.jobName, o.html.length]); return { state: window.__htmlState || 'completed' }; },
          bluetoothStatus: async () => ({ supported: true, enabled: true, permission: 'granted' }),
          listPairedPrinters: async () => ({ devices: [
            { name: 'Galaxy Buds', address: '11:22:33:44:55:66', isPrinter: false, isClassic: true },
            { name: 'MTP-II', address: 'AA:BB:CC:DD:EE:FF', isPrinter: true, isClassic: true },
          ] }),
          printEscPos: async (o) => {
            window.__calls.push(['printEscPos', o.address, atob(o.data).length]);
            if (escFails-- > 0) throw { message: 'Could not reach MTP-II. Switch it on and keep it near the phone.', code: 'UNREACHABLE' };
            return { bytes: atob(o.data).length };
          },
          openBluetoothSettings: async () => { window.__calls.push(['openBluetoothSettings']); },
        },
      },
    };
  });
  const np = await nctx.newPage();
  np.on('pageerror', (e) => errors.push('native: ' + e.message));
  await np.goto(BASE);
  await np.click('[data-testid=fab-new]');
  await np.waitForSelector('[data-testid=estimate-page]');
  await np.click('[data-testid=add-item]');
  await np.locator('[data-testid=pick-option]').filter({ hasText: 'Silver Ring – Plain' }).first().click();
  await np.waitForSelector('[data-testid=picker-modal]', { state: 'detached' });
  await np.locator('[data-testid=gross]').fill('7.8');
  // save the bill, then print it from History -> View
  await np.click('[data-testid=save]');
  await np.waitForSelector('[data-testid=preview-screen]');
  await np.getByLabel('Close preview').click();
  await np.waitForSelector('[data-testid=history-page]');
  await np.getByRole('button', { name: 'View' }).first().click();
  await np.click('[data-testid=preview-print]');
  await np.waitForFunction(() => /printed successfully/i.test(document.querySelector('[data-testid=toast]')?.textContent || ''));
  check('native: A4 print goes through printHtml', (await np.evaluate(() => window.__calls[0]?.[0])) === 'printHtml');
  check('native: no service worker in app', (await np.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() ?? []).length)) === 0);

  await np.evaluate(() => { window.__htmlState = 'cancelled'; });
  if (!(await np.locator('[data-testid=preview-frame]').count())) await np.getByRole('button', { name: 'View' }).first().click();
  await np.click('[data-testid=preview-print]');
  await np.waitForFunction(() => /cancelled/i.test(document.querySelector('[data-testid=toast]')?.textContent || ''));
  check('native: cancelled is not an error', (await np.locator('[data-testid=print-error]').count()) === 0);

  await go(np, 'printer');
  await np.click('[data-testid=mode-thermal]');
  await np.waitForSelector('[data-testid=native-thermal] .device');
  const first = await np.locator('.device-name').first().textContent();
  check('native: paired printers listed, printers first', first === 'MTP-II', first);
  check('native: browser-only note hidden', (await np.getByText('A website cannot pick the printer').count()) === 0);
  await np.locator('.device').first().click();
  await np.screenshot({ path: SHOTS + 'web-app-printer.png' });
  await np.click('[data-testid=test-print]');
  await np.waitForSelector('[data-testid=print-error]');
  check('native: thermal failure shows plugin message', (await np.textContent('[data-testid=print-error]')).includes('Could not reach MTP-II'));
  await np.getByRole('button', { name: 'Retry' }).click();
  await np.waitForSelector('.sheet', { state: 'detached' });
  await np.waitForFunction(() => /printed successfully/i.test(document.querySelector('[data-testid=toast]')?.textContent || ''));
  const esc = await np.evaluate(() => window.__calls.filter((c) => c[0] === 'printEscPos'));
  check('native: retry prints ESC/POS to chosen address', esc.length === 2 && esc[1][1] === 'AA:BB:CC:DD:EE:FF' && esc[1][2] > 20);
  await nctx.close();
}

check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
