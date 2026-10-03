// Type of window.spj, shared by the preload and the renderer.

import type { Estimate, EstimateSummary, Product, ShopSettings } from '@shared';
import type { PrintOutcome, PrinterConfig, PrinterInfo } from '../main/printing/types';

export type { PrintOutcome, PrinterConfig, PrinterInfo };

export interface SpjApi {
  app: {
    info(): Promise<{ version: string; platform: string; dataFile: string }>;
    openBluetoothSettings(): Promise<void>;
    openPrintersSettings(): Promise<void>;
  };
  settings: {
    get(): Promise<ShopSettings>;
    save(s: ShopSettings): Promise<ShopSettings>;
  };
  products: {
    list(): Promise<Product[]>;
    save(list: Product[]): Promise<Product[]>;
  };
  draft: {
    get(): Promise<Estimate | null>;
    save(est: Estimate | null): Promise<void>;
    saveNow(est: Estimate | null): void;
  };
  estimates: {
    list(): Promise<EstimateSummary[]>;
    get(id: string): Promise<Estimate | null>;
    save(est: Estimate): Promise<Estimate>;
    delete(id: string): Promise<void>;
  };
  printers: {
    list(): Promise<{ printers: PrinterInfo[]; warning: string | null }>;
    getConfig(): Promise<PrinterConfig>;
    saveConfig(c: PrinterConfig): Promise<PrinterConfig>;
    check(printerId: string): Promise<PrintOutcome>;
  };
  print: {
    estimate(id: string, force: boolean): Promise<{ outcome: PrintOutcome; estimate: Estimate | null }>;
    test(force: boolean): Promise<PrintOutcome>;
    testEstimate(force: boolean): Promise<PrintOutcome>;
  };
  preview: {
    pdf(est: Estimate): Promise<Uint8Array>;
    savePdf(est: Estimate): Promise<{ saved: boolean; path: string | null }>;
  };
}
