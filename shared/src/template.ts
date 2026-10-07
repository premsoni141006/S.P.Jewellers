// The printed estimate. This one HTML template is used for the on-screen preview,
// the PDF, the Windows printer job (desktop), Android printing (app) and browser printing
// (website), so every output is laid out by the same markup and the same CSS.
//
// Layout follows the shop's sample: SP_Jewellers_Simple_Demo_Estimate_v2.pdf.

import { calcEstimate, ratePerGram } from './calc';
import { orderIdOf } from './orderId';
import { balanceLeft, paymentModeText, paymentsOf, submittedRate, submittedWeight } from './payments';
import { fmtDate, fmtDateTime, fmtDayDateTime, fmtOrderId, fmtPcs, fmtPercent, fmtRupeeCell, fmtWeight } from './format';
import { LOGO_ASPECT, LOGO_BW_DATA_URI } from './logo';
import type { Estimate } from './types';

export interface PrintHeader {
  shopName: string;
  shopCode: string;
  /** Owner's name: printed at the top right of the bill. */
  ownerName?: string;
  /** Owner's mobile number: printed under the owner's name. */
  ownerPhone?: string;
  /** Shop address: printed under the shop name. */
  address?: string;
  /** A line under the shop name, above the address (what the shop makes / sells). */
  tagline?: string;
  /** Older single-line form "Name · M. number"; only used when ownerName / ownerPhone are not given. */
  ownerLine?: string;
  /** Print the black-and-white shop logo above the shop name (A4 only). Default off for callers that omit it. */
  logo?: boolean | string;
  /** More than one owner: each is printed as "Name  M.: number" at the right of the address line. */
  owners?: Array<{ name: string; phone: string }>;
}

/** The printed columns — in order, and nothing else (wastage was removed; the charge is "Making"). */
export const PRINT_COLUMNS = [
  'Description',
  'G. Wt.',
  'Less Wt.',
  'Net Wt.',
  'Pcs',
  'Making',
  'Silver/Gold',
  'Amount',
] as const;

/** The bill always shows at least this many item rows (blank rows fill the rest); more items = more rows. */

/** Making charge as printed: a % when the item's making is entered as a percentage (gold), rupees otherwise. */
export function makingText(it: { labourMode: string; labourRate: number }, labour: number): string {
  return it.labourMode === 'percent' ? `${fmtPercent(it.labourRate)}%` : fmtRupeeCell(labour);
}

export const MIN_PRINT_ROWS = 5;

// Column widths in millimetres (proportions of the sample); they add up to the 190 mm
// between the 10 mm A4 margins.
const COL_MM = [68, 15, 15, 15, 11, 20, 22, 24]; // Description, G, Less, Net, Pcs, Making, Silver/Gold, Amount // no Tunch column; separate Silver and Gold rate columns

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Rate per 10 grams of a metal, as printed on the bill, e.g. "₹2,310 / 10 g". */
export function bhavText(est: Estimate, metal: 'silver' | 'gold'): string {
  const p = est.pricing;
  const perGram = metal === 'gold' ? ratePerGram(p.goldRate, p.goldRateUnit) : ratePerGram(p.silverRate, p.silverRateUnit);
  return `${fmtRupeeCell(perGram * 10)} / 10 g`;
}

/** The metals actually bought on this estimate: silver first, then gold; only those that appear. */
export function metalsBought(est: Pick<Estimate, 'items'>): Array<'silver' | 'gold'> {
  return (['silver', 'gold'] as const).filter((m) => est.items.some((i) => i.metal === m));
}

export const metalName = (m: 'silver' | 'gold'): string => (m === 'gold' ? 'Gold' : 'Silver');

/** Kept for older callers. */
export function silverRateText(est: Estimate): string {
  return `${fmtRupeeCell(ratePerGram(est.pricing.silverRate, est.pricing.silverRateUnit))}/g`;
}

const A4_CSS = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; }
body {
  font-family: Arial, "Segoe UI", "Helvetica Neue", Helvetica, sans-serif;
  font-size: 9pt; line-height: 1.2;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sheet { width: 190mm; }
/* Top row: ESTIMATE in the middle, owner name and mobile at the right */
.top { display: grid; grid-template-columns: 1fr; justify-items: center; align-items: start; margin-bottom: 1mm; position: relative; top: 4mm; } /* sits 4 mm lower, nearer the shop name; the rest of the page does not move */
.estimate-title { font-size: 11pt; font-weight: 700; text-decoration: underline; letter-spacing: 0.5pt; text-align: center; }
.top-right { display: flex; flex-direction: column; align-items: flex-end; font-size: 9.5pt; line-height: 1.25; }
/* Brand row: logo at the far left, shop name in the middle */
/* the shop name sits 4.2 mm lower, which is real space now (the tagline and the address follow it) */
.brand { display: grid; grid-template-columns: 24mm 1fr 24mm; align-items: center; margin-top: 4.2mm; position: relative; top: 2.5mm; } /* the name and logo sit a little lower, nearer the tagline (visual only) */
.brand-logo { justify-self: start; position: relative; top: 2mm; left: 10mm; } /* the logo's visual centre lines up with the middle of the shop name */
.logo { display: block; height: 18.4mm; width: auto; } /* 15 % bigger than before (16 mm) */
.logo.custom { max-width: 27.6mm; object-fit: contain; filter: grayscale(1) contrast(1.35); } /* an uploaded logo prints in black and white */
.shop { text-align: center; font-size: 23pt; font-weight: 700; letter-spacing: 0.06em; font-family: Georgia, "Times New Roman", "Noto Serif", serif; } /* the same serif the app uses for the shop name */
.address-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 3mm; margin: 0 0 3mm; }
.address-col { text-align: center; }
.tagline { font-size: 10pt; font-weight: 400; }
.address { text-align: center; font-size: 9.5pt; }
.code { text-align: center; font-size: 9.5pt; margin: 0 0 2mm; }
/* First row of the table: customer + mobile (left, 7 columns); bill number + date (right, starting at Silver/Gold) */
/* the labels are right-aligned in a fixed column, so every colon lines up above the next */
.mr { display: grid; grid-template-columns: 18mm 1fr; column-gap: 1.5mm; align-items: baseline; }
.meta-r .mr { grid-template-columns: 16mm 1fr; }
.mr .k { text-align: right; }
tr.meta-row td { text-align: left; white-space: normal; height: auto; padding: 1.6mm 2mm; font-size: 9.5pt; line-height: 1.4; font-variant-numeric: normal; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; }
/* One box around the whole bill: header, table and thank-you. */
.frame { border: 1pt solid #000; padding: 2mm; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
th, td { border: 0.75pt solid #000; padding: 0 1.4mm; height: 7mm; vertical-align: middle; font-size: 8.5pt; }
th { background: #f0f0f0; font-weight: 700; text-align: center; font-size: 8pt; white-space: nowrap; padding: 0 0.6mm; }
td { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
td.d { text-align: left; white-space: normal; overflow-wrap: anywhere; }
td.r { text-align: right; }
tr.sum td { text-align: right; }
tr.sum td.lbl { text-align: left; }
tr.sum td.mid { text-align: center; }
tr.grand td { background: #f0f0f0; font-weight: 700; }
.note { font-size: 8pt; margin-top: 2mm; }
.foot { margin-top: 5mm; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 4mm; page-break-inside: avoid; break-inside: avoid; }
.foot-rates { text-align: left; font-size: 7.2pt; line-height: 1.5; padding-bottom: 3mm; } /* 20 % smaller than 9 pt, lifted a little off the bottom edge */
.foot-rates div { white-space: nowrap; }
.thanks { text-align: center; }
.thanks-main { font-size: 12pt; font-weight: 700; }
.thanks-sub { font-size: 9.5pt; margin-top: 1mm; }
@media screen {
  html { background: #d6d6d6; }
  body { padding: 24px 0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
}
`;

function ownerOf(h: PrintHeader): { name: string; phone: string } {
  if (h.ownerName || h.ownerPhone) return { name: (h.ownerName ?? '').trim(), phone: (h.ownerPhone ?? '').trim() };
  const m = /^(.*?)\s*·\s*M\.\s*(.*)$/.exec(h.ownerLine ?? '');
  return m ? { name: m[1].trim(), phone: m[2].trim() } : { name: (h.ownerLine ?? '').trim(), phone: '' };
}

/** Everyone to print at the right of the address: the owners list, or the single owner. */
function ownersOf(h: PrintHeader): Array<{ name: string; phone: string }> {
  const list = (h.owners ?? []).map((o) => ({ name: o.name.trim(), phone: o.phone.trim() })).filter((o) => o.name || o.phone);
  return list.length ? list : [ownerOf(h)];
}

/** The top of the bill: ESTIMATE, owner name + mobile (right), logo (left), shop name (middle), address. */
function headerHtml(h: PrintHeader, withLogo = true, title = 'ESTIMATE'): string {
  const owners = ownersOf(h);
  const logo = withLogo && h.logo
    ? (typeof h.logo === 'string'
      ? `<img class="logo custom" src="${h.logo}" height="18.4mm" alt="">`
      : `<img class="logo" src="${LOGO_BW_DATA_URI}" width="${Math.round(18.4 * LOGO_ASPECT * 10) / 10}mm" height="18.4mm" alt="">`)
    : '';
  const right = owners.length > 1
    ? owners.map((o) => `<span>${o.name ? `<b>${escapeHtml(o.name)}</b>` : ''}${o.phone ? ` M.: ${escapeHtml(o.phone)}` : ''}</span>`).join('')
    : `${owners[0].name ? `<b>${escapeHtml(owners[0].name)}</b>` : ''}${owners[0].phone ? `<span>M.: ${escapeHtml(owners[0].phone)}</span>` : ''}`;
  const address = (h.address ?? '').trim();
  const tagline = (h.tagline ?? '').trim();
  return `<div class="top"><span class="estimate-title">${escapeHtml(title)}</span></div>
<div class="brand"><span class="brand-logo">${logo}</span><div class="shop">${escapeHtml(h.shopName)}</div><span></span></div>
<div class="address-row"><span></span><div class="address-col">${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ''}<div class="address">${escapeHtml(address)}</div></div><span class="top-right">${right}</span></div>${h.shopCode.trim() ? `<div class="code">${escapeHtml(h.shopCode)}</div>` : ''}`;
}

/** Compact top of the narrow receipt: same facts as the A4 bill, stacked. */
function receiptHeaderHtml(est: Estimate, h: PrintHeader): string {
  const no = fmtOrderId(orderIdOf(est));
  const owner = ownersOf(h).map((o) => [o.name, o.phone ? `M.: ${o.phone}` : ''].filter(Boolean).join(' · ')).filter(Boolean).join(' · ');
  return `<div class="estimate">ESTIMATE</div><div class="shop">${escapeHtml(h.shopName)}</div>${(h.tagline ?? '').trim() ? `<div class="code">${escapeHtml((h.tagline as string).trim())}</div>` : ''}${(h.address ?? '').trim() ? `<div class="code">${escapeHtml((h.address as string).trim())}</div>` : ''}${owner ? `<div class="owner-line">${escapeHtml(owner)}</div>` : ''}
<div class="rmeta"><div>Order ID: <b>${escapeHtml(no)}</b></div><div>Date: <b>${escapeHtml(fmtDate(est.createdAt))}</b></div><div>Customer: <b>${escapeHtml(est.customerName.trim())}</b></div><div>Mobile: <b>${escapeHtml(est.customerPhone.trim())}</b></div></div>`;
}

/** 10, 10.5, 0.05: a weight as written in a line of text (no trailing zeros). */
const wtText = (w: number): string => `${Math.round(w * 1000) / 1000} g`;

/** Under the table: the silver and gold prices (bottom left) and a thank-you (no shop name, no estimate note). */
function footHtml(est: Estimate): string {
  // Silver and gold price, two rows in the bottom-left corner; the thank-you stays in the middle.
  return `<div class="foot"><div class="foot-rates"><div>Silver: ${escapeHtml(bhavText(est, 'silver'))}</div><div>Gold: ${escapeHtml(bhavText(est, 'gold'))}</div></div>
<div class="thanks"><div class="thanks-main">Thank you for visiting!</div>
<div class="thanks-sub">It was a pleasure serving you. Please visit us again.</div></div><span></span></div>`;
}

/** One big first row of the table: customer + mobile on the left, bill number + date in the last two columns. */
function metaRowHtml(est: Estimate): string {
  const no = fmtOrderId(orderIdOf(est));
  return `<tr class="meta-row"><td colspan="6" class="meta-l"><div class="mr"><span class="k">Customer:</span><b>${escapeHtml(est.customerName.trim())}</b></div><div class="mr"><span class="k">Mobile:</span><b>${escapeHtml(est.customerPhone.trim())}</b></div></td><td colspan="2" class="meta-r"><div class="mr"><span class="k">Order ID:</span><b>${escapeHtml(no)}</b></div><div class="mr"><span class="k">Date:</span><b>${escapeHtml(fmtDate(est.createdAt))}</b></div></td></tr>`;
}

export interface RenderOptions {
  /** Small line under the table, e.g. for the test estimate. */
  note?: string;
}

export function renderEstimateHtml(est: Estimate, header: PrintHeader, opts: RenderOptions = {}): string {
  const t = calcEstimate(est);
  const p = est.pricing;

  const rows = est.items.map((it, i) => {
    const c = t.items[i];
    return `<tr>
<td class="d">${escapeHtml(it.description)}</td>
<td>${fmtWeight(it.grossWt)}</td>
<td>${fmtWeight(it.lessWt)}</td>
<td>${fmtWeight(c.netWt)}</td>
<td>${fmtPcs(it.pcs)}</td>
<td>${makingText(it, c.labour)}</td>
<td>${metalName(it.metal)}</td>
<td class="r">${fmtRupeeCell(c.amount)}</td>
</tr>`;
  });
  for (let i = est.items.length; i < MIN_PRINT_ROWS; i++) rows.push(`<tr>${'<td></td>'.repeat(8)}</tr>`);

  const sum = (label: string, mid: string, value: string, cls = '') =>
    `<tr class="sum ${cls}"><td class="lbl" colspan="6">${label}</td><td class="mid">${mid}</td><td>${value}</td></tr>`;
  const summary = [
    ...est.otherCharges.map((c) => sum(escapeHtml(c.label.toUpperCase()), '', fmtRupeeCell(c.amount))),
    ...(p.gstEnabled ? [sum(`GST ${fmtPercent(p.gstPercent)}%`, '', fmtRupeeCell(t.gst))] : []),
    // The gold / silver the customer submitted: valued at the rate typed for it and cut from the bill.
    ...(['silver', 'gold'] as const).filter((m) => t.submittedCredit[m] > 0).map((m) => sum(`Submitted ${wtText(submittedWeight(est, m))} ${m} @ ${fmtRupeeCell(submittedRate(est, m))} / 10 g`, '', `−${fmtRupeeCell(t.submittedCredit[m])}`)),
    sum('TOTAL', '', fmtRupeeCell(t.grandTotal), 'grand'),
    // Money received so far (each with its day and date) and what is left.
    ...(paymentsOf(est).length
      ? [...paymentsOf(est).map((pay) => sum(`Paid · ${paymentModeText(pay) ? `${escapeHtml(paymentModeText(pay))} · ` : ''}${escapeHtml(fmtDayDateTime(pay.at))}`, '', fmtRupeeCell(pay.amount))), sum('BALANCE', '', fmtRupeeCell(balanceLeft(est)), 'grand')]
      : []),
  ].join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Estimate</title><style>${A4_CSS}</style></head>
<body><div class="sheet"><div class="frame">
${headerHtml(header)}
<table>
<colgroup>${COL_MM.map((w) => `<col style="width:${Math.round((w / 190) * 10000) / 100}%">`).join('')}</colgroup>
<thead>${metaRowHtml(est)}<tr>${PRINT_COLUMNS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows.join('')}${summary}</tbody>
</table>
${opts.note ? `<div class="note">${escapeHtml(opts.note)}</div>` : ''}
${footHtml(est)}
</div></div></body></html>`;
}

/** Printed by "Test Print" on a document (A4) printer. */
export function renderTestPageHtml(header: PrintHeader, printerName: string, when: Date = new Date()): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Printer test</title><style>${A4_CSS}
.msg { text-align: center; font-size: 16pt; font-weight: 700; margin-top: 12mm; }
.meta { text-align: center; font-size: 11pt; margin-top: 4mm; }
.box { border: 0.75pt solid #000; margin-top: 12mm; padding: 4mm; font-size: 9pt; text-align: center; }
</style></head><body><div class="sheet">
${headerHtml(header, true, 'PRINTER TEST')}
<div class="msg">Printer Test Successful</div>
<div class="meta">${escapeHtml(fmtDateTime(when.toISOString()))}</div>
<div class="meta">Printer: ${escapeHtml(printerName)}</div>
<div class="box">If this page is centred with all four edges of this box visible, A4 alignment is correct.</div>
</div></body></html>`;
}

/**
 * Narrow version for thermal (ESC/POS) printers. Same header, same ten columns in the same
 * order; each item takes three short rows so the numbers stay readable on 58/80 mm paper.
 * `widthPx` is the printer's dot width; the page is rendered 1 CSS px = 1 dot.
 */
export function renderReceiptHtml(est: Estimate, header: PrintHeader, widthPx: number): string {
  const t = calcEstimate(est);
  const p = est.pricing;
  const big = widthPx >= 500;
  const fs = big ? 20 : 15;

  const cell = (label: string, value: string) => `<td><div class="l">${label}</div><div class="v">${value}</div></td>`;
  const items = est.items
    .map((it, i) => {
      const c = t.items[i];
      return `<table class="it">
<tr><td colspan="4" class="d">${escapeHtml(it.description)}</td></tr>
<tr>${cell('G. Wt.', fmtWeight(it.grossWt))}${cell('Less Wt.', fmtWeight(it.lessWt))}${cell('Net Wt.', fmtWeight(c.netWt))}${cell('Pcs', fmtPcs(it.pcs))}</tr>
<tr>${cell('Making', makingText(it, c.labour))}${cell('Silver/Gold', metalName(it.metal))}<td colspan="3"><div class="l">Amount</div><div class="v b">${fmtRupeeCell(c.amount)}</div></td></tr>
</table>`;
    })
    .join('');

  const line = (k: string, v: string, cls = '') => `<div class="row ${cls}"><span>${escapeHtml(k)}</span><span>${v}</span></div>`;
  const sums = [
    ...metalsBought(est).map((m) => line(`${metalName(m)} Rate`, bhavText(est, m))),
    ...est.otherCharges.map((c) => line(c.label.toUpperCase(), fmtRupeeCell(c.amount))),
    ...(p.gstEnabled ? [line(`GST ${fmtPercent(p.gstPercent)}%`, fmtRupeeCell(t.gst))] : []),
    ...(['silver', 'gold'] as const).filter((m) => t.submittedCredit[m] > 0).map((m) => line(`Submitted ${wtText(submittedWeight(est, m))} ${m}`, `−${fmtRupeeCell(t.submittedCredit[m])}`)),
    line('TOTAL', fmtRupeeCell(t.grandTotal), 'grand'),
    ...(paymentsOf(est).length
      ? [...paymentsOf(est).map((pay) => line(`Paid ${paymentModeText(pay) ? `${paymentModeText(pay)} ` : ''}${fmtDayDateTime(pay.at)}`, fmtRupeeCell(pay.amount))), line('BALANCE', fmtRupeeCell(balanceLeft(est)), 'grand')]
      : []),
  ].join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; width: ${widthPx}px; }
body { font-family: Arial, "Segoe UI", sans-serif; font-size: ${fs}px; line-height: 1.2; padding: 0 ${big ? 6 : 4}px; }
.shop { text-align: center; font-size: ${Math.round(fs * 1.6)}px; font-weight: 700; font-family: Georgia, "Times New Roman", "Noto Serif", serif; }
.code { text-align: center; font-size: ${Math.round(fs * 0.95)}px; margin: 2px 0 8px; }
.thanks-r { text-align: center; font-weight: 700; margin: 8px 0 4px; font-size: ${fs}px; }
.owner-line { text-align: center; font-weight: 700; font-size: ${Math.round(fs * 0.95)}px; margin: 2px 0 8px; }
.estimate { text-align: center; font-weight: 700; text-decoration: underline; font-size: ${Math.round(fs * 0.95)}px; margin-bottom: 2px; }
.rmeta { margin-bottom: 8px; }
.rmeta div { padding: 1px 0; }
.cust { margin-bottom: 6px; }
table.it { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: -2px; }
table.it td { border: 2px solid #000; padding: 2px 4px; vertical-align: top; }
td.d { font-weight: 700; }
.l { font-size: ${Math.round(fs * 0.72)}px; }
.v { text-align: right; font-variant-numeric: tabular-nums; }
.b { font-weight: 700; }
.sum { margin-top: 10px; }
.row { display: flex; justify-content: space-between; padding: 2px 0; }
.grand { border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: 700; font-size: ${Math.round(fs * 1.2)}px; padding: 4px 0; margin-top: 4px; }
</style></head><body>
${receiptHeaderHtml(est, header)}
${items}
<div class="sum">${sums}</div>
<div class="thanks-r">Thank you for visiting!<br>Please visit us again.</div>
</body></html>`;
}
