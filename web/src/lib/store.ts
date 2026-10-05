import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SAMPLE_PRODUCTS, calcEstimate, newEstimate, newId, normalizeMaking, settleAdvance,
  type Estimate, type EstimateSummary, type Product, type ShopSettings, type StockEntry, type CashEntry,
} from '@shared';
import { KEYS, load, save } from './storage';
import { DEFAULT_PRINTER, type PrinterConfig } from './printing';
import { markEdited } from './cloud';
import { shopDefaults } from './auth';

/** Older saved estimates: Gold making becomes a %, Silver making a rupee total (same rupees as before); manual amounts (no longer editable) are cleared. */
const withFixedMaking = (e: Estimate): Estimate => ({ ...e, items: e.items.map((i) => ({ ...normalizeMaking(i, e.pricing), amountOverride: null })) });

/** A new estimate starts empty: customer details first, items are added with "Add item". */
export const blankEstimate = (s: ShopSettings): Estimate => ({ ...newEstimate(s), items: [] });

/** Unsaved work (current estimate, drafts): the Other charges feature is gone, so drop any left over. */
const withoutOtherCharges = (e: Estimate): Estimate => (e.otherCharges.length ? { ...e, otherCharges: [] } : e);

const strip = (e: Estimate) => JSON.stringify({ ...e, updatedAt: '' });

/** True when the estimate has anything worth keeping. */
export const hasContent = (e: Estimate): boolean =>
  !!e.customerName.trim() || !!e.customerPhone.trim() || !!(e.customerLocality ?? '').trim() || e.otherCharges.length > 0 ||
  e.items.some((i) => i.description.trim() || i.grossWt > 0);

export function summarize(e: Estimate): EstimateSummary {
  return {
    id: e.id, number: e.number, createdAt: e.createdAt, updatedAt: e.updatedAt, customerName: e.customerName,
    grandTotal: calcEstimate(e).grandTotal, itemCount: e.items.length, printStatus: e.printStatus, printedAt: e.printedAt, billStatus: e.billStatus,
  };
}

/** Fills in the shop details for settings saved before they were known; never overwrites edits. */
function upgradeSettings(saved: Partial<ShopSettings>): ShopSettings {
  const base = shopDefaults();
  const merged = { ...base, ...saved, shopCode: '', defaultLabourMode: 'fixed' as const }; // the second header line was removed for good
  if (!saved.address || saved.address === 'Elnabaad') merged.address = base.address;
  if (saved.tagline === undefined) merged.tagline = base.tagline; // an owner who cleared it on purpose keeps it empty
  if (!saved.phone) merged.phone = base.phone;
  if (!saved.ownerName) merged.ownerName = base.ownerName;
  if (!saved.ownerFamily && base.ownerFamily) merged.ownerFamily = base.ownerFamily;
  return merged;
}

export function useAppStore() {
  const [settings, setSettingsState] = useState<ShopSettings>(() => upgradeSettings(load<Partial<ShopSettings>>(KEYS.settings, {})));
  const [products, setProductsState] = useState<Product[]>(() => load<Product[]>(KEYS.products, SAMPLE_PRODUCTS).map((p) => ({ ...p, labourMode: 'fixed' as const })));
  const [history, setHistory] = useState<Estimate[]>(() => load<Estimate[]>(KEYS.history, []).map(withFixedMaking));
  const [printer, setPrinterState] = useState<PrinterConfig>(() => ({ ...DEFAULT_PRINTER, ...load<Partial<PrinterConfig>>(KEYS.printer, {}) }));
  const [est, setEst] = useState<Estimate>(() => { const d = load<Estimate | null>(KEYS.draft, null); return d ? withoutOtherCharges(withFixedMaking(d)) : blankEstimate(settings); });
  // Other unsaved estimates the owner started and set aside with "+"; listed in History as drafts.
  const [drafts, setDrafts] = useState<Estimate[]>(() => load<Estimate[]>(KEYS.drafts, []).filter(hasContent).map((d) => withoutOtherCharges(withFixedMaking(d))));
  // Shop stock register: every IN and OUT, entered by hand.
  const [stock, setStock] = useState<StockEntry[]>(() => load<StockEntry[]>(KEYS.stock, []));
  const [cash, setCash] = useState<CashEntry[]>(() => load<CashEntry[]>(KEYS.cash, []));
  const [storageOk, setStorageOk] = useState(true);

  // Auto-save the estimate being edited (debounced) so a closed tab loses nothing.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStorageOk(save(KEYS.draft, est)), 400);
    return () => window.clearTimeout(timer.current);
  }, [est]);
  // Flush on tab hide/close too.
  const estRef = useRef(est);
  estRef.current = est;
  useEffect(() => {
    const flush = () => save(KEYS.draft, estRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const setSettings = useCallback((s: ShopSettings) => {
    setSettingsState(s);
    setStorageOk(save(KEYS.settings, s));
    markEdited('settings');
  }, []);
  const setProducts = useCallback((p: Product[]) => {
    setProductsState(p);
    setStorageOk(save(KEYS.products, p));
    markEdited('products');
  }, []);
  const setPrinter = useCallback((p: PrinterConfig) => {
    setPrinterState(p);
    setStorageOk(save(KEYS.printer, p));
  }, []);

  const writeHistory = (h: Estimate[]) => {
    setHistory(h);
    setStorageOk(save(KEYS.history, h));
  };

  /** Saves into history (assigning the next E- number on first save) and returns the stored copy. */
  const saveEstimate = useCallback((e: Estimate): Estimate => {
    const current = load<Estimate[]>(KEYS.history, history);
    let number = e.number;
    if (!number) {
      const used = current.reduce((m, x) => Math.max(m, x.number), 0);
      number = Math.max(load<number>(KEYS.nextNo, 1), used + 1);
      save(KEYS.nextNo, number + 1);
    }
    const now = new Date().toISOString();
    const stored: Estimate = { ...settleAdvance(e, newId(), now), number, updatedAt: now }; // an amount typed as deposited becomes the first payment
    const idx = current.findIndex((x) => x.id === stored.id);
    const next = idx >= 0 ? current.map((x, i) => (i === idx ? stored : x)) : [stored, ...current];
    writeHistory(next);
    return stored;
  }, [history]);

  const writeDrafts = (d: Estimate[]) => {
    setDrafts(d);
    setStorageOk(save(KEYS.drafts, d));
  };
  /** Sets an unsaved estimate aside as a draft (newest first). Blank estimates are not kept. */
  const stashDraft = useCallback((e: Estimate) => {
    if (!hasContent(e)) return;
    const copy: Estimate = { ...e, updatedAt: new Date().toISOString() };
    writeDrafts([copy, ...load<Estimate[]>(KEYS.drafts, []).filter((x) => x.id !== e.id)]);
  }, []);
  const removeDraft = useCallback((id: string) => {
    writeDrafts(load<Estimate[]>(KEYS.drafts, []).filter((x) => x.id !== id));
  }, []);

  const writeStock = (list: StockEntry[]) => {
    setStock(list);
    setStorageOk(save(KEYS.stock, list));
  };
  /** Adds a movement, or replaces it when an entry with the same id exists. */
  const saveStock = useCallback((e: StockEntry) => {
    const cur = load<StockEntry[]>(KEYS.stock, []);
    writeStock(cur.some((x) => x.id === e.id) ? cur.map((x) => (x.id === e.id ? e : x)) : [e, ...cur]);
  }, []);

  const writeCash = (list: CashEntry[]) => {
    setCash(list);
    setStorageOk(save(KEYS.cash, list));
  };
  const saveCash = useCallback((e: CashEntry) => {
    const cur = load<CashEntry[]>(KEYS.cash, []);
    writeCash(cur.some((x) => x.id === e.id) ? cur.map((x) => (x.id === e.id ? e : x)) : [e, ...cur]);
  }, []);

  /** Re-reads everything the cloud sync may have changed on this device. */
  const reload = useCallback(() => {
    setSettingsState(upgradeSettings(load<Partial<ShopSettings>>(KEYS.settings, {})));
    setProductsState(load<Product[]>(KEYS.products, SAMPLE_PRODUCTS).map((p) => ({ ...p, labourMode: 'fixed' as const })));
    setHistory(load<Estimate[]>(KEYS.history, []).map(withFixedMaking));
    setStock(load<StockEntry[]>(KEYS.stock, []));
    setCash(load<CashEntry[]>(KEYS.cash, []));
  }, []);

  const savedCopy = history.find((h) => h.id === est.id);
  const dirty = savedCopy ? strip(savedCopy) !== strip(est) : hasContent(est);

  return {
    settings, setSettings, products, setProducts, history, printer, setPrinter,
    est, setEst, saveEstimate, dirty, storageOk, drafts, stashDraft, removeDraft, stock, saveStock, cash, saveCash, reload,
  };
}

export type AppStore = ReturnType<typeof useAppStore>;
