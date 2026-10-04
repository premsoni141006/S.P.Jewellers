import { useMemo, useState } from 'react';
import { calcEstimate, fmtDate, fmtEstimateNo, fmtRupees, searchEstimates, searchProducts, type Estimate } from '@shared';
import { Icon } from '../components/Icon';
import { Ornament } from '../components/AppBar';
import { summarize, type AppStore } from '../lib/store';

interface Props {
  store: AppStore;
  onSettings: () => void;
  onProducts: () => void;
  onRates: () => void;
  onStock: () => void;
  onCash: () => void;
  onHistory: () => void;
  onView: (e: Estimate) => void;
}

const STATUS = { printed: ['Printed', 'ok'], failed: ['Print failed', 'bad'], not_printed: ['Not printed', 'muted'] } as const;

export function HomePage({ store, onSettings, onProducts, onRates, onStock, onCash, onHistory, onView }: Props) {
  const { settings, history, products } = store;
  const [q, setQ] = useState('');
  const searching = q.trim() !== '';
  const orders = useMemo(() => searchEstimates(history, q), [history, q]);
  const found = useMemo(() => searchProducts(products, q), [products, q]);
  const recent = [...history].sort((a, b) => b.number - a.number).slice(0, 3);

  const tiles = [
    { icon: 'products', title: 'Products', sub: 'Manage items', on: onProducts, id: 'tile-products' },
    { icon: 'rates', title: 'Rates', sub: 'Gold / Silver rates', on: onRates, id: 'tile-rates' },
    { icon: 'stock', title: 'Shop stock', sub: 'Stock in and out', on: onStock, id: 'tile-stock' },
    { icon: 'cash', title: 'Cash', sub: 'Cash in and out', on: onCash, id: 'tile-cash' },
  ];

  return (
    <div className="home" data-testid="home-page">
      <div className="home-head">
        <div className="home-top">
          <button className="bar-btn" onClick={onSettings} aria-label="Settings" data-testid="open-settings"><Icon name="settings" size={22} /></button>
        </div>
        <div className="home-brand">
          <img className="home-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" width="96" height="96" />
          <div className="wordmark" data-testid="home-brand">{settings.shopName || 'S.P. JEWELLERS'}</div>
          <Ornament />
        </div>

        <div className="searchbar" role="search">
          <Icon name="search" size={20} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, items, or orders..."
            aria-label="Search products, items, or orders"
            data-testid="home-search"
          />
          {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear search" data-testid="home-search-clear">✕</button>}
        </div>

        <div className="tiles">
          {tiles.map((t) => (
            <button key={t.id} className="tile" onClick={t.on} data-testid={t.id}>
              <span className="tile-icon"><Icon name={t.icon} size={24} /></span>
              <span className="tile-text"><b>{t.title}</b><span className="small">{t.sub}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="home-panel">
        {searching ? (
          <div className="results" data-testid="search-results">
            <h2 className="results-title" data-testid="search-count">
              {orders.length + found.length === 0 ? 'Nothing found' : `${orders.length} order${orders.length === 1 ? '' : 's'}${found.length ? ` · ${found.length} product${found.length === 1 ? '' : 's'}` : ''} found`}
            </h2>
            {orders.length + found.length === 0 && <p className="muted small">Nothing matches “{q.trim()}”. Try a different word.</p>}
            {found.map((p) => (
              <button key={p.id} className="result-card" onClick={onProducts} data-testid="search-product">
                <span className="result-top"><b>{p.name}</b><span className="muted small">Product</span></span>
                <span className="muted small">Tunch {p.tunch}%</span>
              </button>
            ))}
            {orders.map((e) => {
              const names = e.items.map((i) => i.description).filter(Boolean);
              return (
                <button key={e.id} className="result-card" onClick={() => onView(e)} data-testid="search-result">
                  {e.billStatus === 'pending' && <span className="status-dot dot-draft" role="img" aria-label="Pending" />}
                  {e.billStatus === 'clear' && <span className="status-dot dot-done" role="img" aria-label="Clear" />}
                  <span className="result-top">
                    <b>{fmtEstimateNo(e.number)}</b>
                    <b className="result-amt">{fmtRupees(calcEstimate(e).grandTotal)}</b>
                  </span>
                  <span className="muted small">{fmtDate(e.createdAt)}{e.customerName.trim() ? ` · ${e.customerName.trim()}` : ''}{(e.customerLocality ?? '').trim() ? ` · ${(e.customerLocality ?? '').trim()}` : ''}</span>
                  <span className="muted small result-items">{names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2} more` : ''}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="recent" data-testid="recent-card">
            <div className="recent-head">
              <h2>Recent orders</h2>
              <button className="view-all" onClick={onHistory} data-testid="recent-open-history">View all <Icon name="next" size={14} /></button>
            </div>
            {recent.length === 0 ? (
              <p className="muted small recent-empty">No saved orders yet. They show up here after Save.</p>
            ) : (
              <ul className="recent-list" data-testid="recent-list">
                {recent.map((e) => {
                  const s = summarize(e);
                  const [label, tone] = STATUS[s.printStatus];
                  return (
                    <li key={e.id}>
                      <button className="recent-row" onClick={() => onView(e)}>
                        <span className="recent-ico"><Icon name="estimate" size={22} /></span>
                        <span className="recent-l"><b>{fmtEstimateNo(s.number)}</b><span className="muted small">{fmtDate(s.updatedAt)}</span></span>
                        <span className="recent-r"><b>{fmtRupees(s.grandTotal)}</b><span className={`small st-${tone}`}>{label}</span></span>
                        <span className="recent-go" aria-hidden="true"><Icon name="next" size={16} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
