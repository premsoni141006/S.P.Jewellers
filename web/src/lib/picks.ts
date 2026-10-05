// Gallery picks: a customer "likes" a piece. Kept on the device, listed per customer under Fav.

import { newId } from '@shared';
import { KEYS, load, save } from './storage';

export interface Pick {
  id: string;
  customer: string;
  /** The stock entry (photo) the customer liked. */
  entryId: string;
  at: string;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export const loadPicks = (): Pick[] => load<Pick[]>(KEYS.picks, []);

/** Adds a pick (once per customer and piece) and stores the list. Returns the new list. */
export function addPick(list: Pick[], customer: string, entryId: string): Pick[] {
  const name = customer.trim().replace(/\s+/g, ' ');
  if (!name || list.some((p) => norm(p.customer) === norm(name) && p.entryId === entryId)) return list;
  // The same customer keeps the spelling used the first time.
  const known = list.find((p) => norm(p.customer) === norm(name))?.customer ?? name;
  const next = [{ id: newId(), customer: known, entryId, at: new Date().toISOString() }, ...list];
  save(KEYS.picks, next);
  return next;
}

/** Takes a piece back out of the picks made since `since` (the heart tapped a second time). Returns the new list. */
export function removeSessionPick(list: Pick[], entryId: string, since: string): Pick[] {
  const gone = list.filter((p) => p.entryId === entryId && p.at >= since).map((p) => p.id);
  if (gone.length === 0) return list;
  // Remember the removal, so a cloud copy of the pick does not bring it back.
  save(KEYS.picksRemoved, [...new Set([...load<string[]>(KEYS.picksRemoved, []), ...gone])]);
  const next = list.filter((p) => !gone.includes(p.id));
  save(KEYS.picks, next);
  return next;
}

/** Drops every pick of the given pieces (their photos are gone), remembering the removals for the cloud. */
export function removePicksOf(list: Pick[], entryIds: string[]): Pick[] {
  const gone = list.filter((p) => entryIds.includes(p.entryId)).map((p) => p.id);
  if (gone.length === 0) return list;
  save(KEYS.picksRemoved, [...new Set([...load<string[]>(KEYS.picksRemoved, []), ...gone])]);
  const next = list.filter((p) => !gone.includes(p.id));
  save(KEYS.picks, next);
  return next;
}

export interface CustomerPicks { key: string; name: string; count: number; last: string }

/** Customers who have picked something, most recent first. */
export function customersOf(list: Pick[]): CustomerPicks[] {
  const map = new Map<string, CustomerPicks>();
  for (const p of list) {
    const key = norm(p.customer);
    const cur = map.get(key);
    if (!cur) map.set(key, { key, name: p.customer, count: 1, last: p.at });
    else { cur.count += 1; if (p.at > cur.last) cur.last = p.at; }
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export const picksOf = (list: Pick[], customerKey: string): Pick[] => list.filter((p) => norm(p.customer) === customerKey);
