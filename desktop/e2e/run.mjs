// End-to-end test: launches the built Electron app with a throw-away data folder and walks
// through the estimate workflow, printing failures, and a restart.
// Run with: npm run test:e2e
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.resolve(root, '../docs/screenshots');
fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spj-e2e-'));
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    console.log(`FAIL  ${name}\n      ${err.message.split('\n')[0]}`);
  }
};

async function launch() {
  const app = await electron.launch({ args: [root], env: { ...process.env, SPJ_DATA_DIR: dataDir, ELECTRON_RENDERER_URL: '' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.waitForSelector('.brand-name');
  return { app, page };
}

const row = (page, i) => page.locator('table.grid tbody tr').nth(i);
async function fillRow(page, i, { desc, gross, less, tunch, wstg, pcs }) {
  const r = row(page, i);
  await r.locator('[data-col="desc"]').fill(desc);
  if (gross !== undefined) await r.locator('[data-col="gross"]').fill(String(gross));
  if (less !== undefined) await r.locator('[data-col="less"]').fill(String(less));
  if (tunch !== undefined) await r.locator('[data-col="tunch"]').fill(String(tunch));
  if (wstg !== undefined) await r.locator('[data-col="wstg"]').fill(String(wstg));
  if (pcs !== undefined) await r.locator('[data-col="pcs"]').fill(String(pcs));
}
const cellText = (page, i, nth) => row(page, i).locator('td').nth(nth).innerText();

let { app, page } = await launch();

await step('1. App opens with a new estimate', async () => {
  assert.equal(await page.locator('.brand-name').innerText(), 'S.P. JEWELLERS');
  assert.equal(await page.locator('.brand-code').innerText(), 'ELNABAAD (S0012)');
  assert.equal(await page.locator('table.grid tbody tr').count(), 1);
});

await step('2. Add 1 product (picked from product list fills defaults)', async () => {
  await fillRow(page, 0, { desc: 'Silver Anklet – Traditional', gross: 85.4, less: 2.1 });
  assert.equal(await row(page, 0).locator('[data-col="tunch"]').inputValue(), '92.5');
  assert.equal(await row(page, 0).locator('[data-col="wstg"]').inputValue(), '5');
  assert.equal(await row(page, 0).locator('[data-col="labour"]').inputValue(), '900');
});

await step('6. Net weight = G. Wt. − Less Wt.', async () => {
  assert.equal(await cellText(page, 0, 4), '83.300');
});

await step('7. Amount = fine × rate + labour', async () => {
  // fine = 83.3 × (92.5 + 5)% = 81.218 g × ₹231/g = 18,761.36; labour fixed ₹900
  const silverCell = await cellText(page, 0, 9);
  assert.match(silverCell, /₹231\/g/);
  assert.match(silverCell, /fine 81\.218 g/);
  assert.equal((await row(page, 0).locator('.amount-btn').innerText()).trim(), '19,661.36');
});

await step('3. Add 10 products', async () => {
  const names = ['Gold Ring – Classic', 'Gold Chain – Daily Wear', 'Gold Earrings – Floral', 'Gold Bracelet – Designer', 'Silver Ring – Plain', 'Silver Anklet – Traditional', 'Gold Ring – Classic', 'Silver Ring – Plain', 'Gold Chain – Daily Wear'];
  for (let i = 0; i < names.length; i++) {
    await page.getByRole('button', { name: 'Add item' }).click();
    await fillRow(page, i + 1, { desc: names[i], gross: (3.25 + i * 1.5).toFixed(3), less: i % 3 === 0 ? 0.1 : 0, pcs: (i % 2) + 1 });
  }
  assert.equal(await page.locator('table.grid tbody tr').count(), 10);
  await page.screenshot({ path: path.join(shots, 'desktop-estimate.png') });
});

await step('4. Edit product (gross weight + manual amount)', async () => {
  await row(page, 1).locator('[data-col="gross"]').fill('5.5');
  assert.equal(await cellText(page, 1, 4), '5.400'); // row has 0.100 less weight
  await row(page, 2).locator('.amount-btn').click();
  await row(page, 2).locator('[data-col="amount"]').fill('25000');
  await row(page, 2).locator('[data-col="amount"]').blur();
  assert.match(await row(page, 2).innerText(), /manual/);
});

await step('Duplicate item', async () => {
  await row(page, 0).getByTitle('Duplicate item').click();
  assert.equal(await page.locator('table.grid tbody tr').count(), 11);
  assert.equal(await row(page, 1).locator('[data-col="desc"]').inputValue(), 'Silver Anklet – Traditional');
});

await step('5. Delete product', async () => {
  await row(page, 1).getByTitle('Delete item').click();
  assert.equal(await page.locator('table.grid tbody tr').count(), 10);
});

await step('Validation blocks printing a bad row', async () => {
  await row(page, 9).locator('[data-col="less"]').fill('99');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.locator('.banner-err').waitFor();
  assert.match(await page.locator('.banner-err').innerText(), /Row 10: Less Wt\. is more than G\. Wt\./);
  await row(page, 9).locator('[data-col="less"]').fill('0');
});

await step('8. Preview (PDF from the print template)', async () => {
  await page.getByRole('button', { name: 'Print Preview' }).click();
  await page.locator('.preview-frame iframe').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, 'desktop-preview.png') });
  await page.getByRole('button', { name: 'Close' }).last().click();
  // Also write the PDF itself so the A4 layout can be inspected.
  const bytes = await page.evaluate(async () => Array.from(await window.spj.preview.pdf(await window.spj.draft.get())));
  fs.writeFileSync(path.join(shots, 'desktop-estimate.pdf'), Buffer.from(bytes));
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), '%PDF');
});

await step('9. Save', async () => {
  await page.locator('.info-bar input').first().fill('Ramesh Kumar');
  await page.getByRole('button', { name: 'Save Estimate' }).click();
  await page.locator('.est-no', { hasText: 'E-0001' }).waitFor();
});

let grandTotal = '';
await step('14. Printer unavailable / not selected → real reason + Retry', async () => {
  grandTotal = await page.getByTestId('grand-total').innerText();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.locator('.modal', { hasText: 'Printing failed' }).waitFor();
  assert.match(await page.locator('.modal').innerText(), /No printer selected/);
  await page.getByRole('button', { name: 'Printer Settings' }).last().click();
  await page.locator('.page-title', { hasText: 'Printer Settings' }).waitFor();
  await page.screenshot({ path: path.join(shots, 'desktop-printer-settings.png') });

  // A printer that was selected before but is no longer installed.
  await page.evaluate(() => window.spj.printers.saveConfig({ printerId: 'win:SPJ Counter Printer', printerLabel: 'SPJ Counter Printer', kind: 'document', paperMm: 80, escposMode: 'raster', copies: 1, baudRate: 9600 }));
});

// Reload so the renderer picks up the config written above.
await page.reload();
await page.waitForSelector('.brand-name');

await step('16. Retry printing (fails again with reason, history marks Failed)', async () => {
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  const modal = page.locator('.modal', { hasText: 'Printing failed' });
  await modal.waitFor({ timeout: 30000 });
  const first = await modal.innerText();
  await page.screenshot({ path: path.join(shots, 'desktop-print-failed.png') });
  await modal.getByRole('button', { name: 'Retry' }).click();
  await page.locator('.modal', { hasText: 'Printing failed' }).waitFor({ timeout: 30000 });
  console.log(`      reason shown: ${first.replace(/\s+/g, ' ').slice(0, 220)}`);
  await page.locator('.modal').getByRole('button', { name: 'Close' }).click();
});

await step('15. Bluetooth (serial) printer disconnected → clear error', async () => {
  await page.evaluate(() => window.spj.printers.saveConfig({ printerId: 'com:COM7', printerLabel: 'BT Printer (COM7)', kind: 'escpos', paperMm: 58, escposMode: 'raster', copies: 1, baudRate: 9600 }));
  const r = await page.evaluate(() => window.spj.print.test(false));
  console.log(`      outcome: ${JSON.stringify(r)}`);
  assert.equal(r.ok, false);
  assert.ok(r.message.length > 10);
});

await step('IPC rejects invalid data', async () => {
  const err = await page.evaluate(() => window.spj.printers.saveConfig({ printerId: 'bad', printerLabel: 'x', kind: 'nope' }).then(() => null, (e) => e.message));
  assert.match(err ?? '', /Invalid data/);
});

await step('History shows the estimate with total and print status', async () => {
  await page.getByRole('button', { name: 'History' }).click();
  const r = page.locator('table.list tbody tr').first();
  await r.waitFor();
  const t = await r.innerText();
  assert.match(t, /E-0001/);
  assert.match(t, /Ramesh Kumar/);
  assert.match(t, /Failed/);
  assert.ok(t.includes(grandTotal.replace('₹ ', '')), `total ${grandTotal} in "${t}"`);
  await page.screenshot({ path: path.join(shots, 'desktop-history.png') });
});

await step('10. Reopen saved estimate', async () => {
  await page.getByRole('button', { name: 'New Estimate' }).click().catch(() => undefined);
  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await page.getByRole('button', { name: 'New Estimate' }).click();
  assert.equal(await page.locator('table.grid tbody tr').count(), 1);
  await page.getByRole('button', { name: 'History' }).click();
  await page.locator('table.list tbody tr').first().getByRole('button', { name: 'Open' }).click();
  await page.locator('.est-no', { hasText: 'E-0001' }).waitFor();
  assert.equal(await page.locator('table.grid tbody tr').count(), 10);
});

await step('Settings page renders with product list', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('table.products tbody tr').first().waitFor();
  assert.equal(await page.locator('table.products tbody tr').count(), 6);
  await page.screenshot({ path: path.join(shots, 'desktop-settings.png') });
  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
});

await step('Auto-save: unsaved edit survives closing the app', async () => {
  await page.locator('.info-bar input').nth(1).fill('9876543210');
  await page.waitForTimeout(900);
});
await app.close();
({ app, page } = await launch());

await step('17. Restart application and verify saved data', async () => {
  assert.equal(await page.locator('.est-no').innerText(), 'E-0001');
  assert.equal(await page.locator('.info-bar input').nth(1).inputValue(), '9876543210');
  assert.equal(await page.locator('table.grid tbody tr').count(), 10);
  const list = await page.evaluate(() => window.spj.estimates.list());
  assert.equal(list.length, 1);
  const cfg = await page.evaluate(() => window.spj.printers.getConfig());
  assert.equal(cfg.printerId, 'com:COM7', 'printer choice remembered');
});

await step('Delete from history', async () => {
  await page.getByRole('button', { name: 'History' }).click();
  await page.locator('table.list tbody tr').first().getByTitle('Delete').click();
  await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();
  await page.locator('table.list .empty').waitFor();
});

await app.close();
fs.rmSync(dataDir, { recursive: true, force: true });
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
