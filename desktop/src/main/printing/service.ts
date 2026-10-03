// Print orchestration. The UI asks for "print this estimate"; this decides how, based on the
// remembered printer configuration:
//
//   windows printer + document kind → A4 HTML → Chromium → Windows spooler (any connection)
//   windows printer + escpos kind   → ESC/POS bytes → RAW spooler job
//   serial (Bluetooth COM) printer  → ESC/POS bytes → COM port directly
//
// Every path ends in a PrintOutcome with a plain message and the system's own reason.

import type { WebContents } from 'electron';
import {
  EscPos,
  buildEstimateEscPosText,
  buildTestPrintEscPos,
  dotsForPaper,
  fmtEstimateNo,
  renderEstimateHtml,
  renderReceiptHtml,
  renderTestPageHtml,
  toMonochrome,
  validateEstimate,
  type Estimate,
  type PrintHeader,
} from '@shared';
import type { Store } from '../db';
import { discoverPrinters } from './discovery';
import { precheckWindowsPrinter, watchWindowsJob } from './queue';
import { htmlToBitmap, htmlToPdf, printHtml } from './render';
import { probeSerial, sendRawToSpooler, sendToSerial } from './transports';
import { PrintError, type PrintOutcome, type PrinterConfig, type PrinterInfo } from './types';

interface Job {
  estimateId: string | null;
  /** Document name in the Windows queue; also how the job is found again to watch it. */
  title: string;
  a4Html: () => string;
  escpos: (cfg: PrinterConfig) => Promise<Uint8Array>;
}

const withTitle = (html: string, title: string) => html.replace(/<title>[^<]*<\/title>/, `<title>${title.replace(/[<&]/g, '')}</title>`);

export class PrintService {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: Store,
    private readonly webContents: () => WebContents,
  ) {}

  private header(): PrintHeader {
    const s = this.store.getSettings();
    return { shopName: s.shopName, shopCode: s.shopCode };
  }

  async listPrinters(): Promise<{ printers: PrinterInfo[]; warning: string | null }> {
    return discoverPrinters(this.webContents());
  }

  /** One print at a time: a second click waits for the first job instead of interleaving bytes. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  // -------------------------------------------------------------- documents

  estimatePdf(est: Estimate): Promise<Buffer> {
    return htmlToPdf(renderEstimateHtml(est, this.header()));
  }

  private async receiptBytes(est: Estimate, cfg: PrinterConfig): Promise<Uint8Array> {
    const header = this.header();
    if (cfg.escposMode === 'text') return buildEstimateEscPosText(est, header, cfg.paperMm);
    const dots = dotsForPaper(cfg.paperMm);
    const bmp = await htmlToBitmap(renderReceiptHtml(est, header, dots), dots);
    const { bits, widthBytes } = toMonochrome(new Uint8Array(bmp.bgra.buffer, bmp.bgra.byteOffset, bmp.bgra.byteLength), bmp.width, bmp.height, 'bgra');
    return new EscPos().init().align('left').raster(bits, widthBytes, bmp.height).feed(4).cut().bytes();
  }

  // -------------------------------------------------------------- jobs

  printEstimate(est: Estimate, force = false): Promise<PrintOutcome> {
    const issues = validateEstimate(est);
    if (issues.length) return Promise.resolve({ ok: false, code: 'VALIDATION', message: issues.map((i) => i.message).join(' ') });
    const header = this.header();
    return this.serial(() =>
      this.execute(
        {
          estimateId: est.id,
          title: `SPJ Estimate ${fmtEstimateNo(est.number)} ${Date.now().toString(36)}`,
          a4Html: () => renderEstimateHtml(est, header),
          escpos: (cfg) => this.receiptBytes(est, cfg),
        },
        force,
        'Estimate printed successfully.',
      ),
    );
  }

  testPrint(force = false): Promise<PrintOutcome> {
    const header = this.header();
    const cfg = this.store.getPrinterConfig();
    return this.serial(() =>
      this.execute(
        {
          estimateId: null,
          title: `SPJ Printer Test ${Date.now().toString(36)}`,
          a4Html: () => renderTestPageHtml(header, cfg.printerLabel || 'Selected printer'),
          escpos: async () => buildTestPrintEscPos(header),
        },
        force,
        'Test page printed successfully.',
      ),
    );
  }

  printSample(est: Estimate, force = false): Promise<PrintOutcome> {
    const header = this.header();
    return this.serial(() =>
      this.execute(
        {
          estimateId: null,
          title: `SPJ Test Estimate ${Date.now().toString(36)}`,
          a4Html: () => renderEstimateHtml(est, header, { note: 'Test estimate • Product details are sample data.' }),
          escpos: (cfg) => this.receiptBytes(est, cfg),
        },
        force,
        'Test estimate printed successfully.',
      ),
    );
  }

  /** Checks a printer without printing a page. */
  async checkConnection(printerId: string): Promise<PrintOutcome> {
    try {
      if (printerId.startsWith('com:')) {
        const com = printerId.slice(4);
        await probeSerial(com);
        return { ok: true, message: `Connected to the Bluetooth printer on ${com}.` };
      }
      const name = printerId.slice(4);
      await precheckWindowsPrinter(name);
      const { printers } = await this.listPrinters();
      const p = printers.find((x) => x.id === printerId);
      if (!p) return { ok: false, code: 'PRINTER_NOT_FOUND', message: `Printer "${name}" is not installed on this computer.` };
      return { ok: true, message: `${p.displayName}: ${p.stateText}.` };
    } catch (err) {
      return this.toOutcome(err);
    }
  }

  private async execute(job: Job, force: boolean, successMessage: string): Promise<PrintOutcome> {
    const cfg = this.store.getPrinterConfig();
    const label = cfg.printerLabel || cfg.printerId || '';
    let outcome: PrintOutcome;
    try {
      if (!cfg.printerId) throw new PrintError('NO_PRINTER_SELECTED', 'No printer selected. Choose one in Printer Settings.');
      const copies = Math.max(1, Math.min(10, Math.round(cfg.copies || 1)));

      if (cfg.printerId.startsWith('com:')) {
        const bytes = await job.escpos(cfg);
        for (let c = 0; c < copies; c++) await sendToSerial(cfg.printerId.slice(4), bytes, cfg.baudRate);
        outcome = { ok: true, message: successMessage };
      } else {
        const name = cfg.printerId.slice(4);
        if (!force) await precheckWindowsPrinter(name);
        let watch;
        if (cfg.kind === 'escpos') {
          const bytes = await job.escpos(cfg);
          const all = new Uint8Array(bytes.length * copies);
          for (let c = 0; c < copies; c++) all.set(bytes, c * bytes.length);
          const jobId = await sendRawToSpooler(name, all, job.title);
          watch = await watchWindowsJob(name, { jobId });
        } else {
          await printHtml(withTitle(job.a4Html(), job.title), name, copies);
          watch = await watchWindowsJob(name, { docName: job.title });
        }
        outcome =
          watch.state === 'pending'
            ? { ok: true, message: `Sent to the printer. Windows is still printing it${watch.status ? ` (${watch.status})` : ''}.` }
            : { ok: true, message: successMessage };
      }
    } catch (err) {
      outcome = this.toOutcome(err);
    }
    outcome.printer = label;
    this.store.recordPrint(job.estimateId, label || '(none)', outcome.ok, outcome.ok ? outcome.message : `${outcome.message}${outcome.detail ? ` — ${outcome.detail}` : ''}`);
    return outcome;
  }

  private toOutcome(err: unknown): PrintOutcome {
    if (err instanceof PrintError) return { ok: false, code: err.code, message: err.message, detail: err.detail, canForce: err.canForce };
    const e = err as Error;
    return { ok: false, code: 'UNKNOWN', message: 'Printing failed.', detail: e?.message ?? String(err) };
  }
}
