// Search saved bills ("old orders") by customer name, phone number, address, item name,
// item weight, total amount, bill number or date. Every word typed must match something on the
// bill, so more words narrow the result.

import { calcEstimate, netWeight } from './calc';
import { fmtWeight } from './format';
import type { CashEntry, StockEntry } from './stock';
import type { Estimate } from './types';

const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_LONG = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A date in every way an owner might type it, e.g. "03 oct 2026", "3/10/2026", "2026-10-03". */
function dateForms(iso: string): string[] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [];
  const day = d.getDate(), month = d.getMonth(), year = d.getFullYear();
  return [
    `${pad(day)} ${MONTHS_SHORT[month]} ${year}`,
    `${day} ${MONTHS_SHORT[month]} ${year}`,
    `${pad(day)} ${MONTHS_LONG[month]} ${year}`,
    `${year}-${pad(month + 1)}-${pad(day)}`,
    `${pad(day)}/${pad(month + 1)}/${year}`,
    `${day}/${month + 1}/${year}`,
    `${pad(day)}-${pad(month + 1)}-${year}`,
    `${day}-${month + 1}-${year}`,
  ];
}

const trimmedNumber = (n: number): string => String(Math.round(n * 1000) / 1000);
const withCommas = (n: number): string => new Intl.NumberFormat('en-IN').format(n);

/** Everything about a bill that can be searched, lower-cased, in one string. */
export function searchText(e: Estimate): string {
  const total = calcEstimate(e).grandTotal;
  const parts: string[] = [];
  if (e.number > 0) parts.push(`e-${pad(e.number, 4)}`, pad(e.number, 4), String(e.number));
  parts.push(e.billStatus === 'pending' ? 'pending' : 'clear'); // bills without a mark are green = clear
  parts.push(e.customerName, e.customerPhone, e.customerPhone.replace(/\D/g, ''), e.customerLocality ?? '');
  for (const it of e.items) {
    parts.push(it.description, it.metal);
    for (const w of [it.grossWt, netWeight(it)]) if (w > 0) parts.push(fmtWeight(w), trimmedNumber(w));
  }
  parts.push(String(total), withCommas(total), `₹${withCommas(total)}`);
  parts.push(...dateForms(e.createdAt), ...dateForms(e.updatedAt));
  return parts.join(' | ').toLowerCase();
}

/** "₹9,214" -> "9214"; words are lower-cased. */
const normalizeToken = (t: string): string => t.toLowerCase().replace(/[₹,]/g, '').trim();

export function matchesQuery(e: Estimate, query: string, text: string = searchText(e)): boolean {
  const tokens = query.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return true;
  // A date typed with spaces ("3 oct 2026") must also match as one phrase.
  const phrase = query.toLowerCase().replace(/[₹,]/g, '').replace(/\s+/g, ' ').trim();
  if (phrase && text.includes(phrase)) return true;
  return tokens.every((t) => text.includes(t));
}

/** Matching bills, newest first. An empty query returns nothing (the caller shows its normal screen). */
export function searchEstimates(list: Estimate[], query: string): Estimate[] {
  if (!query.trim()) return [];
  return list
    .filter((e) => matchesQuery(e, query))
    .sort((a, b) => b.number - a.number);
}

/** Saved products whose name (or tunch) matches every word typed. An empty query returns nothing. */
export function searchProducts<T extends { name: string; tunch: number }>(products: T[], query: string): T[] {
  const tokens = query.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return [];
  return products.filter((p) => {
    if (!p.name.trim()) return false;
    const text = `${p.name} ${p.tunch}`.toLowerCase();
    return tokens.every((t) => text.includes(t));
  });
}


// ---------------------------------------------------------------- shop stock register

/** Everything about a stock entry that can be searched: item, metal, weight, tunch, pieces, note, date. */
export function stockSearchText(e: StockEntry): string {
  const parts = [e.item, e.metal, e.note, ...dateForms(`${e.date}T12:00:00`)];
  if (e.weight > 0) parts.push(fmtWeight(e.weight), trimmedNumber(e.weight));
  if (e.tunch > 0) parts.push(trimmedNumber(e.tunch));
  if (e.pcs > 0) parts.push(`${e.pcs} pcs`, String(e.pcs));
  return parts.join(' | ').toLowerCase();
}

/** Cash entries: amount (with or without commas / rupee sign), note, date. */
export function cashSearchText(e: CashEntry): string {
  const amt = Math.round(e.amount);
  return [e.note, String(amt), withCommas(amt), `₹${withCommas(amt)}`, ...dateForms(`${e.date}T12:00:00`)].join(' | ').toLowerCase();
}

function matchText(text: string, query: string): boolean {
  const tokens = query.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return true;
  const phrase = query.toLowerCase().replace(/[₹,]/g, '').replace(/\s+/g, ' ').trim();
  return text.includes(phrase) || tokens.every((t) => text.includes(t));
}

/** Entries that match every word typed (an empty query keeps all), original order. */
export const searchStock = (list: StockEntry[], query: string): StockEntry[] => list.filter((e) => matchText(stockSearchText(e), query));
export const searchCash = (list: CashEntry[], query: string): CashEntry[] => list.filter((e) => matchText(cashSearchText(e), query));
