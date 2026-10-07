// Payments against a bill: how much the customer has given and how much is left. Records are never
// edited or removed; until the bill is marked Clear the owner can only add more.

import { calcEstimate, ratePerGram } from './calc';
import { fmtRupeeCell } from './format';
import type { Estimate, GoldPayment, Metal, Payment, SilverPayment } from './types';

export const paymentsOf = (est: Pick<Estimate, 'payments'>): Payment[] => [...(est.payments ?? [])].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

export const paidTotal = (est: Pick<Estimate, 'payments'>): number => (est.payments ?? []).reduce((s, p) => s + Math.round(p.amount), 0);

/** What the customer still owes: the bill total minus everything paid so far (never below 0). */
export const balanceLeft = (est: Estimate): number => Math.max(0, calcEstimate(est).grandTotal - paidTotal(est));

/** A problem with adding this payment, or null when it is fine. */
export function validatePayment(est: Estimate, amount: number, opts: { unsaved?: boolean; reserved?: number } = {}): string | null {
  if (est.number <= 0 && !opts.unsaved) return 'Save the bill first.';
  if (est.billStatus === 'clear') return 'This bill is Clear; it cannot be changed.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter the amount received.';
  if (!Number.isInteger(amount)) return 'Enter whole rupees.';
  const left = Math.max(0, balanceLeft(est) - Math.round(opts.reserved ?? 0));
  if (amount > left) return `Only ₹${left.toLocaleString('en-IN')} is left on this bill.`;
  return null;
}

/** The bill with one more payment (a new record; earlier ones are untouched). */
export function withPayment(est: Estimate, amount: number, id: string, at: string, extra: Pick<Payment, 'mode' | 'gold' | 'silver'> = {}): Estimate {
  return { ...est, payments: [...(est.payments ?? []), { id, amount: Math.round(amount), at, ...extra }], updatedAt: at };
}

/** What old gold is worth: weight x purity x (1 - cut %) x rate per gram, in whole rupees. */
export function goldPaymentValue(g: Pick<GoldPayment, 'weight' | 'purity' | 'rate' | 'cutPct'>): number {
  const w = Number.isFinite(g.weight) ? g.weight : 0;
  const fine = w * (g.purity / 100) * (1 - Math.min(100, Math.max(0, g.cutPct || 0)) / 100);
  return Math.round(fine * (g.rate / 10));
}

/** What old silver is worth: weight x tunch % x (1 - cut %) x rate per gram, in whole rupees. */
export function silverPaymentValue(s: Pick<SilverPayment, 'weight' | 'tunch' | 'rate' | 'cutPct'>): number {
  return goldPaymentValue({ weight: s.weight, purity: s.tunch, rate: s.rate, cutPct: s.cutPct });
}

/** Rupees per 10 g the submitted metal is valued at: the rate typed for it, otherwise the bill's own rate. */
export function submittedRate(est: Pick<Estimate, 'submitted' | 'pricing'>, metal: Metal): number {
  const own = est.submitted?.[metal === 'gold' ? 'goldRate' : 'silverRate'];
  if (typeof own === 'number' && own > 0) return own;
  const p = est.pricing;
  return Math.round((metal === 'gold' ? ratePerGram(p.goldRate, p.goldRateUnit) : ratePerGram(p.silverRate, p.silverRateUnit)) * 10);
}

/** Grams of this metal the customer submitted when the bill was made. Metal handed in later is a payment, not counted here. */
export function submittedWeight(est: Pick<Estimate, 'submitted'>, metal: Metal): number {
  return Math.round(Math.max(0, est.submitted?.[metal] ?? 0) * 1000) / 1000;
}

/** Total gross weight of the items of this metal on the bill. */
export function grossWeightOf(est: Pick<Estimate, 'items'>, metal: Metal): number {
  return Math.round(est.items.filter((i) => i.metal === metal).reduce((sum, i) => sum + (Number.isFinite(i.grossWt) ? i.grossWt : 0), 0) * 1000) / 1000;
}

/** Metals to show a net-weight row for: only those the customer actually handed in (no row when nothing was submitted). */
export function weightMetals(est: Pick<Estimate, 'items' | 'submitted'>): Metal[] {
  return (['gold', 'silver'] as const).filter((m) => submittedWeight(est, m) > 0);
}

/** Net weight of a metal = gross weight on the bill - weight submitted by the customer (never below 0). */
export function netMetalWeight(est: Pick<Estimate, 'items' | 'submitted'>, metal: Metal): number {
  return Math.max(0, Math.round((grossWeightOf(est, metal) - submittedWeight(est, metal)) * 1000) / 1000);
}

/** How a payment reads on the bill: "Submitted gold 5.2 g", "UPI", "Cash", or nothing for older payments. */
export function paymentModeText(p: Payment): string {
  if (p.mode === 'gold' && p.gold) return `Submitted gold ${Math.round(p.gold.weight * 1000) / 1000} g @ ${fmtRupeeCell(p.gold.rate)} / 10 g`; // the karat is not printed (it is set in Settings / Rates)
  if (p.mode === 'silver' && p.silver) return `Submitted silver ${Math.round(p.silver.weight * 1000) / 1000} g @ ${fmtRupeeCell(p.silver.rate)} / 10 g`;
  if (p.mode === 'upi') return 'UPI';
  if (p.mode === 'cash') return 'Cash';
  return '';
}

/**
 * The amount typed in the bill's "deposited" card becomes a real payment record (stamped with `at`).
 * Returns the bill unchanged when nothing was deposited.
 */
export function settleAdvance(est: Estimate, id: string, at: string): Estimate {
  const amount = Math.round(est.advance ?? 0);
  const { advance: _advance, ...rest } = est;
  if (amount <= 0) return rest;
  return { ...rest, payments: [...(est.payments ?? []), { id, amount, at }] };
}
