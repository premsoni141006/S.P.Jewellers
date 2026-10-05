// Cloud sync: pure merge rules (no network). Two phones, or the website and a phone, each hold a copy of
// the shop's records; the cloud holds the third. Merging means nothing is lost: records are joined by id.

import type { Estimate } from './types';

/** Joins two lists of records by id. When both have the same id, the one with the later stamp wins (a tie keeps `local`). */
export function mergeById<T extends { id: string }>(local: T[], remote: T[], stamp: (x: T) => string): T[] {
  const out = new Map<string, T>();
  for (const r of remote) out.set(r.id, r);
  for (const l of local) {
    const r = out.get(l.id);
    out.set(l.id, r && stamp(r) > stamp(l) ? r : l);
  }
  return [...out.values()];
}

/**
 * Two devices may each have handed out the same bill number. The older bill keeps the number, the other one
 * gets the next free number (and a fresh updatedAt, so the change travels to every device).
 */
export function fixBillNumbers(list: Estimate[], now: string = new Date().toISOString()): Estimate[] {
  const byNo = new Map<number, Estimate[]>();
  for (const e of list) if (e.number > 0) byNo.set(e.number, [...(byNo.get(e.number) ?? []), e]);
  let next = list.reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const renumbered = new Map<string, number>();
  for (const group of byNo.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const e of sorted.slice(1)) renumbered.set(e.id, next++);
  }
  if (renumbered.size === 0) return list;
  return list.map((e) => (renumbered.has(e.id) ? { ...e, number: renumbered.get(e.id) as number, updatedAt: now } : e));
}

/** Highest bill number in use, so the next one is always free. */
export const maxBillNumber = (list: Estimate[]): number => list.reduce((m, e) => Math.max(m, e.number), 0);
