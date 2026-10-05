// Estimate arithmetic. Every rule that depends on how the shop prices jewellery
// reads from EstimatePricing / the item itself — nothing shop-specific is hard-coded here.

import type { Estimate, EstimateItem, EstimatePricing, LabourMode, RateUnit } from './types';

export const WEIGHT_DECIMALS = 3;

export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function ratePerGram(rate: number, unit: RateUnit): number {
  switch (unit) {
    case 'per_gram':
      return num(rate);
    case 'per_10g':
      return num(rate) / 10;
    case 'per_kg':
      return num(rate) / 1000;
  }
}

export function netWeight(item: Pick<EstimateItem, 'grossWt' | 'lessWt'>): number {
  return Math.max(0, round(num(item.grossWt) - num(item.lessWt), WEIGHT_DECIMALS));
}

/** With a 22K gold rate the price is already for 22K gold, so gold counts at 100% (tunch is not asked). */
export const usesTunch = (item: Pick<EstimateItem, 'metal'>, pricing?: Pick<EstimatePricing, 'goldKarat'>): boolean => !(item.metal === 'gold' && pricing?.goldKarat === '22');

/** Pure (fine) metal weight = Net Wt. x Tunch / 100. */
export function fineWeight(item: EstimateItem, pricing?: EstimatePricing): number {
  // Wastage was removed: pure metal weight is Net Wt. x Tunch only. Old saved wastage values are ignored.
  return round((netWeight(item) * (usesTunch(item, pricing) ? num(item.tunch) : 100)) / 100, WEIGHT_DECIMALS);
}

export function labourAmount(item: Pick<EstimateItem, 'grossWt' | 'lessWt' | 'pcs' | 'labourRate' | 'labourMode'>): number {
  const rate = num(item.labourRate);
  const modes: Record<LabourMode, number> = {
    per_gram: netWeight(item) * rate,
    per_piece: num(item.pcs) * rate,
    fixed: rate,
    percent: 0, // needs the metal value: see makingCharge()
  };
  return round(modes[item.labourMode] ?? 0, 2);
}

/**
 * The making charge is one total amount for the item. Older saved items may carry a per-gram or
 * per-piece rate; this turns them into the equivalent total so their price does not change.
 */
export function toFixedMaking<T extends Pick<EstimateItem, 'grossWt' | 'lessWt' | 'pcs' | 'labourRate' | 'labourMode'>>(item: T): T {
  return item.labourMode === 'fixed' || item.labourMode === 'percent' ? item : { ...item, labourRate: labourAmount(item), labourMode: 'fixed' };
}

/**
 * Making charge in rupees: either a percentage of the item's metal value (Gold starts this way)
 * or a rupee amount typed directly (Silver starts this way). The owner can switch either one.
 */
export function makingCharge(item: EstimateItem, pricing: EstimatePricing): number {
  if (item.labourMode === 'percent') return round((metalValue(item, pricing) * num(item.labourRate)) / 100, 2);
  return labourAmount(item);
}

/**
 * Loading saved data: older per-gram / per-piece making charges become a rupee total, so the
 * charge stays the same. Percent and rupee items are left as the owner entered them.
 */
export function normalizeMaking(item: EstimateItem, _pricing?: EstimatePricing): EstimateItem {
  return toFixedMaking(item);
}

/**
 * Changes how an item's making charge is entered (percent of the metal value <-> rupees) and
 * converts the number, so the making charge in rupees stays the same.
 */
export function switchMakingMode(item: EstimateItem, pricing: EstimatePricing, to: 'percent' | 'fixed'): EstimateItem {
  const from = item.labourMode === 'percent' ? 'percent' : 'fixed';
  if (from === to) return { ...item, labourMode: to };
  const rupees = makingCharge(item, pricing);
  if (to === 'fixed') return { ...item, labourMode: 'fixed', labourRate: Math.round(rupees) };
  const value = metalValue(item, pricing);
  return { ...item, labourMode: 'percent', labourRate: value > 0 ? round((rupees / value) * 100, 4) : 0 };
}

export function metalValue(item: EstimateItem, pricing: EstimatePricing): number {
  const rate = item.metal === 'gold'
    ? ratePerGram(pricing.goldRate, pricing.goldRateUnit)
    : ratePerGram(pricing.silverRate, pricing.silverRateUnit);
  return round(fineWeight(item, pricing) * rate, 2);
}

export interface ItemCalc {
  netWt: number;
  fineWt: number;
  labour: number;
  metalValue: number;
  amount: number;
  isOverride: boolean;
}

export function calcItem(item: EstimateItem, pricing: EstimatePricing): ItemCalc {
  const labour = makingCharge(item, pricing);
  const value = metalValue(item, pricing);
  const isOverride = item.amountOverride !== null && Number.isFinite(item.amountOverride);
  return {
    netWt: netWeight(item),
    fineWt: fineWeight(item, pricing),
    labour,
    metalValue: value,
    // Whole rupees: no paise anywhere, so no round-off line is needed.
    amount: isOverride ? Math.round(item.amountOverride as number) : Math.round(value + labour),
    isOverride,
  };
}

export interface EstimateTotals {
  items: ItemCalc[];
  grossWt: number;
  lessWt: number;
  netWt: number;
  pcs: number;
  labour: number;
  fineWt: number;
  itemsAmount: number;
  otherCharges: number;
  subtotal: number;
  gst: number;
  roundOff: number;
  grandTotal: number;
}

export function calcEstimate(est: Pick<Estimate, 'items' | 'otherCharges' | 'pricing'>): EstimateTotals {
  const items = est.items.map((it) => calcItem(it, est.pricing));
  const sum = (f: (i: number) => number) => items.reduce((acc, _, i) => acc + f(i), 0);

  const itemsAmount = sum((i) => items[i].amount);
  const otherCharges = est.otherCharges.reduce((a, c) => a + Math.round(num(c.amount)), 0);
  const subtotal = itemsAmount + otherCharges;
  const gst = est.pricing.gstEnabled ? Math.round((subtotal * num(est.pricing.gstPercent)) / 100) : 0;
  const grandTotal = subtotal + gst;

  return {
    items,
    grossWt: round(sum((i) => num(est.items[i].grossWt)), WEIGHT_DECIMALS),
    lessWt: round(sum((i) => num(est.items[i].lessWt)), WEIGHT_DECIMALS),
    netWt: round(sum((i) => items[i].netWt), WEIGHT_DECIMALS),
    pcs: sum((i) => num(est.items[i].pcs)),
    labour: round(sum((i) => items[i].labour), 2),
    fineWt: round(sum((i) => items[i].fineWt), WEIGHT_DECIMALS),
    itemsAmount,
    otherCharges,
    subtotal,
    gst,
    roundOff: 0, // kept for old callers; amounts are whole rupees now
    grandTotal,
  };
}

export interface ValidationIssue {
  itemId: string | null;
  message: string;
}

/** Problems that must be fixed before an estimate is printed. */
export function validateEstimate(est: Pick<Estimate, 'items' | 'otherCharges' | 'pricing'> & { advance?: number }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (est.items.length === 0) issues.push({ itemId: null, message: 'Add at least one item.' });
  est.items.forEach((it, idx) => {
    const row = `Row ${idx + 1}`;
    if (!it.description.trim()) issues.push({ itemId: it.id, message: `${row}: enter a description.` });
    if (!(num(it.grossWt) > 0)) issues.push({ itemId: it.id, message: `${row}: G. Wt. must be more than 0.` });
    if (num(it.lessWt) < 0) issues.push({ itemId: it.id, message: `${row}: Less Wt. cannot be negative.` });
    if (num(it.lessWt) > num(it.grossWt)) issues.push({ itemId: it.id, message: `${row}: Less Wt. is more than G. Wt.` });
    if (it.metal === 'gold' && it.karat !== undefined && (!(num(it.karat) > 0) || num(it.karat) > 24)) issues.push({ itemId: it.id, message: `${row}: Karat must be between 1 and 24.` });
    if (num(it.tunch) < 0 || num(it.tunch) > 100) issues.push({ itemId: it.id, message: `${row}: Tunch must be between 0 and 100.` });
    if (num(it.pcs) < 0 || !Number.isInteger(num(it.pcs))) issues.push({ itemId: it.id, message: `${row}: Pcs must be a whole number.` });
    if (num(it.labourRate) < 0) issues.push({ itemId: it.id, message: `${row}: Making charge cannot be negative.` });
    if (it.labourMode === 'percent' && num(it.labourRate) > 100) issues.push({ itemId: it.id, message: `${row}: Making charge % cannot be more than 100.` });
    if (it.amountOverride !== null && num(it.amountOverride) < 0) issues.push({ itemId: it.id, message: `${row}: Amount cannot be negative.` });
  });
  est.otherCharges.forEach((c, idx) => {
    if (!c.label.trim()) issues.push({ itemId: null, message: `Other charge ${idx + 1}: enter a name.` });
  });
  if (num(est.advance) < 0) issues.push({ itemId: null, message: 'Amount deposited cannot be negative.' });
  if (num(est.advance) > calcEstimate(est).grandTotal) issues.push({ itemId: null, message: 'Amount deposited is more than the bill total.' });
  if (num(est.pricing.gstPercent) < 0) issues.push({ itemId: null, message: 'GST % cannot be negative.' });
  return issues;
}
