import { launchUnlocked } from './launch.mjs';
// Pending | Clear | Nil: Nil writes off what is left (-₹100), the balance comes to 0 and the bill is complete.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

const bill = {
  id: 'b1', number: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  customerName: 'Ramesh Kumar', customerPhone: '9876543210', customerLocality: 'Main Bazar',
  pricing: { goldRate: 72000, goldRateUnit: 'per_10g', silverRate: 2310, silverRateUnit: 'per_10g', fineFormula: 'tunch_only', gstEnabled: false, gstPercent: 3, roundGrandTotal: true },
  items: [{ id: 'i1', description: 'Gold Ring – Classic', metal: 'gold', grossWt: 10, lessWt: 0, tunch: 92, wastage: 0, pcs: 1, labourRate: 12, labourMode: 'percent', amount: 0 }],
  otherCharges: [], printStatus: 'not_printed', printedAt: null, lastPrintError: null, billStatus: 'pending',
  payments: [{ id: 'p1', amount: 74089, at: new Date().toISOString(), mode: 'cash' }],
};

const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((b) => { if (!localStorage.getItem('spj.history.v1')) localStorage.setItem('spj.history.v1', JSON.stringify([b])); }, bill);
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
check('Home lists the customer name, not the order id', (await page.locator('[data-testid=recent-card]').innerText()).includes('Ramesh Kumar'));
await page.click('[data-testid=tab-history]');
await page.locator('[data-testid=history-row]').first().getByRole('button', { name: 'View' }).click();
await page.waitForSelector('[data-testid=preview-frame]');
check('three buttons: Pending | Clear | Nil', (await page.locator('.status-group button').allInnerTexts()).join('|') === 'Pending|Clear|Nil');
check('₹100 is left before Nil', (await page.textContent('[data-testid=pay-left]')).replace(/\s/g, '') === '₹100');
await page.click('[data-testid=mark-nil]');
await page.waitForTimeout(500);
await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(400);
check('Cancel keeps the bill as it was', (await page.locator('[data-testid=mark-nil]').count()) === 1);
await page.click('[data-testid=mark-nil]');
await page.waitForTimeout(500);
await page.getByRole('dialog').getByRole('button', { name: 'Yes, Nil' }).click();
await page.waitForSelector('[data-testid=history-page]');
await page.waitForTimeout(500);
check('History shows the grey Nil dot', (await page.locator('[data-testid=dot-nil]').count()) === 1);
await page.locator('[data-testid=history-row]').first().getByRole('button', { name: 'View' }).click();
await page.waitForSelector('[data-testid=preview-frame]');
await page.waitForTimeout(400);
const html = await page.frameLocator('[data-testid=preview-frame]').locator('body').innerText();
check('the bill shows "Nil (written off)" with −₹100 and a balance of ₹0', html.includes('Nil (written off)') && html.includes('−₹100') && /BALANCE\s*₹0\b/.test(html.replace(/\s+/g, ' ')), html.slice(-300));
check('a Nil bill is final: no Pending / Clear / Nil buttons and no + Payment', (await page.locator('.status-group').count()) === 0 && (await page.locator('[data-testid=pay-add]').count()) === 0);
await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
