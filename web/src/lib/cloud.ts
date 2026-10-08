// Cloud backup / sync with the shop's Cloudflare Worker (R2 storage). Off until a URL and key are entered.
// What goes up: bills, stock, cash, products, settings, customer picks, and the stock photos.
// Merging is by id, so two devices never overwrite each other's records (see shared/src/sync.ts).

import { useEffect, useSyncExternalStore } from 'react';
import { fixBillNumbers, maxBillNumber, mergeBills, mergeById, type CashEntry, type Estimate, type StockEntry } from '@shared';
import { KEYS, load, save } from './storage';
import { deletePhoto, getPhoto, putPhoto } from './photos';
import { loadPicks, type Pick } from './picks';
import { activeShop } from './shop';

export interface CloudConfig { url: string; key: string }

/** The shop's Worker address (not a secret; only the key opens it). Pre-filled in Settings → Cloud backup. */
export const DEFAULT_CLOUD_URL = 'https://spj-cloud.premsoni119220.workers.dev';

/** The shop's cloud key, built in so every phone connects as soon as it signs in (no typing). Rotate it with: npx wrangler secret put SYNC_TOKEN, then change it here. */
export const DEFAULT_CLOUD_KEY = 'a2kdY2lzsYFvWTq0Lulur7F6Y5ep5TTHTsxx6vFpA1s';

/** The shop's own Worker and key unless a different server was entered in Settings (used for testing). */
export const loadCloudConfig = (): CloudConfig | null => {
  const c = load<CloudConfig | null>(KEYS.cloud, null);
  if (c && !c.url && !c.key) return null; // turned off on this phone in Settings
  if (c?.url && c.key && c.url.replace(/\/+$/, '') !== DEFAULT_CLOUD_URL) return c; // another server, e.g. a local test one
  return { url: DEFAULT_CLOUD_URL, key: DEFAULT_CLOUD_KEY };
};
export const saveCloudConfig = (c: CloudConfig | null): void => { save(KEYS.cloud, c); listeners.forEach((l) => l()); };

// ---------------------------------------------------------------- status (for the Settings card)
export interface CloudStatus { state: 'off' | 'idle' | 'syncing' | 'error'; last: string; error: string }
let status: CloudStatus = { state: 'off', last: '', error: '' };
const listeners = new Set<() => void>();
const setStatus = (s: Partial<CloudStatus>) => { status = { ...status, ...s }; listeners.forEach((l) => l()); };
export const useCloudStatus = (): CloudStatus => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);

// ---------------------------------------------------------------- local change stamps (whole-document collections)
type DocName = 'products' | 'settings';
const stamps = (): Record<string, string> => load<Record<string, string>>(KEYS.cloudStamps, {});
/** Called when the owner edits products or settings: this device's copy is now the newest. */
export function markEdited(name: DocName): void {
  const s = stamps();
  s[name] = new Date().toISOString();
  save(KEYS.cloudStamps, s);
}

// ---------------------------------------------------------------- network
class Stale extends Error {}

async function call(cfg: CloudConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/v1${path}`, { ...init, headers: { Authorization: `Bearer ${cfg.key}`, ...(activeShop() === 'KJ' ? { 'X-Shop': 'kj' } : {}), ...(init.headers ?? {}) } });
  if (res.status === 401) throw new Error('The cloud key is not correct.');
  return res;
}

interface Remote<T> { etag: string; doc: T | null }
async function getDoc<T>(cfg: CloudConfig, name: string): Promise<Remote<T>> {
  const res = await call(cfg, `/c/${name}`);
  if (!res.ok) throw new Error(`The cloud answered ${res.status}.`);
  const etag = res.headers.get('X-Etag') ?? 'none';
  const body = (await res.json()) as T & { empty?: boolean };
  return { etag, doc: etag === 'none' ? null : body };
}
async function putDoc(cfg: CloudConfig, name: string, etag: string, doc: unknown): Promise<void> {
  const res = await call(cfg, `/c/${name}`, { method: 'PUT', headers: { 'If-Match': etag, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  if (res.status === 412) throw new Stale();
  if (!res.ok) throw new Error(`The cloud answered ${res.status}.`);
}

/** Read the cloud copy, merge it with this device, write back whatever changed. Retries when another device wrote in between. */
async function syncDoc<T>(cfg: CloudConfig, name: string, merge: (remote: T | null) => { merged: T | null; pushRemote: boolean; applyLocal: () => void }): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { etag, doc } = await getDoc<T>(cfg, name);
    const { merged, pushRemote, applyLocal } = merge(doc);
    try {
      if (pushRemote && merged !== null) await putDoc(cfg, name, etag, merged);
    } catch (e) {
      if (e instanceof Stale) continue;
      throw e;
    }
    applyLocal();
    return true;
  }
  throw new Error('Another device keeps changing the data. Try again.');
}

// ---------------------------------------------------------------- the collections
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byId = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));

function listCollection<T extends { id: string }>(cfg: CloudConfig, name: string, key: string, stamp: (x: T) => string, post?: (l: T[]) => T[], join?: (l: T[], r: T[]) => T[]): Promise<boolean> {
  let changed = false;
  return syncDoc<{ items: T[] }>(cfg, name, (remote) => {
    const local = load<T[]>(key, []);
    let merged = join ? join(local, remote?.items ?? []) : mergeById(local, remote?.items ?? [], stamp);
    if (post) merged = post(merged);
    const pushRemote = !remote || !same(byId(merged), byId(remote.items));
    return { merged: { items: merged }, pushRemote, applyLocal: () => { if (!same(byId(merged), byId(local))) { save(key, merged); changed = true; } } };
  }).then(() => changed);
}

function picksCollection(cfg: CloudConfig): Promise<boolean> {
  let changed = false;
  return syncDoc<{ items: Pick[]; removed: string[] }>(cfg, 'picks', (remote) => {
    const local = loadPicks();
    const removed = [...new Set([...load<string[]>(KEYS.picksRemoved, []), ...(remote?.removed ?? [])])];
    const merged = mergeById(local, remote?.items ?? [], (p) => p.at).filter((p) => !removed.includes(p.id));
    const doc = { items: merged, removed };
    const pushRemote = !remote || !same(byId(merged), byId(remote.items)) || !same([...removed].sort(), [...(remote.removed ?? [])].sort());
    return { merged: doc, pushRemote, applyLocal: () => {
      if (!same(byId(merged), byId(local))) { save(KEYS.picks, merged); changed = true; }
      save(KEYS.picksRemoved, removed);
    } };
  }).then(() => changed);
}

/** Products and settings are edited as a whole: the copy edited last wins. */
function wholeDoc<T>(cfg: CloudConfig, name: DocName, key: string): Promise<boolean> {
  let changed = false;
  return syncDoc<{ at: string; value: T }>(cfg, name, (remote) => {
    const mine = stamps()[name] ?? '';
    const local = load<T | null>(key, null);
    if (remote && remote.at > mine) {
      return { merged: remote, pushRemote: false, applyLocal: () => { if (!same(local, remote.value)) { save(key, remote.value); changed = true; } const s = stamps(); s[name] = remote.at; save(KEYS.cloudStamps, s); } };
    }
    if (mine && local !== null && (!remote || remote.at < mine)) {
      return { merged: { at: mine, value: local }, pushRemote: true, applyLocal: () => undefined };
    }
    return { merged: remote, pushRemote: false, applyLocal: () => undefined };
  }).then(() => changed);
}

// ---------------------------------------------------------------- photos
async function syncPhotos(cfg: CloudConfig): Promise<boolean> {
  const stock = load<StockEntry[]>(KEYS.stock, []);
  const done = new Set(load<string[]>(KEYS.cloudPhotos, []));
  let changed = false;
  for (const e of stock) {
    const id = e.photoId;
    if (!id || done.has(id)) continue;
    const mine = await getPhoto(id).catch(() => undefined);
    if (mine) {
      const res = await call(cfg, `/p/${id}`, { method: 'PUT', headers: { 'Content-Type': mine.type || 'image/jpeg' }, body: mine });
      if (!res.ok) throw new Error(`The cloud answered ${res.status} for a photo.`);
      done.add(id);
    } else {
      const res = await call(cfg, `/p/${id}`);
      if (res.ok) { await putPhoto(id, await res.blob()); done.add(id); changed = true; }
    }
  }
  save(KEYS.cloudPhotos, [...done]);
  return changed;
}

// ---------------------------------------------------------------- deleting photos for good
/** Removes pictures from this device now and from the cloud as soon as it can be reached (retried on the next sync). */
export async function forgetPhotos(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  for (const id of unique) await deletePhoto(id);
  save(KEYS.cloudPhotos, load<string[]>(KEYS.cloudPhotos, []).filter((x) => !unique.includes(x)));
  save(KEYS.cloudPhotoDeletes, [...new Set([...load<string[]>(KEYS.cloudPhotoDeletes, []), ...unique])]);
  const cfg = loadCloudConfig();
  if (cfg) void flushPhotoDeletes(cfg);
}

async function flushPhotoDeletes(cfg: CloudConfig): Promise<void> {
  const pending = load<string[]>(KEYS.cloudPhotoDeletes, []);
  const left: string[] = [];
  for (const id of pending) {
    try {
      const res = await call(cfg, `/p/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) left.push(id);
    } catch { left.push(id); }
  }
  save(KEYS.cloudPhotoDeletes, left);
}

// ---------------------------------------------------------------- one full sync
let running = false;
let suppress = false;
export const isSyncing = (): boolean => suppress;

/** Syncs everything. Returns true when this device received something new (the screen should reload its data). */
export async function syncAll(cfg: CloudConfig): Promise<boolean> {
  if (running) return false;
  running = true;
  suppress = true;
  setStatus({ state: 'syncing', error: '' });
  let changed = false;
  try {
    await flushPhotoDeletes(cfg);
    changed = (await listCollection<Estimate>(cfg, 'history', KEYS.history, (e) => e.updatedAt, (l) => fixBillNumbers(l), mergeBills)) || changed;
    const n = maxBillNumber(load<Estimate[]>(KEYS.history, []));
    if (n + 1 > load<number>(KEYS.nextNo, 1)) save(KEYS.nextNo, n + 1);
    changed = (await listCollection<StockEntry>(cfg, 'stock', KEYS.stock, (e) => e.updatedAt ?? e.createdAt)) || changed;
    changed = (await listCollection<CashEntry>(cfg, 'cash', KEYS.cash, (e) => e.createdAt)) || changed;
    changed = (await picksCollection(cfg)) || changed;
    changed = (await wholeDoc(cfg, 'products', KEYS.products)) || changed;
    changed = (await wholeDoc(cfg, 'settings', KEYS.settings)) || changed;
    changed = (await syncPhotos(cfg)) || changed;
    const now = new Date().toISOString();
    save(KEYS.cloudLast, now);
    setStatus({ state: 'idle', last: now, error: '' });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : 'Could not reach the cloud.' });
  } finally {
    suppress = false;
    running = false;
  }
  return changed;
}

/** Checks the URL and key without syncing anything. Returns an error text, or '' when it works. */
export async function pingCloud(cfg: CloudConfig): Promise<string> {
  try {
    const res = await call(cfg, '/ping');
    return res.ok ? '' : `The cloud answered ${res.status}.`;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not reach the cloud.';
  }
}

const WATCHED = new Set<string>([KEYS.history, KEYS.cloudPhotoDeletes, KEYS.stock, KEYS.cash, KEYS.picks, KEYS.picksRemoved, KEYS.products, KEYS.settings]);

/** Keeps the app in step with the cloud: on start, when the app comes back, when online again, and shortly after any change. */
export function useCloudSync(reload: () => void): void {
  const cfgKey = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => JSON.stringify(loadCloudConfig()));
  useEffect(() => {
    const cfg = loadCloudConfig();
    if (!cfg) { setStatus({ state: 'off', last: '' }); return; }
    setStatus({ state: 'idle', last: load<string>(KEYS.cloudLast, '') });
    let timer: number | undefined;
    const run = () => { void syncAll(cfg).then((changed) => { if (changed) reload(); }); };
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(run, 2500); };
    const onSaved = (e: Event) => { if (!suppress && WATCHED.has((e as CustomEvent<string>).detail)) soon(); };
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    run();
    window.addEventListener('spj:saved', onSaved);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('spj:saved', onSaved);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cfgKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
