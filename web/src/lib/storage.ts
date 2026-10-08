import { shopPrefix } from './shop';

// localStorage wrapper. Every access is guarded: private mode, blocked storage or a full
// quota must never crash the app — the estimate still works, it just isn't remembered.

const SUFFIX = {
  settings: 'settings.v1',
  products: 'products.v1',
  draft: 'draft.v1',
  drafts: 'drafts.v1',
  history: 'history.v1',
  nextNo: 'nextNo.v1',
  printer: 'printer.v1',
  stock: 'stock.v1',
  cash: 'cash.v1',
  auth: 'auth.v2', // v2: the passwords were reset (SPJ 3262, KJ 0800)
  picks: 'picks.v1',
  picksSession: 'picks.session.v1',
  picksCustomer: 'picks.customer.v1',
  picksRemoved: 'picks.removed.v1',
  cloud: 'cloud.v1',
  cloudStamps: 'cloud.stamps.v1',
  cloudPhotos: 'cloud.photos.v1',
  cloudPhotoDeletes: 'cloud.photodeletes.v1',
  cloudLast: 'cloud.last',
  cloudReset: 'cloud.reset.v1',
} as const;

/** Storage keys of the shop that is signed in (each shop has its own, see shop.ts). */
export const KEYS = {} as { readonly [K in keyof typeof SUFFIX]: string };
for (const [name, suffix] of Object.entries(SUFFIX)) {
  Object.defineProperty(KEYS, name, { enumerable: true, get: () => `${shopPrefix()}.${suffix}` });
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refused to store the value. */
export function save(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('spj:saved', { detail: key })); // lets the cloud sync notice changes
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
