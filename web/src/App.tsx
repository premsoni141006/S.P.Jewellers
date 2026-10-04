import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fmtEstimateNo, validateEstimate, type Estimate, type ValidationIssue } from '@shared';
import { AppBar } from './components/AppBar';
import { Icon } from './components/Icon';
import { Sheet, type SheetAction } from './components/Sheet';
import { blankEstimate, hasContent, useAppStore } from './lib/store';
import { errorText, printEstimate } from './lib/printing';
import { HomePage } from './pages/HomePage';
import { EstimatePage } from './pages/EstimatePage';
import { HistoryPage } from './pages/HistoryPage';
import { PrinterPage } from './pages/PrinterPage';
import { SettingsPage } from './pages/SettingsPage';
import { StockPage } from './pages/StockPage';
import { PreviewScreen } from './pages/PreviewScreen';
import { LoginScreen } from './pages/LoginScreen';
import { isUnlocked } from './lib/auth';
import { billFileName, billPdf, saveBlob, shareBill } from './lib/billExport';
import { RatesModal } from './components/RatesModal';
import { useBackLayer } from './lib/backStack';
import { ProductsModal } from './components/ProductsModal';

type Tab = 'home' | 'estimate' | 'history' | 'printer' | 'settings' | 'stock';
// The bar has exactly three things: Home, "+" (new estimate) and History.
// Settings opens from the gear on Home; Printer settings lives inside Settings.
const TABS_LEFT: Array<{ id: Tab; label: string }> = [{ id: 'home', label: 'Home' }];
const TABS_RIGHT: Array<{ id: Tab; label: string }> = [{ id: 'history', label: 'History' }];

export interface SheetSpec {
  title: string;
  body?: ReactNode;
  actions: SheetAction[];
}

function AppMain() {
  const store = useAppStore();
  const { settings, printer, est, setEst, saveEstimate } = store;
  const header = {
    shopName: settings.shopName,
    shopCode: '',
    // Top of the bill: owner name and mobile at the right, shop address under the shop name.
    ownerName: settings.ownerName?.trim() ?? '',
    ownerPhone: settings.phone.trim(),
    address: settings.address.trim(),
    logo: settings.printLogo !== false,
  };

  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ est: Estimate; fromEditor: boolean; saved?: boolean } | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const confirm = useCallback(
    (title: string, body: ReactNode, okLabel: string, danger = false) =>
      new Promise<boolean>((resolve) => {
        const close = (v: boolean) => {
          setSheet(null);
          resolve(v);
        };
        setSheet({
          title,
          body,
          actions: [
            { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => close(true) },
            { label: 'Cancel', onClick: () => close(false) },
          ],
        });
      }),
    [],
  );

  const showIssues = (issues: ValidationIssue[]) => {
    setInvalid(new Set(issues.map((i) => i.itemId).filter((x): x is string => !!x)));
    setSheet({
      title: 'Fix these first',
      body: (
        <ul className="issue-list" data-testid="issues">
          {issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      ),
      actions: [{ label: 'OK', kind: 'primary', onClick: () => setSheet(null) }],
    });
  };

  const save = (): Estimate | null => {
    const issues = validateEstimate(est);
    if (issues.length) {
      showIssues(issues);
      return null;
    }
    setInvalid(new Set());
    const stored = saveEstimate(est);
    setEst(stored);
    setToast(`Bill ${fmtEstimateNo(stored.number)} saved to history.`);
    return stored;
  };

  const runPrint = async (target: Estimate, fromEditor: boolean): Promise<void> => {
    const issues = validateEstimate(target);
    if (issues.length) {
      if (fromEditor) showIssues(issues);
      else setSheet({ title: 'Cannot print', body: issues[0].message, actions: [{ label: 'OK', kind: 'primary', onClick: () => setSheet(null) }] });
      return;
    }
    setInvalid(new Set());
    let stored = saveEstimate(target);
    if (fromEditor) setEst(stored);
    setBusy('Printing...');
    try {
      const res = await printEstimate(stored, header, printer);
      if (res.outcome !== 'cancelled') stored = saveEstimate({ ...stored, printStatus: 'printed', printedAt: new Date().toISOString(), lastPrintError: null });
      setToast(res.message);
    } catch (e) {
      const reason = errorText(e);
      stored = saveEstimate({ ...stored, printStatus: 'failed', lastPrintError: reason });
      const failed = stored;
      setSheet({
        title: 'Printing failed',
        body: <p data-testid="print-error">{reason}</p>,
        actions: [
          { label: 'Retry', kind: 'primary', onClick: () => { setSheet(null); void runPrint(failed, fromEditor); } },
          { label: 'Printer settings', onClick: () => { setSheet(null); setPreview(null); setTab('printer'); } },
          { label: 'Close', onClick: () => setSheet(null) },
        ],
      });
    } finally {
      setBusy(null);
      if (fromEditor) setEst(stored);
    }
  };

  /** Switch screen, then bring a control into view (used by the Home tiles). */
  // Starting or opening another estimate never throws work away: an unsaved one is set aside as a draft
  // (red dot in History) and the owner continues or discards it there.
  const switchTo = (next: Estimate) => {
    if (next.id !== est.id) {
      if (hasDraft) store.stashDraft(est);
      store.removeDraft(next.id);
      setEst(next);
    }
    setInvalid(new Set());
    setTab('estimate');
  };
  const hasDraft = store.dirty && hasContent(est);
  const startNew = async () => switchTo(blankEstimate(settings));

  // System Back (button or edge swipe): one step at a time, topmost layer first.
  //  - a screen other than Home is a layer: Printer -> Settings, everything else -> Home
  //  - the preview screen is a layer on top of it
  //  - while printing, Back is swallowed (the printing overlay cannot be dismissed)
  useBackLayer(tab !== 'home', () => setTab(tab === 'printer' ? 'settings' : 'home'));
  useBackLayer(!!preview, () => setPreview(null));
  useBackLayer(!!busy, () => undefined);

  return (
    <div className="app">
      {tab !== 'home' && (
        <AppBar
          title={{ estimate: 'Estimate', history: 'History', printer: 'Printer settings', settings: 'Settings', stock: 'Shop stock', home: '' }[tab]}
          onBack={tab === 'estimate' || tab === 'settings' || tab === 'stock' ? () => setTab('home') : tab === 'printer' ? () => setTab('settings') : undefined}
          right={
            <>
              {!store.storageOk && <span className="pill pill-warn">Not saving</span>}
            </>
          }
        />
      )}

      <main className={`content${tab === 'estimate' ? ' with-totals' : ''}${tab === 'home' ? ' flush' : ''}`}>
        {tab === 'home' && (
          <HomePage
            store={store}
            onSettings={() => setTab('settings')}
            onProducts={() => setProductsOpen(true)}
            onRates={() => setRatesOpen(true)}
            onStock={() => setTab('stock')}
            onHistory={() => setTab('history')}
            onView={(e) => setPreview({ est: e, fromEditor: false })}
          />
        )}
        {tab === 'estimate' && (
          <EstimatePage
            store={store}
            invalid={invalid}
            onSave={() => { const s = save(); if (s) setPreview({ est: s, fromEditor: true, saved: true }); }}
            onPreview={() => setPreview({ est, fromEditor: true })}
            confirm={confirm}
          />
        )}
        {tab === 'stock' && <StockPage store={store} confirm={confirm} setToast={setToast} />}
        {tab === 'history' && (
          <HistoryPage
            store={store}
            drafts={[...(hasDraft ? [{ est, current: true }] : []), ...store.drafts.filter((d) => d.id !== est.id).map((d) => ({ est: d, current: false }))]}
            onContinueDraft={(d) => (d.current ? setTab('estimate') : switchTo(d.est))}
            onViewDraft={(d) => setPreview({ est: d.est, fromEditor: d.current })}
            onDiscardDraft={async (d) => {
              if (!(await confirm('Discard this draft?', 'The estimate you started will be deleted. It has not been saved.', 'Discard', true))) return;
              if (d.current) { setInvalid(new Set()); setEst(blankEstimate(settings)); } else store.removeDraft(d.est.id);
            }}
            onView={(e) => setPreview({ est: e, fromEditor: false })}
            onReprint={(e) => void runPrint(e, e.id === est.id)}
            onShare={async (e) => {
              setBusy('Preparing the bill…');
              try { await shareBill(e, header); } catch (err) { setToast(err instanceof Error && err.message ? err.message : 'Could not share the bill.'); } finally { setBusy(null); }
            }}
            onDownload={async (e) => {
              setBusy('Preparing the bill…');
              try { setToast(`PDF saved to ${await saveBlob(billFileName(e, 'pdf'), await billPdf(e, header))}.`); } catch (err) { setToast(err instanceof Error && err.message ? err.message : 'Could not save the bill.'); } finally { setBusy(null); }
            }}
          />
        )}
        {tab === 'printer' && <PrinterPage store={store} header={header} setBusy={setBusy} setToast={setToast} setSheet={setSheet} />}
        {tab === 'settings' && <SettingsPage store={store} onPrinter={() => setTab('printer')} />}
      </main>

      {tab !== 'estimate' && (
        <nav className="tabbar" aria-label="Main">
          {[...TABS_LEFT.map((t) => ({ ...t, fab: false })), { id: 'new' as const, label: 'New', fab: true }, ...TABS_RIGHT.map((t) => ({ ...t, fab: false }))].map((t) =>
            t.fab ? (
              <div className="fab-slot" key="fab">
                <button className="fab" onClick={() => void startNew()} aria-label="New estimate" data-testid="fab-new"><Icon name="plus" size={28} /></button>
              </div>
            ) : (
              <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id as Tab)} aria-current={tab === t.id ? 'page' : undefined} data-testid={`tab-${t.id}`}>
                <Icon name={t.id === 'home' ? 'home' : t.id} size={22} />
                <span>{t.label}</span>
              </button>
            ),
          )}
        </nav>
      )}

      {productsOpen && (
        <ProductsModal
          products={store.products}
          defaultLabour={settings.defaultLabour}
          defaultLabourMode={settings.defaultLabourMode}
          onChange={store.setProducts}
          onClose={() => setProductsOpen(false)}
        />
      )}

      {ratesOpen && (
        <RatesModal
          initial={{ silverRate: settings.defaultSilverRate, silverUnit: settings.silverRateUnit, goldRate: settings.defaultGoldRate, goldUnit: settings.goldRateUnit, goldKarat: settings.goldKarat ?? '24' }}
          onClose={() => setRatesOpen(false)}
          onSave={(v) => {
            store.setSettings({ ...settings, defaultSilverRate: v.silverRate, silverRateUnit: v.silverUnit, defaultGoldRate: v.goldRate, goldRateUnit: v.goldUnit, goldKarat: v.goldKarat });
            // An estimate that has not been saved yet takes today's rates too; saved ones keep theirs.
            if (est.number === 0) store.setEst({ ...est, pricing: { ...est.pricing, silverRate: v.silverRate, silverRateUnit: v.silverUnit, goldRate: v.goldRate, goldRateUnit: v.goldUnit, goldKarat: v.goldKarat } });
            setRatesOpen(false);
            setToast('Rates updated.');
          }}
        />
      )}

      {preview && (
        <PreviewScreen
          est={preview.fromEditor ? est : preview.est}
          header={header}
          onClose={() => {
            // A bill that has been made is final: leaving its preview returns to History with a fresh editor.
            if (preview.saved) { setEst(blankEstimate(settings)); setPreview(null); setTab('history'); } else setPreview(null);
          }}
          onNotice={setToast}
          onEnsureSaved={() => {
            if (!preview.fromEditor) return preview.est;
            const issues = validateEstimate(est);
            if (issues.length) { setPreview(null); showIssues(issues); return null; }
            if (est.number > 0) return est;
            const stored = saveEstimate(est);
            setEst(stored);
            setPreview({ est: stored, fromEditor: true, saved: true });
            setToast(`Bill ${fmtEstimateNo(stored.number)} saved to history.`);
            return stored;
          }}
          onStatus={(status) => {
            const fromEditor = preview.fromEditor;
            const target = fromEditor ? est : preview.est;
            const issues = validateEstimate(target);
            if (issues.length) {
              setPreview(null);
              if (fromEditor) showIssues(issues);
              else setToast(issues[0].message);
              return;
            }
            setInvalid(new Set());
            const stored = saveEstimate({ ...target, billStatus: status });
            if (fromEditor || target.id === est.id) setEst(blankEstimate(settings));
            setPreview(null);
            if (fromEditor) setTab('history');
            setToast(status === 'clear' ? `Bill ${fmtEstimateNo(stored.number)} marked Clear.` : `Bill ${fmtEstimateNo(stored.number)} marked Pending.`);
          }}
          onPrint={() => {
            const target = preview.fromEditor ? est : preview.est;
            setPreview(null);
            void runPrint(target, preview.fromEditor || target.id === est.id);
          }}
        />
      )}
      {sheet && <Sheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)}>{sheet.body}</Sheet>}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div className="busy-card"><span className="spinner" />{busy}</div>
        </div>
      )}
      {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}
    </div>
  );
}

export default function App() {
  const [ok, setOk] = useState(isUnlocked);
  return ok ? <AppMain /> : <LoginScreen onDone={() => setOk(true)} />;
}
