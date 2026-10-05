// Payments against a bill: how much the customer has given and how much is left. Records are never
// edited or removed; until the bill is marked Clear the owner can only add more.

import { calcEstimate } from './calc';
import type { Estimate, Payment } from './types';

export const paymentsOf = (est: Pick<Estimate, 'payments'>): Payment[] => [...(est.payments ?? [])].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

export const paidTotal = (est: Pick<Estimate, 'payments'>): number => (est.payments ?? []).reduce((s, p) => s + Math.round(p.amount), 0);

/** What the customer still owes: the bill total minus everything paid so far (never below 0). */
export const balanceLeft = (est: Estimate): number => Math.max(0, calcEstimate(est).grandTotal - paidTotal(est));

/** A problem with adding this payment, or null when it is fine. */
export function validatePayment(est: Estimate, amount: number): string | null {
  if (est.number <= 0) return 'Save the bill first.';
  if (est.billStatus === 'clear') return 'This bill is Clear; it cannot be changed.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter the amount received.';
  if (!Number.isInteger(amount)) return 'Enter whole rupees.';
  const left = balanceLeft(est);
  if (amount > left) return `Only ₹${left.toLocaleString('en-IN')} is left on this bill.`;
  return null;
}

/** The bill with one more payment (a new record; earlier ones are untouched). */
export function withPayment(est: Estimate, amount: number, id: string, at: string): Estimate {
  return { ...est, payments: [...(est.payments ?? []), { id, amount: Math.round(amount), at }], updatedAt: at };
}
