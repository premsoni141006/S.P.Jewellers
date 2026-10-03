import { useState, type ReactNode } from 'react';
import {
  RATE_UNIT_LABEL, newId,
  type Product, type RateUnit, type ShopSettings,
} from '@shared';
import { Icon } from '../components/Icon';
import { NumField } from '../components/NumField';
import type { AppStore } from '../lib/store';
import { isNative } from '../lib/native';

interface Props {
  store: AppStore;
  confirm: (title: string, body: ReactNode, ok: string, danger?: boolean) => Promise<boolean>;
  setToast: (s: string) => void;
  onPrinter: () => void;
}

const UNITS = Object.keys(RATE_UNIT_LABEL) as RateUnit[];

function Text({ label, value, onChange, hint, testId }: { label: string; value: string; onChange: (v: string) => void; hint?: string; testId?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box"><input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} autoComplete="off" /></span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function SettingsPage({ store, confirm, setToast, onPrinter }: Props) {
  const { settings: s, setSettings, products, setProducts } = store;
  const [editing, setEditing] = useState<string | null>(null);

  const set = (patch: Partial<ShopSettings>) => setSettings({ ...s, ...patch });
  const setProduct = (id: string, patch: Partial<Product>) => setProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="page" data-testid="settings-page">
      <button className="card row-link" onClick={onPrinter} data-testid="open-printer">
        <span className="tile-icon"><Icon name="printer" size={26} /></span>
        <span className="tile-text"><b>Printer settings</b><span className="muted small">{store.printer.mode === 'thermal' ? 'Bluetooth thermal printer' : 'Phone print dialog'}{store.printer.nativeName ? ` · ${store.printer.nativeName}` : ''}</span></span>
        <Icon name="next" size={18} />
      </button>

      <p className="muted small">Changes are saved on this device as you type. New estimates use these defaults.</p>

      <section className="card stack">
        <div className="section-title">Shop</div>
        <Text label="Shop name (printed on the estimate)" value={s.shopName} onChange={(v) => set({ shopName: v })} testId="shop-name" />
        <Text label="Address" value={s.address} onChange={(v) => set({ address: v })} hint="Not printed on the estimate." />
        <Toggle label="Print logo on the estimate (black & white)" checked={s.printLogo !== false} onChange={(v) => set({ printLogo: v })} />
        <Text label="Owner name" value={s.ownerName ?? ''} onChange={(v) => set({ ownerName: v })} hint="Shown in the app header. Not printed." />
        <Text label="Family line" value={s.ownerFamily ?? ''} onChange={(v) => set({ ownerFamily: v })} hint="e.g. Sh. Om Parkash S/o. Sh. Gopal Ram Soni. Not printed." />
        <Text label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} />
        <Text label="GST number (optional)" value={s.gstNumber} onChange={(v) => set({ gstNumber: v })} />
      </section>

      <section className="card stack">
        <div className="section-title">Rates and pricing</div>
        <div className="grid-2">
          <NumField label="Default gold rate" value={s.defaultGoldRate} onChange={(n) => set({ defaultGoldRate: n })} />
          <Select label="Gold rate is" value={s.goldRateUnit} options={UNITS.map((u) => [u, RATE_UNIT_LABEL[u]])} onChange={(v) => set({ goldRateUnit: v })} />
          <NumField label="Default silver rate" value={s.defaultSilverRate} onChange={(n) => set({ defaultSilverRate: n })} />
          <Select label="Silver rate is" value={s.silverRateUnit} options={UNITS.map((u) => [u, RATE_UNIT_LABEL[u]])} onChange={(v) => set({ silverRateUnit: v })} />
        </div>
        <p className="muted small">Amount = pure metal weight (Net Wt. × Tunch) × today's rate + making charge. Enter the rate for pure (fine) metal.</p>
        <Toggle label="Charge GST" checked={s.gstEnabled} onChange={(v) => set({ gstEnabled: v })} />
        {s.gstEnabled && <NumField label="GST %" value={s.gstPercent} onChange={(n) => set({ gstPercent: n })} suffix="%" />}
      </section>

      <section className="card" id="products-section">
        <div className="section-title">Products</div>
        <p className="muted small">Shown as suggestions in Description. Picking one fills its tunch. Gold or Silver, and the making charge, are entered on the item when you make the estimate.</p>
        {products.map((p) => (
          <div className="product" key={p.id} data-testid="product">
            {editing === p.id ? (
              <div className="stack">
                <Text label="Name" value={p.name} onChange={(v) => setProduct(p.id, { name: v })} />
                <div className="grid-2">
                  <NumField label="Tunch" value={p.tunch} onChange={(n) => setProduct(p.id, { tunch: n })} suffix="%" />
                </div>
                <div className="row-actions">
                  <button className="btn btn-primary grow" onClick={() => { setEditing(null); setToast('Product saved.'); }}>Done</button>
                  <button
                    className="btn btn-plain danger-text"
                    onClick={async () => {
                      if (!(await confirm('Delete product?', p.name || 'This product', 'Delete', true))) return;
                      setProducts(products.filter((x) => x.id !== p.id));
                      setEditing(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button className="product-row" onClick={() => setEditing(p.id)}>
                <span>
                  <b>{p.name || 'Untitled'}</b>
                  <span className="muted small block">
                    Tunch {p.tunch}%
                  </span>
                </span>
                <span className="link-btn">Edit</span>
              </button>
            )}
          </div>
        ))}
        <button
          className="link-btn"
          onClick={() => {
            const p: Product = { id: newId(), name: '', metal: 'silver', tunch: 0, wastage: 0, labourRate: 0, labourMode: 'fixed' };
            setProducts([...products, p]);
            setEditing(p.id);
          }}
        >
          + Add product
        </button>
      </section>
      <p className="muted small center">{isNative() ? 'Everything is saved on this phone and works without internet.' : 'Data is stored only in this browser. Clearing site data removes it.'}</p>
    </div>
  );
}
