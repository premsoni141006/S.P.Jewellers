import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtEstimateNo, newEstimate, newId, newItem, validateEstimate, type Estimate, type EstimateSummary, type Product, type ShopSettings } from '@shared';
import { PreviewModal } from './components/PreviewModal';
import { usePrintFlow } from './components/PrintFlow';
import { ConfirmDialog, type ConfirmState, Toasts, type Toast } from './components/ui';
import { api, errorText, type PrinterConfig } from './lib/api';
import { EstimatePage } from './pages/EstimatePage';
import { HistoryPage } from './pages/HistoryPage';
import { PrinterPage } from './pages/PrinterPage';
import { SettingsPage } from './pages/SettingsPage';

type Page = 'estimate' | 'history' | 'printer' | 'settings';

/** The part of an estimate the user edits — used to tell whether there are unsaved changes. */
const contentKey = (e: Estimate) =>
  JSON.stringify([
    e.customerName.trim(),
    e.customerPhone.trim(),
    e.pricing,
    // Fixed field order: the stored copy and the editor's copy build objects differently.
    e.items.map((i) => [i.id, i.description.trim(), i.metal, i.grossWt, i.lessWt, i.tunch, i.wastage, i.pcs, i.pcsUnit ?? 'pc', i.labourRate, i.labourMode, i.amountOverride]),
    e.otherCharges.map((c) => [c.id, c.label, c.amount]),
  ]);
const isBlank = (e: Estimate) => !e.customerName && !e.customerPhone && e.otherCharges.length === 0 && e.items.every((i) => !i.description && !i.grossWt);

export function App() {
  const [boot, setBoot] = useState<{ error: string | null; done: boolean }>({ error: null, done: false });
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [printerCfg, setPrinterCfg] = useState<PrinterConfig | null>(null);
  const [info, setInfo] = useState({ version: '', platform: '', dataFile: '' });
  const [est, setEstState] = useState<Estimate | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [page, setPage] = useState<Page>('estimate');
  const [preview, setPreview] = useState<{ est: Estimate; printable: boolean } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [issues, setIssues] = useState<{ ids: Set<string>; messages: string[] }>({ ids: new Set(), messages: [] });
  const [historyKey, setHistoryKey] = useState(0);
  const estRef = useRef<Estimate | null>(null);
  estRef.current = est;

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 4000);
  }, []);

  const printFlow = usePrintFlow(
    useMemo(
      () => ({
        onSuccess: (msg: string) => {
          toast('ok', msg);
          setHistoryKey((k) => k + 1);
        },
        openPrinterSettings: () => setPage('printer'),
      }),
      [toast],
    ),
  );

  // ---------------------------------------------------------------- start-up

  useEffect(() => {
    (async () => {
      const [s, p, cfg, appInfo, draft] = await Promise.all([api.settings.get(), api.products.list(), api.printers.getConfig(), api.app.info(), api.draft.get()]);
      setSettings(s);
      setProducts(p);
      setPrinterCfg(cfg);
      setInfo(appInfo);
      if (draft) {
        // Restore exactly what was on screen when the app closed.
        const saved = draft.number > 0 ? await api.estimates.get(draft.id) : null;
        setEstState(draft);
        setSavedKey(saved ? contentKey(saved) : isBlank(draft) ? contentKey(draft) : '');
        if (!isBlank(draft) && (!saved || contentKey(saved) !== contentKey(draft))) toast('info', 'Restored your unsaved estimate.');
      } else {
        const fresh = newEstimate(s);
        setEstState(fresh);
        setSavedKey(contentKey(fresh));
      }
      setBoot({ error: null, done: true });
    })().catch((e) => setBoot({ error: errorText(e), done: true }));
  }, [toast]);

  // ---------------------------------------------------------------- auto-save draft

  useEffect(() => {
    if (!est) return;
    const t = setTimeout(() => void api.draft.save(est).catch((e) => toast('err', `Auto-save failed: ${errorText(e)}`)), 400);
    return () => clearTimeout(t);
  }, [est, toast]);

  useEffect(() => {
    const flush = () => estRef.current && api.draft.saveNow(estRef.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const setEst = useCallback((fn: (e: Estimate) => Estimate) => {
    setEstState((e) => (e ? { ...fn(e) } : e));
    setIssues((i) => (i.messages.length ? { ids: new Set(), messages: [] } : i));
  }, []);

  const dirty = !!est && contentKey(est) !== savedKey;

  // ---------------------------------------------------------------- actions

  const loadEstimate = (e: Estimate) => {
    setEstState(e);
    setSavedKey(contentKey(e));
    setIssues({ ids: new Set(), messages: [] });
  };

  const guardUnsaved = (proceed: () => void, what: string) => {
    if (!dirty || !est || isBlank(est)) return proceed();
    setConfirm({
      title: 'Unsaved changes',
      body: <p>The current estimate has changes that are not saved. {what}</p>,
      confirmLabel: 'Discard changes',
      danger: true,
      extra: {
        label: 'Save first',
        onClick: () => void doSave().then((ok) => ok && proceed()),
      },
      onConfirm: proceed,
    });
  };

  const showIssues = (e: Estimate): boolean => {
    const found = validateEstimate(e);
    if (found.length === 0) return false;
    setIssues({ ids: new Set(found.map((i) => i.itemId).filter((x): x is string => !!x)), messages: found.map((i) => i.message) });
    return true;
  };

  const doSave = async (): Promise<Estimate | null> => {
    const cur = estRef.current;
    if (!cur) return null;
    if (showIssues(cur)) return null;
    try {
      const saved = await api.estimates.save(cur);
      // Keep the editor in step with what is stored (number, timestamps), without losing
      // anything typed while the save was in flight.
      setEstState((e) => (e && e.id === saved.id ? { ...e, number: saved.number, createdAt: saved.createdAt, updatedAt: saved.updatedAt } : e));
      setSavedKey(contentKey(saved));
      setHistoryKey((k) => k + 1);
      return saved;
    } catch (e) {
      toast('err', `Could not save: ${errorText(e)}`);
      return null;
    }
  };

  const onSave = async () => {
    const saved = await doSave();
    if (saved) toast('ok', `Estimate ${fmtEstimateNo(saved.number)} saved.`);
  };

  const onNew = () =>
    guardUnsaved(() => {
      if (!settings) return;
      loadEstimate(newEstimate(settings));
      setPage('estimate');
    }, 'Start a new estimate anyway?');

  const onClear = () =>
    setConfirm({
      title: 'Clear estimate',
      body: <p>Remove all items, other charges and the customer details from this estimate?</p>,
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: () => settings && setEst((e) => ({ ...e, customerName: '', customerPhone: '', otherCharges: [], items: [newItem(settings)] })),
    });

  const printSaved = (id: string, label: string) =>
    printFlow.run(label, async (force) => {
      const r = await api.print.estimate(id, force);
      if (r.estimate) {
        const stored = r.estimate;
        setEstState((e) => (e && e.id === stored.id ? { ...e, printStatus: stored.printStatus, printedAt: stored.printedAt, lastPrintError: stored.lastPrintError } : e));
      }
      setHistoryKey((k) => k + 1);
      return r.outcome;
    });

  const onPrint = async () => {
    const cur = estRef.current;
    if (!cur || showIssues(cur)) return;
    // Printing always prints the saved copy, so history matches the paper.
    const saved = await doSave();
    if (saved) printSaved(saved.id, `Estimate ${fmtEstimateNo(saved.number)} → ${printerCfg?.printerLabel || 'printer'}`);
  };

  const onPreview = () => est && setPreview({ est, printable: true });

  const openFromHistory = async (id: string, then: (e: Estimate) => void) => {
    try {
      const e = await api.estimates.get(id);
      if (e) then(e);
      else toast('err', 'That estimate no longer exists.');
    } catch (err) {
      toast('err', errorText(err));
    }
  };

  const onDeleteSaved = (s: EstimateSummary) =>
    setConfirm({
      title: 'Delete estimate',
      body: (
        <p>
          Delete estimate <strong>{fmtEstimateNo(s.number)}</strong>
          {s.customerName ? ` for ${s.customerName}` : ''}? This cannot be undone.
        </p>
      ),
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.estimates.delete(s.id);
          // If it is open in the editor, keep the content as a new, unsaved estimate.
          if (estRef.current?.id === s.id) {
            setEstState((e) => (e ? { ...e, id: newId(), number: 0, printStatus: 'not_printed', printedAt: null, lastPrintError: null } : e));
            setSavedKey('');
          }
          setHistoryKey((k) => k + 1);
          toast('ok', `Estimate ${fmtEstimateNo(s.number)} deleted.`);
        } catch (e) {
          toast('err', errorText(e));
        }
      },
    });

  const saveConfig = async (c: PrinterConfig) => {
    setPrinterCfg(c);
    try {
      setPrinterCfg(await api.printers.saveConfig(c));
    } catch (e) {
      toast('err', `Could not save printer choice: ${errorText(e)}`);
    }
  };

  // ---------------------------------------------------------------- render

  if (!boot.done) return <div className="boot">Loading…</div>;
  if (boot.error || !settings || !est || !printerCfg)
    return (
      <div className="boot">
        <div className="banner banner-err">The app could not start: {boot.error ?? 'missing data'}.</div>
      </div>
    );

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="brand-name">{settings.shopName}</div>
          <div className="brand-code">{settings.shopCode}</div>
        </div>
        <nav className="tabs">
          {(
            [
              ['estimate', 'Estimate'],
              ['history', 'History'],
              ['printer', 'Printer Settings'],
              ['settings', 'Settings'],
            ] as Array<[Page, string]>
          ).map(([k, label]) => (
            <button key={k} className={`tab ${page === k ? 'active' : ''}`} onClick={() => setPage(k)}>
              {label}
            </button>
          ))}
        </nav>
        <button className="printer-chip" onClick={() => setPage('printer')} title="Printer Settings">
          <span className={`dot ${printerCfg.printerId ? 'on' : ''}`} />
          {printerCfg.printerLabel || 'No printer selected'}
        </button>
      </header>

      <main>
        {page === 'estimate' && (
          <EstimatePage
            est={est}
            setEst={setEst}
            settings={settings}
            products={products}
            dirty={dirty}
            invalidIds={issues.ids}
            issues={issues.messages}
            onDismissIssues={() => setIssues({ ids: new Set(), messages: [] })}
            printerLabel={printerCfg.printerLabel}
            busy={printFlow.busy}
            onNew={onNew}
            onSave={() => void onSave()}
            onPreview={onPreview}
            onPrint={() => void onPrint()}
            onPrinterSettings={() => setPage('printer')}
            onClear={onClear}
          />
        )}
        {page === 'history' && (
          <HistoryPage
            refreshKey={historyKey}
            currentId={est.id}
            onView={(id) => void openFromHistory(id, (e) => setPreview({ est: e, printable: true }))}
            onOpen={(id) =>
              guardUnsaved(
                () =>
                  void openFromHistory(id, (e) => {
                    loadEstimate(e);
                    setPage('estimate');
                  }),
                'Open the other estimate anyway?',
              )
            }
            onReprint={(id) => void openFromHistory(id, (e) => printSaved(e.id, `Reprint ${fmtEstimateNo(e.number)} → ${printerCfg.printerLabel || 'printer'}`))}
            onDelete={onDeleteSaved}
          />
        )}
        {page === 'printer' && (
          <PrinterPage
            config={printerCfg}
            onConfig={(c) => void saveConfig(c)}
            busy={printFlow.busy}
            platform={info.platform}
            onTestPrint={() => printFlow.run(`Test page → ${printerCfg.printerLabel}`, (force) => api.print.test(force))}
            onTestEstimate={() => printFlow.run(`Test estimate → ${printerCfg.printerLabel}`, (force) => api.print.testEstimate(force))}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            settings={settings}
            products={products}
            dataFile={info.dataFile}
            version={info.version}
            onSaveSettings={async (s) => {
              try {
                setSettings(await api.settings.save(s));
                toast('ok', 'Settings saved.');
                return true;
              } catch (e) {
                toast('err', errorText(e));
                return false;
              }
            }}
            onSaveProducts={async (p) => {
              try {
                setProducts(await api.products.save(p));
                toast('ok', 'Products saved.');
                return true;
              } catch (e) {
                toast('err', errorText(e));
                return false;
              }
            }}
          />
        )}
      </main>

      {preview && (
        <PreviewModal
          estimate={preview.est}
          settings={settings}
          onClose={() => setPreview(null)}
          onToast={toast}
          onPrint={
            preview.printable
              ? () => {
                  const target = preview.est;
                  setPreview(null);
                  if (target.id === est.id) void onPrint();
                  else printSaved(target.id, `Reprint ${fmtEstimateNo(target.number)}`);
                }
              : undefined
          }
        />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {printFlow.view}
      <Toasts items={toasts} />
    </div>
  );
}
