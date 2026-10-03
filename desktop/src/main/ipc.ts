// Every channel the renderer can call. Arguments are validated with zod before they reach the
// database or the printer code, and calls are only accepted from the app's own page.

import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import { z } from 'zod';
import { fmtEstimateNo, sampleEstimate, type Estimate } from '@shared';
import type { Store } from './db';
import type { PrintService } from './printing/service';

const finite = z.number().finite();
const id = z.string().min(1).max(80);
const metal = z.enum(['gold', 'silver']);
const labourMode = z.enum(['per_gram', 'per_piece', 'fixed']);
const rateUnit = z.enum(['per_gram', 'per_10g', 'per_kg']);
const fineFormula = z.enum(['tunch_plus_wastage', 'tunch_only']);

const itemSchema = z.object({
  id,
  description: z.string().max(200),
  metal,
  grossWt: finite.min(0).max(1_000_000),
  lessWt: finite.min(0).max(1_000_000),
  tunch: finite.min(0).max(1000),
  wastage: finite.min(0).max(1000),
  pcs: finite.min(0).max(100_000),
  pcsUnit: z.enum(['pc', 'pair']).optional(),
  labourRate: finite.min(0).max(1e9),
  labourMode,
  amountOverride: finite.min(0).max(1e12).nullable(),
});

const pricingSchema = z.object({
  goldRate: finite.min(0).max(1e9),
  goldRateUnit: rateUnit,
  silverRate: finite.min(0).max(1e9),
  silverRateUnit: rateUnit,
  fineFormula,
  gstEnabled: z.boolean(),
  gstPercent: finite.min(0).max(100),
  roundGrandTotal: z.boolean(),
});

const estimateSchema = z.object({
  id,
  number: z.number().int().min(0),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  customerName: z.string().max(120),
  customerPhone: z.string().max(40),
  pricing: pricingSchema,
  items: z.array(itemSchema).max(300),
  otherCharges: z.array(z.object({ id, label: z.string().max(80), amount: finite.min(-1e9).max(1e9) })).max(30),
  printStatus: z.enum(['not_printed', 'printed', 'failed']),
  printedAt: z.string().max(40).nullable(),
  lastPrintError: z.string().max(2000).nullable(),
});

const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(60),
  shopCode: z.string().max(80),
  address: z.string().max(300),
  phone: z.string().max(40),
  gstNumber: z.string().max(20),
  defaultGoldRate: finite.min(0).max(1e9),
  goldRateUnit: rateUnit,
  defaultSilverRate: finite.min(0).max(1e9),
  silverRateUnit: rateUnit,
  defaultLabour: finite.min(0).max(1e9),
  defaultLabourMode: labourMode,
  fineFormula,
  gstEnabled: z.boolean(),
  gstPercent: finite.min(0).max(100),
  roundGrandTotal: z.boolean(),
});

const productsSchema = z
  .array(
    z.object({
      id,
      name: z.string().trim().min(1).max(200),
      metal,
      tunch: finite.min(0).max(1000),
      wastage: finite.min(0).max(1000),
      labourRate: finite.min(0).max(1e9),
      labourMode,
      pcsUnit: z.enum(['pc', 'pair']).optional(),
    }),
  )
  .max(500);

const printerConfigSchema = z.object({
  printerId: z
    .string()
    .max(300)
    .regex(/^(win:.+|com:COM\d+)$/i)
    .nullable(),
  printerLabel: z.string().max(300),
  kind: z.enum(['document', 'escpos']),
  paperMm: z.union([z.literal(58), z.literal(80)]),
  escposMode: z.enum(['raster', 'text']),
  copies: z.number().int().min(1).max(10),
  baudRate: z.number().int().min(1200).max(921600),
});

export function registerIpc(opts: { store: Store; printer: PrintService; isTrustedUrl: (url: string) => boolean; version: string }): void {
  const { store, printer } = opts;

  function handle<A extends z.ZodTypeAny>(channel: string, schema: A, fn: (arg: z.infer<A>, e: IpcMainInvokeEvent) => unknown): void {
    ipcMain.handle(channel, async (e, raw: unknown) => {
      const url = e.senderFrame?.url ?? '';
      if (!opts.isTrustedUrl(url)) throw new Error(`Blocked IPC "${channel}" from ${url || 'unknown frame'}`);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid data for "${channel}": ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      return fn(parsed.data, e);
    });
  }
  const none = z.undefined();

  handle('app:info', none, () => ({ version: opts.version, platform: process.platform, dataFile: store.filePath }));
  handle('app:openBluetoothSettings', none, async () => {
    if (process.platform === 'win32') await shell.openExternal('ms-settings:bluetooth');
    else if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.BluetoothSettings');
  });
  handle('app:openPrintersSettings', none, async () => {
    if (process.platform === 'win32') await shell.openExternal('ms-settings:printers');
  });

  handle('settings:get', none, () => store.getSettings());
  handle('settings:save', settingsSchema, (s) => store.saveSettings(s));
  handle('products:list', none, () => store.listProducts());
  handle('products:save', productsSchema, (list) => store.saveProducts(list));

  handle('draft:get', none, () => store.getDraft());
  handle('draft:save', estimateSchema.nullable(), (est) => store.saveDraft(est as Estimate | null));
  // Fire-and-forget variant used while the window is closing.
  ipcMain.on('draft:saveNow', (e, raw: unknown) => {
    if (!opts.isTrustedUrl(e.senderFrame?.url ?? '')) return;
    const parsed = estimateSchema.nullable().safeParse(raw);
    if (parsed.success) store.saveDraft(parsed.data as Estimate | null);
  });

  handle('estimates:list', none, () => store.listEstimates());
  handle('estimates:get', id, (estimateId) => store.getEstimate(estimateId));
  handle('estimates:save', estimateSchema, (est) => store.saveEstimate(est as Estimate));
  handle('estimates:delete', id, (estimateId) => store.deleteEstimate(estimateId));

  handle('printers:list', none, () => printer.listPrinters());
  handle('printers:getConfig', none, () => store.getPrinterConfig());
  handle('printers:saveConfig', printerConfigSchema, (c) => store.savePrinterConfig(c));
  handle('printers:check', z.string().max(300), (printerId) => printer.checkConnection(printerId));

  handle('print:estimate', z.object({ id, force: z.boolean() }), async ({ id: estimateId, force }) => {
    const est = store.getEstimate(estimateId);
    if (!est) return { outcome: { ok: false, code: 'UNKNOWN', message: 'This estimate is no longer saved. Save it again and retry.' }, estimate: null };
    const outcome = await printer.printEstimate(est, force);
    return { outcome, estimate: store.getEstimate(estimateId) };
  });
  handle('print:test', z.object({ force: z.boolean() }), ({ force }) => printer.testPrint(force));
  handle('print:testEstimate', z.object({ force: z.boolean() }), ({ force }) => printer.printSample(sampleEstimate(store.getSettings()), force));

  handle('preview:pdf', estimateSchema, async (est) => new Uint8Array(await printer.estimatePdf(est as Estimate)));
  handle('preview:savePdf', estimateSchema, async (est, e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const name = `Estimate-${fmtEstimateNo(est.number)}${est.customerName ? `-${est.customerName.replace(/[^\w -]+/g, '').trim()}` : ''}.pdf`;
    const res = await (win ? dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] }) : dialog.showSaveDialog({ defaultPath: name }));
    if (res.canceled || !res.filePath) return { saved: false, path: null };
    fs.writeFileSync(res.filePath, await printer.estimatePdf(est as Estimate));
    return { saved: true, path: res.filePath };
  });
}
