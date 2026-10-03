import {
  buildEstimateEscPosText, buildTestPrintEscPos, fmtEstimateNo, renderEstimateHtml, renderTestPageHtml,
  type Estimate, type PrintHeader,
} from '@shared';
import { PrinterError, bleSupported, currentDevice, restorePrinter, sendBytes } from './bluetooth';
import { NativeError, isNative, nativePrintEscPos, nativePrintHtml } from './native';
import { printHtmlViaDialog } from './printDialog';

export interface PrinterConfig {
  mode: 'system' | 'thermal';
  paperMm: 58 | 80;
  /** Web Bluetooth (browser) printer. */
  deviceId: string | null;
  deviceName: string | null;
  /** Paired classic/BLE printer chosen in the Android app, by MAC address. */
  nativeAddress: string | null;
  nativeName: string | null;
}

export const DEFAULT_PRINTER: PrinterConfig = { mode: 'system', paperMm: 80, deviceId: null, deviceName: null, nativeAddress: null, nativeName: null };

/** printed = the printer confirmed; sent = handed over (dialog / queue) without confirmation. */
export interface PrintOutcome {
  outcome: 'printed' | 'sent' | 'cancelled';
  message: string;
}

async function ensureWebThermal(cfg: PrinterConfig): Promise<void> {
  if (!bleSupported()) throw new PrinterError('This browser cannot use Bluetooth. Switch to "System printer", or use Chrome on Android / a computer.');
  if (currentDevice()) return;
  if (!cfg.deviceId) throw new PrinterError('No Bluetooth printer chosen yet. Tap "Choose printer" in the Printer tab.');
  if (await restorePrinter(cfg.deviceId)) return;
  throw new PrinterError(`Choose the Bluetooth printer again in the Printer tab${cfg.deviceName ? ` (${cfg.deviceName})` : ''}. The browser needs permission again after the page is reopened.`);
}

async function printDocument(html: string, jobName: string, what: string): Promise<PrintOutcome> {
  if (!isNative()) {
    await printHtmlViaDialog(html);
    return { outcome: 'sent', message: 'Sent to the print dialog.' };
  }
  const { state } = await nativePrintHtml(html, jobName);
  switch (state) {
    case 'completed':
      return { outcome: 'printed', message: `${what} printed successfully.` };
    case 'queued':
      return { outcome: 'sent', message: 'Sent to the printer.' };
    case 'timeout':
      return { outcome: 'sent', message: 'Sent to the printer. Android did not confirm that it finished.' };
    case 'cancelled':
      return { outcome: 'cancelled', message: 'Printing cancelled.' };
    case 'blocked':
    default:
      throw new NativeError('The printer stopped the job. Check that it is on, has paper and is connected, then retry.', 'BLOCKED');
  }
}

async function printThermal(bytes: Uint8Array, cfg: PrinterConfig, what: string): Promise<PrintOutcome> {
  if (isNative()) {
    if (!cfg.nativeAddress) throw new NativeError('No Bluetooth printer selected. Choose one in the Printer tab.', 'NOT_SELECTED');
    await nativePrintEscPos(cfg.nativeAddress, bytes);
  } else {
    await ensureWebThermal(cfg);
    await sendBytes(bytes);
  }
  return { outcome: 'printed', message: `${what} printed successfully.` };
}

export function printEstimate(est: Estimate, header: PrintHeader, cfg: PrinterConfig): Promise<PrintOutcome> {
  if (cfg.mode === 'system') return printDocument(renderEstimateHtml(est, header), `Estimate ${fmtEstimateNo(est.number)}`, 'Estimate');
  return printThermal(buildEstimateEscPosText(est, header, cfg.paperMm), cfg, 'Estimate');
}

export function testPrint(header: PrintHeader, cfg: PrinterConfig): Promise<PrintOutcome> {
  if (cfg.mode === 'system') {
    const where = isNative() ? 'Chosen in the Android print dialog' : 'Chosen in the print dialog';
    return printDocument(renderTestPageHtml(header, where), 'Printer test', 'Test page');
  }
  return printThermal(buildTestPrintEscPos(header), cfg, 'Test page');
}

export const errorText = (e: unknown): string => {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message || 'Printing failed.';
  return String(e) || 'Printing failed.';
};
