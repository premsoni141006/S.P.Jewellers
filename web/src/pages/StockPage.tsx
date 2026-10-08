import { useMemo, useState, type ReactNode } from 'react';
import { cashTotals, fmtDate, fmtPercent, fmtRupees, fmtWeight, searchCash, searchStock, sortCash, sortStock, stockByItem, availableStock, stockTotals, type CashEntry, type Metal, type StockEntry } from '@shared';
import { CashEntryModal, newCashEntry } from '../components/CashEntryModal';
import { Icon } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { newStockEntry } from './StockEntryPage';
import { usePhotoUrl } from '../lib/photos';
import type { AppStore } from '../lib/store';

type TypeFilter = 'all' | 'in' | 'out';
type MetalFilter = 'all' | Metal;
type Section = 'metal' | 'cash';
type Confirm = (title: string, body: ReactNode, ok: string, danger?: boolean) => Promise<boolean>;

function Thumb({ photoId }: { photoId?: string }) {
  const url = usePhotoUrl(photoId);
  if (!photoId) return null;
  return <span className="stock-thumb">{url && <img src={url} alt="" data-testid="stock-thumb" />}</span>;
}

function TypeSeg({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  return (
    <div className="seg" role="group" aria-label="Show">
      {(['all', 'in', 'out'] as const).map((f) => (
        <button key={f} className={value === f ? 'on' : ''} onClick={() => onChange(f)} data-testid={`stock-filter-${f}`}>{f === 'all' ? 'All' : f === 'in' ? 'IN' : 'OUT'}</button>
      ))}
    </div>
  );
}

export function StockPage({ section, onRange, onEditStock, store, setToast }: { section: Section; onRange: () => void; onEditStock: (entry: StockEntry, isNew: boolean) => void; store: AppStore; confirm?: Confirm; setToast: (s: string) => void }) {
  const { stock, cash } = store;
  const [cashEdit, setCashEdit] = useState<{ entry: CashEntry; isNew: boolean } | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [typeF, setTypeF] = useState<TypeFilter>('all');
  const [metalF, setMetalF] = useState<MetalFilter>('all');
  const [cashF, setCashF] = useState<TypeFilter>('all');
  // Each register keeps its own search words.
  const [qMetal, setQMetal] = useState('');
  const [qCash, setQCash] = useState('');

  const gold = useMemo(() => stockTotals(stock, 'gold'), [stock]);
  const silver = useMemo(() => stockTotals(stock, 'silver'), [stock]);
  // IN entries that have since gone out (an OUT of the same piece exists) are shown faded under All; the IN filter lists only what is still in stock.
  const inStock = useMemo(() => new Set(availableStock(stock).map((x) => x.id)), [stock]);
  const byItem = useMemo(() => stockByItem(stock), [stock]);
  const cashT = useMemo(() => cashTotals(cash), [cash]);
  const stockList = useMemo(() => searchStock(sortStock(stock), qMetal).filter((e) => (typeF === 'all' || (e.type === typeF && (typeF !== 'in' || inStock.has(e.id)))) && (metalF === 'all' || e.metal === metalF)), [stock, qMetal, typeF, metalF, inStock]);
  const cashList = useMemo(() => searchCash(sortCash(cash), qCash).filter((e) => cashF === 'all' || e.type === cashF), [cash, qCash, cashF]);

  return (
    <div className="page" data-testid="stock-page">
      <SearchBar
        key={section}
        value={section === 'metal' ? qMetal : qCash}
        onChange={section === 'metal' ? setQMetal : setQCash}
        placeholder={section === 'metal' ? 'Search stock: item, weight, tunch, date…' : 'Search cash: amount, note, date…'}
        label={section === 'metal' ? 'Search stock entries' : 'Search cash entries'}
        testId="stock-search"
      />

      {/* One summary card for the register being shown (Cash has its own card on Home) */}
      <div className="stock-cards one">
        {section === 'metal' ? (
          <button type="button" className="stock-card on" onClick={onRange} data-testid="card-metal" aria-label="Open Silver / Gold report">
            <span className="stock-card-title"><Icon name="gem" size={18} /> Silver / Gold</span>
            <span className="stock-card-row">
              <span className="stock-card-line"><span>Gold</span><b data-testid="stock-gold-sum-net" className={gold.netWt < 0 ? 'neg' : ''}>{fmtWeight(gold.netWt)} g</b></span>
              <span className="stock-card-line"><span>Silver</span><b data-testid="stock-silver-sum-net" className={silver.netWt < 0 ? 'neg' : ''}>{fmtWeight(silver.netWt)} g</b></span>
            </span>
          </button>
        ) : (
          <button type="button" className="stock-card on" onClick={onRange} data-testid="card-cash" aria-label="Open Cash report">
            <span className="stock-card-title"><Icon name="cash" size={18} /> Cash</span>
            <span className="stock-card-line"><span>In hand</span><b data-testid="cash-balance" className={cashT.balance < 0 ? 'neg' : ''}>{fmtRupees(cashT.balance)}</b></span>
            <span className="stock-card-line muted small"><span>In {fmtRupees(cashT.inAmt)}</span><span>Out {fmtRupees(cashT.outAmt)}</span></span>
          </button>
        )}
      </div>

      {section === 'metal' ? (
        <div className="stack" data-testid="section-metal">
          <div className="grid-2">
            <button className="btn btn-primary" onClick={() => onEditStock(newStockEntry('in'), true)} data-testid="stock-add-in"><Icon name="plus" size={18} /> Stock IN</button>
            <button className="btn btn-outline" onClick={() => onEditStock(newStockEntry('out'), true)} data-testid="stock-add-out"><Icon name="minus" size={18} /> Stock OUT</button>
          </div>

          {byItem.length > 0 && (
            <section className="card" data-testid="stock-by-item">
              <button type="button" className="drop-head" onClick={() => setItemsOpen(!itemsOpen)} aria-expanded={itemsOpen} data-testid="stock-by-item-toggle">
                <span className="section-title">Stock by item</span>
                <span className={`drop-chev${itemsOpen ? ' open' : ''}`}><Icon name="chevron" size={18} /></span>
              </button>
              {itemsOpen && byItem.map((r) => (
                <div className="kv" key={`${r.metal}|${r.item}`} data-testid="stock-item-row">
                  <span>{r.item} <span className="muted small">· {r.metal === 'gold' ? 'Gold' : 'Silver'}</span></span>
                  <span className={r.netWt < 0 ? 'neg' : ''}><b>{fmtWeight(r.netWt)} g</b> <span className="muted small">{r.netPcs} pcs</span></span>
                </div>
              ))}
            </section>
          )}

          <div className="stock-filters">
            <TypeSeg value={typeF} onChange={setTypeF} />
            <div className="seg" role="group" aria-label="Metal">
              {(['all', 'gold', 'silver'] as const).map((f) => (
                <button key={f} className={metalF === f ? 'on' : ''} onClick={() => setMetalF(f)}>{f === 'all' ? 'Both' : f === 'gold' ? 'Gold' : 'Silver'}</button>
              ))}
            </div>
          </div>

          {stock.length === 0 && (
            <div className="card empty">
              <p>No stock entries yet.</p>
              <p className="muted small">Tap Stock IN, take a photo of the piece, choose its item and enter weight and tunch.</p>
            </div>
          )}
          {qMetal.trim() && stock.length > 0 && <p className="muted small search-count" data-testid="stock-search-count">{stockList.length} of {stock.length} entries match “{qMetal.trim()}”</p>}
          {stock.length > 0 && stockList.length === 0 && <div className="card empty"><p className="muted">{qMetal.trim() ? `No entry matches “${qMetal.trim()}”.` : 'Nothing matches this filter.'}</p></div>}

          {stockList.map((e) => (
            <section className={`card stock-row${e.type === 'in' && !inStock.has(e.id) ? ' exited' : ''}`} key={e.id} data-testid="stock-row">
              <button className="stock-main" onClick={() => onEditStock(e, false)} aria-label={`Open ${e.item || 'entry'}`}>
                <Thumb photoId={e.photoId} />
                <span className="stock-info">
                  <b>{e.item || 'Unnamed'}</b>
                  <span className="muted small">{fmtDate(e.date)} · {e.metal === 'gold' ? 'Gold' : 'Silver'}{e.tunch > 0 ? ` · ${fmtPercent(e.tunch)}%` : ''}{e.note ? ` · ${e.note}` : ''}</span>
                </span>
                <span className={`stock-amt ${e.type}`}>
                  <b>{e.type === 'in' ? '+' : '−'}{fmtWeight(e.weight)} g</b>
                  {e.pcs > 0 && <span className="muted small">{e.pcs} pcs</span>}
                </span>
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="stack" data-testid="section-cash">
          <div className="grid-2">
            <button className="btn btn-primary" onClick={() => setCashEdit({ entry: newCashEntry('in'), isNew: true })} data-testid="cash-add-in"><Icon name="plus" size={18} /> Cash IN</button>
            <button className="btn btn-outline" onClick={() => setCashEdit({ entry: newCashEntry('out'), isNew: true })} data-testid="cash-add-out"><Icon name="minus" size={18} /> Cash OUT</button>
          </div>

          <div className="stock-filters"><TypeSeg value={cashF} onChange={setCashF} /></div>

          {cash.length === 0 && (
            <div className="card empty">
              <p>No cash entries yet.</p>
              <p className="muted small">Tap Cash IN when money comes into the shop and Cash OUT when it is paid out.</p>
            </div>
          )}
          {qCash.trim() && cash.length > 0 && <p className="muted small search-count" data-testid="stock-search-count">{cashList.length} of {cash.length} entries match “{qCash.trim()}”</p>}
          {cash.length > 0 && cashList.length === 0 && <div className="card empty"><p className="muted">{qCash.trim() ? `No entry matches “${qCash.trim()}”.` : 'Nothing matches this filter.'}</p></div>}

          {cashList.map((e) => (
            <section className="card stock-row" key={e.id} data-testid="cash-row">
              <div className="stock-main static">
                <span className="stock-info">
                  <b>{e.note || (e.type === 'in' ? 'Cash received' : 'Cash paid')}</b>
                  <span className="muted small">{fmtDate(e.date)}</span>
                </span>
                <span className={`stock-amt ${e.type}`}><b>{e.type === 'in' ? '+' : '−'}{fmtRupees(e.amount)}</b></span>
              </div>
            </section>
          ))}
        </div>
      )}

      {cashEdit && (
        <CashEntryModal
          initial={cashEdit.entry}
          isNew={cashEdit.isNew}
          onClose={() => setCashEdit(null)}
          onSave={(e) => { store.saveCash(e); setCashEdit(null); setToast(cashEdit.isNew ? 'Cash entry saved.' : 'Entry updated.'); }}
        />
      )}
    </div>
  );
}
