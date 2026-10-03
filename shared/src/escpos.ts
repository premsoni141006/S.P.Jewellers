// ESC/POS byte builder for thermal receipt printers. Pure data — no I/O.
// The desktop app sends these bytes over a Bluetooth serial (COM) port or as a RAW
// Windows print job; the website sends them over Web Bluetooth.

import { calcEstimate } from './calc';
import { fmtMoney, fmtPcs, fmtPercent, fmtWeight } from './format';
import { bhavText, metalName, metalsBought } from './template';
import type { PrintHeader } from './template';
import type { Estimate } from './types';

const ESC = 0x1b;
const GS = 0x1d;

/** Printers use code page 437/858 — keep text to plain ASCII. */
export function toAscii(s: string): string {
  return s
    .replace(/₹/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e\n]/g, '');
}

export class EscPos {
  private out: number[] = [];

  init(): this {
    this.out.push(ESC, 0x40);
    return this;
  }
  align(a: 'left' | 'center' | 'right'): this {
    this.out.push(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
    return this;
  }
  bold(on: boolean): this {
    this.out.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }
  /** Character magnification 1–8 in each direction. */
  size(w: number, h: number): this {
    const c = (n: number) => Math.min(8, Math.max(1, Math.round(n))) - 1;
    this.out.push(GS, 0x21, (c(w) << 4) | c(h));
    return this;
  }
  text(s: string): this {
    for (const ch of toAscii(s)) this.out.push(ch.charCodeAt(0));
    return this;
  }
  line(s = ''): this {
    return this.text(s).feed(1);
  }
  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.out.push(0x0a);
    return this;
  }
  /** Feed past the cutter and cut (ignored by printers without one). */
  cut(): this {
    this.out.push(GS, 0x56, 0x42, 0x00);
    return this;
  }
  /**
   * Print a 1-bit image with GS v 0, in bands so small printer buffers keep up.
   * `bits` is row-major, MSB first, 1 = black.
   */
  raster(bits: Uint8Array, widthBytes: number, height: number, band = 96): this {
    for (let y = 0; y < height; y += band) {
      const h = Math.min(band, height - y);
      this.out.push(GS, 0x76, 0x30, 0x00, widthBytes & 0xff, widthBytes >> 8, h & 0xff, h >> 8);
      const start = y * widthBytes;
      for (let i = 0; i < h * widthBytes; i++) this.out.push(bits[start + i]);
    }
    return this;
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/**
 * Convert a 32-bit pixel buffer (RGBA from canvas, BGRA from Electron's NativeImage.toBitmap)
 * into the 1-bit layout GS v 0 expects.
 */
export function toMonochrome(
  pixels: Uint8Array,
  width: number,
  height: number,
  order: 'rgba' | 'bgra',
  threshold = 160,
): { bits: Uint8Array; widthBytes: number } {
  const widthBytes = Math.ceil(width / 8);
  const bits = new Uint8Array(widthBytes * height);
  const [ri, bi] = order === 'rgba' ? [0, 2] : [2, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const a = pixels[o + 3] / 255;
      // Treat transparent as white paper.
      const lum = (0.299 * pixels[o + ri] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + bi]) * a + 255 * (1 - a);
      if (lum < threshold) bits[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits, widthBytes };
}

/** Characters per line in Font A for common paper widths. */
export const charsForPaper = (paperMm: 58 | 80): number => (paperMm === 80 ? 48 : 32);
export const dotsForPaper = (paperMm: 58 | 80): number => (paperMm === 80 ? 576 : 384);

const padL = (s: string, w: number) => (s.length >= w ? s.slice(-w) : ' '.repeat(w - s.length) + s);
const padR = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length));

const cols = (values: string[], widths: number[]): string => values.map((v, i) => padL(v, widths[i])).join('');

export function buildTestPrintEscPos(header: PrintHeader, when: Date = new Date()): Uint8Array {
  const stamp = when.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return new EscPos()
    .init()
    .align('center')
    .bold(true).size(2, 2).line(header.shopName)
    .size(1, 1).line(header.shopCode.trim() ? header.shopCode : '')
    .bold(false).feed(1)
    .bold(true).line('Printer Test Successful').bold(false)
    .line(stamp)
    .feed(4)
    .cut()
    .bytes();
}

/**
 * Text-mode estimate for printers that cannot print raster images.
 * Same ten fields per item, laid out on three lines.
 */
export function buildEstimateEscPosText(est: Estimate, header: PrintHeader, paperMm: 58 | 80): Uint8Array {
  const t = calcEstimate(est);
  const W = charsForPaper(paperMm);
  const a = paperMm === 80 ? [10, 11, 11, 10, 6] : [7, 7, 7, 6, 4]; // G.Wt Less Net Tunch Pcs
  const b = paperMm === 80 ? [12, 14, 22] : [8, 9, 14]; // Making Silver Amount
  const rule = '-'.repeat(W);

  const p = new EscPos().init().align('center').bold(true).size(2, 2).line(header.shopName).size(1, 1).line(header.shopCode.trim() ? header.shopCode : '').bold(false).line((header.ownerLine ?? '').trim()).align('left').line(rule);

  p.line('Description');
  p.line(cols(['G.Wt.', 'Less', 'Net Wt.', 'Tunch', 'Pcs'], a));
  p.line(cols(['Making', 'Metal', 'Amount'], b));
  p.line(rule);

  est.items.forEach((it, i) => {
    const c = t.items[i];
    p.bold(true).line(it.description.slice(0, W)).bold(false);
    p.line(cols([fmtWeight(it.grossWt), fmtWeight(it.lessWt), fmtWeight(c.netWt), fmtPercent(it.tunch), fmtPcs(it.pcs)], a));
    p.line(cols([fmtMoney(c.labour), metalName(it.metal), fmtMoney(c.amount)], b));
  });
  p.line(rule);

  const kv = (k: string, v: string) => p.line(padR(k, W - Math.max(v.length, 12)) + padL(v, Math.max(v.length, 12)));
  metalsBought(est).forEach((m) => kv(`${metalName(m).toUpperCase()} BHAV`, toAscii(bhavText(est, m))));
  if (est.otherCharges.length) {
    kv('Items', fmtMoney(t.itemsAmount));
    est.otherCharges.forEach((c) => kv(c.label.slice(0, W - 14), fmtMoney(c.amount)));
  }
  if (est.pricing.gstEnabled) kv(`GST ${fmtPercent(est.pricing.gstPercent)}%`, fmtMoney(t.gst));
  p.line(rule).bold(true);
  kv('TOTAL', `Rs. ${fmtMoney(t.grandTotal)}`);
  p.bold(false).feed(4).cut();
  return p.bytes();
}
