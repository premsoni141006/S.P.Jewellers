// localStorage wrapper. Every access is guarded: private mode, blocked storage or a full
// quota must never crash the app — the estimate still works, it just isn't remembered.

export const KEYS = {
  settings: 'spj.settings.v1',
  products: 'spj.products.v1',
  draft: 'spj.draft.v1',
  drafts: 'spj.drafts.v1',
  history: 'spj.history.v1',
  nextNo: 'spj.nextNo.v1',
  printer: 'spj.printer.v1',
  stock: 'spj.stock.v1',
  cash: 'spj.cash.v1',
  auth: 'spj.auth.v1',
  picks: 'spj.picks.v1',
  picksSession: 'spj.picks.session.v1',
  picksCustomer: 'spj.picks.customer.v1',
  picksRemoved: 'spj.picks.removed.v1',
  cloud: 'spj.cloud.v1',
  cloudStamps: 'spj.cloud.stamps.v1',
  cloudPhotos: 'spj.cloud.photos.v1',
  cloudPhotoDeletes: 'spj.cloud.photodeletes.v1',
} as const;

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
