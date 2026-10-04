// Saves the final bill as an image (PNG) or a PDF. Both are drawn from the same bill layout that is
// printed, so they match the paper exactly. No external libraries: the bill HTML is laid out in a
// hidden frame, drawn to a canvas through an SVG <foreignObject>, and the PDF is assembled from
// A4 pages of that picture (cut between rows, never through one).

import { A4_PT, buildPdfFromJpegs, fmtEstimateNo, renderEstimateHtml, type Estimate, type PrintHeader } from '@shared';
import { isNative, nativeSaveFile, nativeShareFile } from './native';

const SHEET_W = 794; // A4 width at 96 dpi, in CSS px
const SHEET_H = 1123;
const MAX_CANVAS_H = 16000;
/** On screen the template shows a grey desk behind the paper; for export the paper stands alone. */
const PLAIN = '<style>html,body{background:#fff!important}body{padding:0!important}.sheet{box-shadow:none!important;margin:0!important;min-height:0!important}</style>';

interface Rendered {
  canvas: HTMLCanvasElement;
  scale: number;
  /** Bottom edge of every table row, in canvas pixels: the only places a page may end. */
  rowBottoms: number[];
}

async function renderBill(est: Estimate, header: PrintHeader, wantedScale = 2): Promise<Rendered> {
  const html = renderEstimateHtml(est, header).replace('</head>', `${PLAIN}</head>`);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${SHEET_W}px;height:${SHEET_H}px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Could not lay out the bill.'));
      frame.srcdoc = html;
    });
    const doc = frame.contentDocument;
    const sheet = doc?.querySelector('.sheet');
    if (!doc || !sheet) throw new Error('Could not lay out the bill.');
    await Promise.all([...doc.images].map((im) => im.decode().catch(() => undefined)));

    const contentH = Math.max(1, Math.ceil(sheet.getBoundingClientRect().height));
    const scale = Math.min(wantedScale, MAX_CANVAS_H / contentH);
    const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W * scale}" height="${contentH * scale}" viewBox="0 0 ${SHEET_W} ${contentH}"><foreignObject x="0" y="0" width="${SHEET_W}" height="${contentH}">${xhtml}</foreignObject></svg>`;

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(SHEET_W * scale);
    canvas.height = Math.round(contentH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the bill.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const rowBottoms = [...doc.querySelectorAll('.sheet tbody tr')].map((tr) => Math.round(tr.getBoundingClientRect().bottom * scale));
    return { canvas, scale, rowBottoms };
  } finally {
    frame.remove();
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the file.'))), type, quality));

/** Where each A4 page starts and ends (canvas px): at a row boundary whenever one fits. */
export function pageBreaks(rowBottoms: number[], total: number, pageH: number): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  let start = 0;
  while (start < total) {
    const limit = start + pageH;
    if (total <= limit) { pages.push([start, total]); break; }
    const fits = rowBottoms.filter((b) => b > start + pageH * 0.4 && b <= limit);
    const end = fits.length ? Math.max(...fits) : limit;
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

export const billFileName = (est: Estimate, ext: 'png' | 'pdf'): string => `Bill-${est.number > 0 ? fmtEstimateNo(est.number) : 'draft'}.${ext}`;

/** The bill as a PNG picture, as tall as the bill itself. */
export async function billImage(est: Estimate, header: PrintHeader): Promise<Blob> {
  const { canvas } = await renderBill(est, header);
  return toBlob(canvas, 'image/png');
}

/** The bill as a PDF: A4 pages, a new page only when the rows no longer fit. */
export async function billPdf(est: Estimate, header: PrintHeader): Promise<Blob> {
  const { canvas, rowBottoms } = await renderBill(est, header);
  const pageW = canvas.width;
  const pageH = Math.round(pageW * (A4_PT.height / A4_PT.width));
  const pages = [];
  for (const [y0, y1] of pageBreaks(rowBottoms, canvas.height, pageH)) {
    const page = document.createElement('canvas');
    page.width = pageW;
    page.height = pageH;
    const ctx = page.getContext('2d');
    if (!ctx) throw new Error('Could not draw the bill.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pageW, pageH);
    ctx.drawImage(canvas, 0, y0, pageW, y1 - y0, 0, 0, pageW, y1 - y0);
    const jpeg = new Uint8Array(await (await toBlob(page, 'image/jpeg', 0.92)).arrayBuffer());
    pages.push({ jpeg, width: pageW, height: pageH });
  }
  return new Blob([buildPdfFromJpegs(pages) as BlobPart], { type: 'application/pdf' });
}

const toBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });

/** Saves the file: into Downloads / Pictures inside the app, as a normal download in a browser. Returns where it went. */
export async function saveBlob(name: string, blob: Blob): Promise<string> {
  if (isNative()) {
    const { location } = await nativeSaveFile({ name, mime: blob.type, data: await toBase64(blob) });
    return location;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'Downloads';
}

/** Shares the bill (PDF) through the phone's share sheet; in a browser uses the Web Share API when it can send files. */
export async function shareBill(est: Estimate, header: PrintHeader): Promise<void> {
  const blob = await billPdf(est, header);
  const name = billFileName(est, 'pdf');
  if (isNative()) {
    await nativeShareFile({ name, mime: blob.type || 'application/pdf', data: await toBase64(blob) });
    return;
  }
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
    return;
  }
  await saveBlob(name, blob); // no sharing here: the file is downloaded instead
}
