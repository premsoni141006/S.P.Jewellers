// Kashi Jewellers (second shop): its own bill header with both owners, and an uploaded logo.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
const BASE = process.env.SPJ_WEB_URL || 'http://localhost:4173/';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };
const browser = await chromium.launch({ channel: 'chromium' });
const __nc = browser.newContext.bind(browser); // never touch the shop's real cloud
browser.newContext = async (o) => { const c = await __nc(o); await c.addInitScript(() => { try { for (const k of ['spj.cloud.v1', 'kj.cloud.v1']) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ url: '', key: '' })); } catch {} }); return c; };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('spj.signedin.v1')) localStorage.setItem('spj.signedin.v1', JSON.stringify('KJ')); } catch {} });
const page = await ctx.newPage();
await page.goto(BASE); await page.waitForSelector('[data-testid=home-page]');
await page.evaluate(() => {
  const at = '2026-10-05T09:00:00.000Z';
  const bill = { id: 'kb1', number: 1, createdAt: at, updatedAt: at, customerName: 'Ramesh', customerPhone: '', customerLocality: '', pricing: { goldRate: 72000, goldRateUnit: 'per_10g', silverRate: 90000, silverRateUnit: 'per_10g', fineFormula: 'tunch_plus_wastage', gstEnabled: false, gstPercent: 3, roundGrandTotal: true }, items: [{ id: 'i1', description: 'Gold Ring – Classic', metal: 'gold', grossWt: 10, lessWt: 0, tunch: 92, karat: 22, wastage: 0, pcs: 1, labourRate: 0, labourMode: 'fixed', amountOverride: null }], otherCharges: [], printStatus: 'not_printed', printedAt: null, lastPrintError: null };
  localStorage.setItem('kj.history.v1', JSON.stringify([bill]));
});
await page.reload(); await page.waitForSelector('[data-testid=home-page]');
check('Kashi Jewellers home shows its name', (await page.textContent('[data-testid=home-brand]')).trim() === 'KASHI JEWELLERS');
const viewBill = async () => {
  await page.click('[data-testid=tab-history]');
  await page.getByRole('button', { name: 'View' }).first().click();
  const frame = page.frameLocator('[data-testid=preview-frame]');
  await frame.locator('body').waitFor(); await page.waitForTimeout(400);
  return { frame, text: await frame.locator('body').innerText() };
};
let v = await viewBill();
check('the bill carries the shop name, address and both owners with their numbers', ['KASHI JEWELLERS', 'Main Bazar, Bhadra', 'Jaideep Soni', '9782785300', 'Yogesh Soni', '9929288743'].every((t) => v.text.includes(t)), v.text.slice(0, 300));
check('the bill has no Tunch column', !v.text.includes('Tunch'));
check('no S.P. Jewellers logo on the Kashi Jewellers bill', (await v.frame.locator('img.logo').count()) === 0);
await page.getByLabel('Close preview').click();

// upload a logo from Settings
await page.click('[data-testid=tab-home]');
await page.click('[data-testid=open-settings]'); await page.waitForSelector('[data-testid=logo-card]');
const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#b8861a'; g.fillRect(0, 0, 200, 120); g.fillStyle = '#fff'; g.fillRect(60, 30, 80, 60); return c.toDataURL('image/png').split(',')[1]; });
await page.setInputFiles('[data-testid=logo-file]', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await page.waitForSelector('[data-testid=logo-card] img.home-logo');
check('an uploaded logo shows in Settings and is saved with the shop settings', (await page.evaluate(() => JSON.parse(localStorage.getItem('kj.settings.v1')).logoData?.startsWith('data:image'))) === true);
await page.click('[data-testid=bar-back]');
check('the Home screen uses the uploaded logo', (await page.locator('[data-testid=home-page] img.home-logo').count()) === 1);
v = await viewBill();
check('the bill prints the uploaded logo', (await v.frame.locator('img.logo.custom').count()) === 1);
await page.getByLabel('Close preview').click();
await page.click('[data-testid=tab-home]'); await page.click('[data-testid=open-settings]');
await page.click('[data-testid=logo-remove]');
await page.waitForSelector('[data-testid=logo-card] .home-logo.mono');
check('Remove goes back to no logo (monogram)', true);
await browser.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
