// Shop stock register: every movement of metal / items into or out of the shop.
// The owner adds each IN and OUT by hand; nothing here is linked to saved bills.

import { round, WEIGHT_DECIMALS } from './calc';
import type { Metal } from './types';

export type StockType = 'in' | 'out';

export interface StockEntry {
  id: string;
  /** Calendar date of the movement, YYYY-MM-DD. */
  date: string;
  type: StockType;
  metal: Metal;
  /** The saved product (category) this is, e.g. "Gold Ring – Classic". */
  item: string;
  /** Tunch (purity) percentage of this piece / lot. */
  tunch: number;
  /** Id of the product photo kept on the phone (not stored in this record). */
  photoId?: string;
  /** Weight in grams (always positive; the type says the direction). */
  weight: number;
  pcs: number;
  note: string;
  createdAt: string;
}

export interface StockTotals {
  inWt: number;
  outWt: number;
  /** In minus out. Negative means more went out than was recorded coming in. */
  netWt: number;
  inPcs: number;
  outPcs: number;
  netPcs: number;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export function stockTotals(entries: StockEntry[], metal?: Metal): StockTotals {
  const list = metal ? entries.filter((e) => e.metal === metal) : entries;
  const ins = list.filter((e) => e.type === 'in');
  const outs = list.filter((e) => e.type === 'out');
  const inWt = round(sum(ins.map((e) => num(e.weight))), WEIGHT_DECIMALS);
  const outWt = round(sum(outs.map((e) => num(e.weight))), WEIGHT_DECIMALS);
  const inPcs = sum(ins.map((e) => num(e.pcs)));
  const outPcs = sum(outs.map((e) => num(e.pcs)));
  return { inWt, outWt, netWt: round(inWt - outWt, WEIGHT_DECIMALS), inPcs, outPcs, netPcs: inPcs - outPcs };
}

export interface StockItemRow extends StockTotals {
  metal: Metal;
  item: string;
}

/** Stock per item (same metal + same name, ignoring case), sorted by metal then name. */
export function stockByItem(entries: StockEntry[]): StockItemRow[] {
  const groups = new Map<string, StockEntry[]>();
  for (const e of entries) {
    const key = `${e.metal}|${e.item.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()]
    .map((g) => ({ ...stockTotals(g), metal: g[0].metal, item: g[0].item.trim() || 'Unnamed' }))
    .sort((a, b) => (a.metal === b.metal ? a.item.localeCompare(b.item) : a.metal === 'gold' ? -1 : 1));
}

/** Newest first: by date, then by when it was entered. */
export const sortStock = (entries: StockEntry[]): StockEntry[] =>
  [...entries].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

/** A problem that must be fixed before the entry is saved, or null. */
export function validateStockEntry(e: StockEntry): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Choose the date.';
  if (!e.item.trim()) return 'Choose the item (category) from your saved products.';
  if (num(e.tunch) < 0 || num(e.tunch) > 100) return 'Tunch must be between 0 and 100.';
  if (!(num(e.weight) > 0)) return 'Enter the weight in grams.';
  if (num(e.weight) > 100000) return 'That weight looks too large.';
  if (num(e.pcs) < 0 || !Number.isInteger(num(e.pcs))) return 'Pieces must be a whole number.';
  return null;
}

/** Today's date as YYYY-MM-DD in the phone's own time zone. */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}


// ---------------------------------------------------------------- cash register

export interface CashEntry {
  id: string;
  date: string;
  type: StockType;
  /** Whole rupees, always positive; the type says the direction. */
  amount: number;
  /** Who / what for, e.g. "Sale – Ramesh", "Rent". */
  note: string;
  createdAt: string;
}

export interface CashTotals {
  inAmt: number;
  outAmt: number;
  /** Cash in hand according to the register: in minus out. */
  balance: number;
}

export function cashTotals(entries: CashEntry[]): CashTotals {
  const inAmt = sum(entries.filter((e) => e.type === 'in').map((e) => Math.round(num(e.amount))));
  const outAmt = sum(entries.filter((e) => e.type === 'out').map((e) => Math.round(num(e.amount))));
  return { inAmt, outAmt, balance: inAmt - outAmt };
}

export const sortCash = (entries: CashEntry[]): CashEntry[] =>
  [...entries].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

export function validateCashEntry(e: CashEntry): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Choose the date.';
  if (!(num(e.amount) > 0)) return 'Enter the amount.';
  if (num(e.amount) > 1_000_000_000) return 'That amount looks too large.';
  return null;
}
