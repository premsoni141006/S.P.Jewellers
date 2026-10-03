import type { LabourMode, RateUnit } from './types';

// Money is shown in whole rupees (no paise).
const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtMoney = (n: number): string => money.format(Number.isFinite(n) ? n : 0);
export const fmtRupees = (n: number): string => `₹ ${fmtMoney(n)}`;

/** Printed money cells: whole rupees, e.g. "₹40,038". */
export const fmtRupeeCell = (n: number): string => `₹${money.format(Number.isFinite(n) ? n : 0)}`;
/** Pcs as printed: just the number. */
export const fmtPcs = (pcs: number): string => String(pcs);
export const fmtWeight = (n: number): string => (Number.isFinite(n) ? n : 0).toFixed(3);

/** Percentages: drop trailing zeros (91.60 → 91.6, 5.00 → 5). */
export const fmtPercent = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return String(Math.round(v * 100) / 100);
};

/** Blank instead of 0 in printed cells that are genuinely empty (e.g. no less weight). */
export const blankIfZero = (n: number, f: (n: number) => string): string => (n === 0 ? '' : f(n));

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  per_gram: 'per gram',
  per_10g: 'per 10 g',
  per_kg: 'per kg',
};

export const LABOUR_MODE_LABEL: Record<LabourMode, string> = {
  per_gram: 'per gram (net)',
  per_piece: 'per piece',
  fixed: 'fixed per line',
  percent: '% of metal value',
};

export const LABOUR_MODE_SHORT: Record<LabourMode, string> = {
  per_gram: '/g',
  per_piece: '/pc',
  fixed: 'fix',
  percent: '%',
};

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const fmtEstimateNo = (n: number): string => (n > 0 ? `E-${String(n).padStart(4, '0')}` : 'Unsaved');
