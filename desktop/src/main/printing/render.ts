// Loads print HTML into hidden, locked-down windows to print, make PDFs or take a bitmap.

import { BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PrintError } from './types';

/** Same page set-up for the PDF preview and the printer job, so they lay out identically. */
export const A4_PDF_OPTIONS: Electron.PrintToPDFOptions = {
  pageSize: 'A4',
  landscape: false,
  printBackground: true,
  preferCSSPageSize: true,
  // 10 mm on every side, matching the template's @page rule and the printer job.
  margins: { top: 10 / 25.4, bottom: 10 / 25.4, left: 10 / 25.4, right: 10 / 25.4 },
};

let seq = 0;

async function withHtml<T>(html: string, opts: { width: number; height: number; offscreen?: boolean; js?: boolean }, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const dir = path.join(app.getPath('temp'), 'spj-print');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `doc-${process.pid}-${++seq}.html`);
  fs.writeFileSync(file, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: opts.width,
    height: opts.height,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      offscreen: opts.offscreen ?? false,
      javascript: opts.js ?? false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  try {
    await win.loadFile(file);
    return await fn(win);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    fs.rm(file, { force: true }, () => undefined);
  }
}

export function htmlToPdf(html: string): Promise<Buffer> {
  return withHtml(html, { width: 794, height: 1123 }, (win) => win.webContents.printToPDF(A4_PDF_OPTIONS));
}

/**
 * Sends the HTML to an installed printer through the Windows spooler (no dialog).
 * Resolves once Chromium has handed the job to the spooler.
 */
export function printHtml(html: string, deviceName: string, copies: number): Promise<void> {
  return withHtml(html, { width: 794, height: 1123 }, (win) =>
    new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          deviceName,
          printBackground: true,
          color: false,
          landscape: false,
          pageSize: 'A4',
          margins: { marginType: 'default' },
          scaleFactor: 100,
          copies: Math.max(1, Math.min(10, copies)),
        },
        (success, failureReason) => {
          if (success) resolve();
          else if (/invalid devicename/i.test(failureReason ?? ''))
            reject(new PrintError('PRINTER_NOT_FOUND', `Printer "${deviceName}" is not installed on this computer. Reconnect it or choose another printer in Printer Settings.`, failureReason));
          else reject(new PrintError('SPOOLER_REJECTED', 'Windows did not accept the print job.', failureReason || 'No reason given by the print system.', false));
        },
      );
    }),
  );
}

/** Renders HTML at exactly `widthPx` CSS pixels wide and returns a BGRA bitmap of the whole page. */
export function htmlToBitmap(html: string, widthPx: number): Promise<{ bgra: Buffer; width: number; height: number }> {
  return withHtml(html, { width: widthPx, height: 400, offscreen: true, js: true }, async (win) => {
    win.webContents.setZoomFactor(1);
    const height = Number(await win.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)'));
    if (!(height > 0)) throw new PrintError('UNKNOWN', 'Could not lay out the receipt.');
    if (height > 16000) throw new PrintError('NOT_SUPPORTED', 'This estimate is too long for a receipt printer. Print it on an A4 printer instead.');
    win.setContentSize(widthPx, height);
    await new Promise((r) => setTimeout(r, 250));
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: widthPx, height });
    // Offscreen pages can be captured at the screen's scale factor; bring it back to 1 dot per px.
    if (img.getSize().width !== widthPx) img = img.resize({ width: widthPx, quality: 'best' });
    const size = img.getSize();
    return { bgra: img.toBitmap(), width: size.width, height: size.height };
  });
}
