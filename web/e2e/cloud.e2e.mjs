// Two "devices" (separate browser profiles) share one cloud: a real Worker with a local R2, started here.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../desktop/node_modules/playwright/index.mjs';
import { launchUnlocked } from './launch.mjs';

const BASE = process.env.SPJ_WEB_URL || 'http://localhost:4173/';
const PORT = 8789;
const CLOUD = `http://localhost:${PORT}`;
const KEY = 'test-cloud-key';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); };

const store = fs.mkdtempSync(path.join(os.tmpdir(), 'spj-r2-'));
const worker = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--var', `SYNC_TOKEN:${KEY}`, '--persist-to', store], { cwd: new URL('../../cloud/', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('worker did not start')), 60000);
  const on = (d) => { if (String(d).includes('Ready on')) { clearTimeout(t); resolve(); } };
  worker.stdout.on('data', on); worker.stderr.on('data', on);
});
const stop = () => { worker.kill('SIGTERM'); };
process.on('exit', stop);

const browser = await launchUnlocked(chromium);
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(BASE);
  await page.waitForSelector('[data-testid=home-page]');
  return page;
};
const connect = async (page, url = CLOUD, key = KEY) => {
  if (!(await page.locator('[data-testid=cloud-card]').count())) await page.click('[data-testid=open-settings]');
  await page.waitForSelector('[data-testid=cloud-card]');
  await page.fill('[data-testid=cloud-url]', url);
  await page.fill('[data-testid=cloud-key]', key);
  await page.click('[data-testid=cloud-connect]');
  await page.waitForFunction(() => /In sync|Could not|not correct|answered/.test(document.querySelector('[data-testid=cloud-status]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  return (await page.textContent('[data-testid=cloud-status]')).trim();
};
const ls = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const mkBill = (id, number, createdAt) => ({ id, number, createdAt, updatedAt: createdAt, customerName: id, customerPhone: '', customerLocality: '', pricing: { goldRate: 72000, goldRateUnit: 'per_10g', silverRate: 90000, silverRateUnit: 'per_10g', fineFormula: 'tunch_plus_wastage', gstEnabled: false, gstPercent: 3, roundGrandTotal: true }, items: [], otherCharges: [], printStatus: 'not_printed', printedAt: null, lastPrintError: null });

// ---- device A has data (a bill, stock with a photo, cash)
const A = await open();
await A.evaluate(async (bill) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('spj-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
  await new Promise((res) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').put(blob, 'photo-A1'); t.oncomplete = res; });
  localStorage.setItem('spj.history.v1', JSON.stringify([bill]));
  localStorage.setItem('spj.nextNo.v1', '2');
  localStorage.setItem('spj.stock.v1', JSON.stringify([{ id: 'sA1', date: '2026-10-01', type: 'in', metal: 'gold', item: 'Gold Ring – Classic', tunch: 92, weight: 5.5, pcs: 1, note: '', photoId: 'photo-A1', createdAt: '2026-10-01T10:00:00Z' }]));
  localStorage.setItem('spj.cash.v1', JSON.stringify([{ id: 'cA1', date: '2026-10-01', type: 'in', amount: 1000, note: 'A', createdAt: '2026-10-01T10:00:00Z' }]));
}, mkBill('billA', 1, '2026-10-01T10:00:00Z'));
await A.reload(); await A.waitForSelector('[data-testid=home-page]');
check('wrong key is refused with a clear message', (await connect(A, CLOUD, 'wrong-key')).includes('not correct'));
check('device A connects and syncs', (await connect(A)).startsWith('In sync'));

// ---- device B is empty and connects to the same cloud
const B = await open();
check('device B connects', (await connect(B)).startsWith('In sync'));
check('B received A\'s bill, stock and cash', (await ls(B, 'spj.history.v1'))?.length === 1 && (await ls(B, 'spj.stock.v1'))?.length === 1 && (await ls(B, 'spj.cash.v1'))?.length === 1);
check('B received the photo too', await B.evaluate(async () => { const db = await new Promise((res, rej) => { const r = indexedDB.open('spj-photos', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return new Promise((res) => { const q = db.transaction('photos').objectStore('photos').get('photo-A1'); q.onsuccess = () => res(!!q.result && q.result.size > 0); }); }));
check('B can see the stock on its Stock page', await (async () => { await B.click('[data-testid=bar-back]'); await B.click('[data-testid=tile-stock]'); await B.waitForSelector('[data-testid=stock-row]'); return (await B.locator('[data-testid=stock-row]').count()) === 1; })());

// ---- both add things on their own, then sync: nothing is lost
await A.evaluate((bill) => {
  const l = JSON.parse(localStorage.getItem('spj.cash.v1')); l.unshift({ id: 'cA2', date: '2026-10-02', type: 'out', amount: 200, note: 'A2', createdAt: '2026-10-02T09:00:00Z' }); localStorage.setItem('spj.cash.v1', JSON.stringify(l));
  const h = JSON.parse(localStorage.getItem('spj.history.v1')); h.unshift(bill); localStorage.setItem('spj.history.v1', JSON.stringify(h));
}, mkBill('billA2', 2, '2026-10-02T09:00:00Z'));
await B.evaluate((bill) => {
  const l = JSON.parse(localStorage.getItem('spj.cash.v1')); l.unshift({ id: 'cB1', date: '2026-10-02', type: 'in', amount: 500, note: 'B', createdAt: '2026-10-02T09:30:00Z' }); localStorage.setItem('spj.cash.v1', JSON.stringify(l));
  const h = JSON.parse(localStorage.getItem('spj.history.v1')); h.unshift(bill); localStorage.setItem('spj.history.v1', JSON.stringify(h));
}, mkBill('billB2', 2, '2026-10-02T09:30:00Z')); // the same bill number 2, made on another device
await A.click('[data-testid=bar-back]').catch(() => {}); await A.click('[data-testid=open-settings]').catch(() => {});
await A.click('[data-testid=cloud-connect]'); await A.waitForFunction(() => /In sync/.test(document.querySelector('[data-testid=cloud-status]')?.textContent || ''));
await B.click('[data-testid=bar-back]').catch(() => {}); await B.click('[data-testid=open-settings]');
await B.click('[data-testid=cloud-connect]'); await B.waitForFunction(() => /In sync/.test(document.querySelector('[data-testid=cloud-status]')?.textContent || ''));
await A.click('[data-testid=cloud-connect]'); await A.waitForFunction(() => /In sync/.test(document.querySelector('[data-testid=cloud-status]')?.textContent || ''));
const cashA = await ls(A, 'spj.cash.v1'), cashB = await ls(B, 'spj.cash.v1');
check('both devices now have all three cash entries', cashA.length === 3 && cashB.length === 3, `${cashA.length}/${cashB.length}`);
const hA = await ls(A, 'spj.history.v1'), hB = await ls(B, 'spj.history.v1');
check('both devices have all three bills', hA.length === 3 && hB.length === 3, `${hA.length}/${hB.length}`);
const nums = (h) => h.map((e) => e.number).sort((x, y) => x - y).join(',');
check('the clashing bill number was fixed (1, 2, 3 on both devices, no duplicates)', nums(hA) === '1,2,3' && nums(hB) === '1,2,3', `${nums(hA)} / ${nums(hB)}`);
check('the older bill kept number 2', hA.find((e) => e.id === 'billA2')?.number === 2 && hB.find((e) => e.id === 'billA2')?.number === 2);

// ---- settings: the copy edited last wins
await A.click('[data-testid=bar-back]').catch(() => {});
await A.click('[data-testid=open-settings]').catch(() => {});
await A.fill('[data-testid=shop-name]', 'S.P. JEWELLERS TEST');
await A.waitForTimeout(3200); // the app syncs by itself a moment after a change
await B.click('[data-testid=cloud-connect]'); await B.waitForFunction(() => /In sync/.test(document.querySelector('[data-testid=cloud-status]')?.textContent || ''));
check('a settings change on A reaches B', (await ls(B, 'spj.settings.v1'))?.shopName === 'S.P. JEWELLERS TEST');

// ---- turn off: data stays on the device
await B.click('[data-testid=cloud-off]');
check('turning the cloud off keeps the data on the device', (await ls(B, 'spj.history.v1')).length === 3 && (await B.textContent('[data-testid=cloud-status]')).includes('Off'));

await browser.close();
stop();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
