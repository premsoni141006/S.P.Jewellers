// Order ID: one per customer, a random 4-digit number. Bills with the same phone number share it.
import type { Estimate } from './types';

type Who = Pick<Estimate, 'customerName' | 'customerPhone'>;

const customerKey = (e: Who): string => {
  const phone = e.customerPhone.replace(/\D/g, '').slice(-10);
  return phone.length >= 5 ? phone : '';
};

/** The Order ID of a bill (older bills without one get a fixed 4-digit number worked out from their bill number). */
export const orderIdOf = (e: Pick<Estimate, 'orderId' | 'number'>): number => e.orderId ?? (e.number > 0 ? 1000 + ((e.number * 7919) % 9000) : 0);

/** Order ID for a bill being saved: the customer's existing one, otherwise a random 4-digit number nobody has. */
export function assignOrderId(est: Estimate, saved: Estimate[], rand: () => number = Math.random): number {
  if (est.orderId) return est.orderId;
  const key = customerKey(est);
  if (key) {
    const same = saved.find((x) => x.id !== est.id && customerKey(x) === key);
    if (same) return orderIdOf(same);
  }
  const used = new Set(saved.map(orderIdOf));
  let id = 1000 + Math.floor(rand() * 9000);
  while (used.has(id)) id = id >= 9999 ? 1000 : id + 1;
  return id;
}
