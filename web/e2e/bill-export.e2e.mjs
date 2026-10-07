import { launchUnlocked } from './launch.mjs';
// Final bill: zoom (buttons, double-tap, pinch) and save as image / PDF.
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const SHOTS = new URL('../../docs/screenshots/', import.meta.url).pathname;
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + extra}`); };

const mkItem = (i, metal = 'gold') => ({ id: `it${i}`, description: i % 2 ? 'Gold Ring – Classic' : 'Gold Chain – Daily Wear', metal, grossWt: 5 + i / 10, lessWt: 0, tunch: 91.6, wastage: 0, pcs: 1, labourRate: 5, labourMode: 'percent', amountOverride: null });
const mkBill = (number, n) => ({
  id: `bill${number}`, number, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  customerName: 'Ramesh Kumar', customerPhone: '9876543210', customerLocality: 'Gandhi Chowk',
  pricing: { goldRate: 72000, goldRateUnit: 'per_10g', silverRate: 2310, silverRateUnit: 'per_10g', fineFormula: 'tunch_only', gstEnabled: false, gstPercent: 3, roundGrandTotal: true },
  items: Array.from({ length: n }, (_, i) => mkItem(i + 1)), otherCharges: [], printStatus: 'not_printed', printedAt: null, lastPrintError: null,
});

const browser = await launchUnlocked(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
// two saved bills: a short one (E-0001) and a long one (E-0002, 45 items -> more than one A4 page)
await ctx.addInitScript((bills) => { if (!localStorage.getItem('spj.history.v1')) localStorage.setItem('spj.history.v1', JSON.stringify(bills)); }, [mkBill(2, 45), mkBill(1, 3)]);
const page = await ctx.newPage();
page.on('pageerror', (e) => { failed++; console.log('FAIL  page error: ' + e.message); });
await page.goto(BASE);
await page.waitForSelector('[data-testid=home-page]');
const wait = (ms) => page.waitForTimeout(ms);
const level = async () => Number((await page.textContent('[data-testid=zoom-level]')).replace('%', ''));

async function openBill(label) {
  await page.click('[data-testid=tab-history]');
  await page.waitForSelector('[data-testid=history-page]');
  await page.locator('[data-testid=history-row]').filter({ hasText: label }).getByRole('button', { name: 'View' }).click();
  await page.waitForSelector('[data-testid=preview-frame]'); await wait(500);
}
async function closeBill() { await page.getByLabel('Close preview').click(); await page.waitForSelector('[data-testid=preview-screen]', { state: 'detached' }); await page.click('[data-testid=tab-home]'); await page.waitForSelector('[data-testid=home-page]'); }

// ------------------------------------------------------------ zoom
await openBill('8919');
check('preview opens fitted to the screen; has zoom buttons and Save / Share buttons', (await page.locator('[data-testid=zoom-in]').isVisible()) && (await page.locator('[data-testid=share-bill]').isVisible()) && (await page.locator('[data-testid=download-pdf]').isVisible()));
const fit = await level();
check('Fit is disabled while already fitted', await page.locator('[data-testid=zoom-fit]').isDisabled());
await page.click('[data-testid=zoom-in]'); await wait(200);
const l1 = await level();
check('zoom in makes the bill bigger (+25 %)', l1 > fit && Math.abs(l1 / fit - 1.25) < 0.05, `${fit} -> ${l1}`);
await page.click('[data-testid=zoom-in]'); await page.click('[data-testid=zoom-in]'); await wait(200);
check('zoom in again keeps growing', (await level()) > l1);
const body = page.locator('[data-testid=preview-body]');
check('zoomed in, the bill can be scrolled sideways to read the edges', await body.evaluate((el) => el.scrollWidth > el.clientWidth + 20));
await page.click('[data-testid=zoom-out]'); await wait(200);
check('zoom out makes it smaller', (await level()) < Math.round(fit * 1.25 ** 3));
await page.click('[data-testid=zoom-fit]'); await wait(250);
check('Fit returns to the fitted size', (await level()) === fit && (await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)));
for (let i = 0; i < 12; i++) if (await page.locator('[data-testid=zoom-in]').isEnabled()) await page.click('[data-testid=zoom-in]');
check('zoom stops at 4 x the fitted size', Math.abs((await level()) / fit - 4) < 0.1 && (await page.locator('[data-testid=zoom-in]').isDisabled()), `${await level()}`);
await page.click('[data-testid=zoom-fit]'); await wait(250);

// double-tap toggles between fitted and zoomed
const box = await body.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + 160;
await page.touchscreen.tap(cx, cy); await wait(90); await page.touchscreen.tap(cx, cy); await wait(300);
check('double-tap zooms in', (await level()) > fit * 2, `${await level()} vs fit ${fit}`);
await page.touchscreen.tap(cx, cy); await wait(90); await page.touchscreen.tap(cx, cy); await wait(300);
check('double-tap again goes back to fitted', (await level()) === fit, `${await level()}`);

// two-finger pinch (real touch events through the browser's debugging protocol)
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
const y0 = box.y + 200, mx = box.x + box.width / 2;
await touch('touchStart', [[mx - 40, y0], [mx + 40, y0]]); await wait(60);
for (let k = 1; k <= 8; k++) { await touch('touchMove', [[mx - 40 - k * 14, y0], [mx + 40 + k * 14, y0]]); await wait(30); }
await touch('touchEnd', []); await wait(300);
check('pinching out with two fingers zooms in', (await level()) > fit * 1.5, `${await level()} vs fit ${fit}`);
await page.click('[data-testid=zoom-fit]'); await wait(250);
await page.screenshot({ path: SHOTS + 'web-bill-preview.png' });

// ------------------------------------------------------------ save as PDF
const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pdf]')]);
check('Save button downloads Bill-E-0001.pdf', pdfDl.suggestedFilename() === 'Bill-E-0001.pdf', pdfDl.suggestedFilename());
const pdfPath = SHOTS + 'bill-E-0001.pdf';
await pdfDl.saveAs(pdfPath);
const pdf = fs.readFileSync(pdfPath).toString('latin1');
check('it is a valid one-page A4 PDF', pdf.startsWith('%PDF-1.4') && pdf.includes('/Count 1') && pdf.includes('/MediaBox [0 0 595.28 841.89]') && pdf.trimEnd().endsWith('%%EOF') && pdf.length > 20000, `${pdf.length}`);
await closeBill();

// ------------------------------------------------------------ a long bill: several A4 pages, cut between rows
await openBill('7838');
const [longDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pdf]')]);
await longDl.saveAs(SHOTS + 'bill-E-0002.pdf');
const longPdf = fs.readFileSync(SHOTS + 'bill-E-0002.pdf').toString('latin1');
const pages = Number(/\/Count (\d+)/.exec(longPdf)?.[1]);
check('a 45-item bill becomes a PDF of 2 or more A4 pages', pages >= 2, `pages=${pages}`);
const xrefAt = Number(/startxref\n(\d+)/.exec(longPdf)[1]);
const offs = [...longPdf.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
check('the PDF structure is intact (every object where the table says)', offs.length === 2 + 3 * pages && offs.every((o, i) => longPdf.slice(o, o + `${i + 1} 0 obj`.length) === `${i + 1} 0 obj`));
await closeBill();

// ------------------------------------------------------------ inside the app: saved through the phone
const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await nctx.addInitScript((bills) => {
  if (!localStorage.getItem('spj.history.v1')) localStorage.setItem('spj.history.v1', JSON.stringify(bills));
  window.__saved = []; window.__failSave = false;
  window.Capacitor = { isNativePlatform: () => true, Plugins: { SpjPrinter: {
    shareFile: async (o) => { window.__saved.push([o.name, o.mime, o.data.length, o.data.slice(0, 5)]); },
    saveFile: async (o) => { if (window.__failSave) throw { message: 'Could not save the file: no space left.', code: 'SAVE_FAILED' }; window.__saved.push([o.name, o.mime, o.data.length, o.data.slice(0, 5)]); return { location: o.mime.startsWith('image/') ? 'Pictures/SP Jewellers' : 'Downloads/SP Jewellers' }; },
  } } };
}, [mkBill(1, 3)]);
const np = await nctx.newPage();
await np.goto(BASE);
await np.waitForSelector('[data-testid=home-page]');
await np.click('[data-testid=tab-history]');
await np.getByRole('button', { name: 'View' }).first().click();
await np.waitForSelector('[data-testid=preview-frame]');
await np.click('[data-testid=download-pdf]');
await np.waitForFunction(() => window.__saved.length === 1);
await np.click('[data-testid=share-bill]');
await np.waitForFunction(() => window.__saved.length === 2);
const saved = await np.evaluate(() => window.__saved);
check('app: PDF is handed to the phone to save (name, type, PDF data)', saved[0][0] === 'Bill-E-0001.pdf' && saved[0][1] === 'application/pdf' && saved[0][2] > 20000 && saved[0][3] === 'JVBER', JSON.stringify(saved[0]));
check('app: Share opens the phone share sheet with the PDF', saved[1][0] === 'Bill-E-0001.pdf' && saved[1][1] === 'application/pdf' && saved[1][2] > 20000 && saved[1][3] === 'JVBER', JSON.stringify(saved[1]));
await np.evaluate(() => { window.__failSave = true; });
await np.click('[data-testid=download-pdf]');
await np.waitForSelector('[data-testid=download-error]');
check('app: a failed save shows the real reason and the buttons work again', (await np.textContent('[data-testid=download-error]')).includes('no space left') && (await np.locator('[data-testid=download-pdf]').isEnabled()));
await nctx.close();

await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
