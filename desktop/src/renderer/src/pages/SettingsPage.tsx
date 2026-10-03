import { useEffect, useState } from 'react';
import { LABOUR_MODE_LABEL, RATE_UNIT_LABEL, newId, type LabourMode, type Product, type RateUnit, type ShopSettings } from '@shared';
import { Icon, NumberInput } from '../components/ui';

const units = Object.keys(RATE_UNIT_LABEL) as RateUnit[];
const modes = Object.keys(LABOUR_MODE_LABEL) as LabourMode[];

export function SettingsPage(props: {
  settings: ShopSettings;
  products: Product[];
  dataFile: string;
  version: string;
  onSaveSettings: (s: ShopSettings) => Promise<boolean>;
  onSaveProducts: (p: Product[]) => Promise<boolean>;
}) {
  const [s, setS] = useState(props.settings);
  const [prods, setProds] = useState(props.products);
  useEffect(() => setS(props.settings), [props.settings]);
  useEffect(() => setProds(props.products), [props.products]);

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setP = (id: string, patch: Partial<Product>) => setProds((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const sChanged = JSON.stringify(s) !== JSON.stringify(props.settings);
  const pChanged = JSON.stringify(prods) !== JSON.stringify(props.products);

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="two-col">
        <section className="card">
          <h3>Shop</h3>
          <div className="form-grid">
            <label className="field">
              <span>Shop name (printed, line 1)</span>
              <input value={s.shopName} maxLength={60} onChange={(e) => set('shopName', e.target.value)} />
            </label>
            <label className="field">
              <span>Location / code (printed, line 2)</span>
              <input value={s.shopCode} maxLength={80} onChange={(e) => set('shopCode', e.target.value)} />
            </label>
            <label className="field span2">
              <span>Shop address</span>
              <input value={s.address} maxLength={300} onChange={(e) => set('address', e.target.value)} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={s.phone} maxLength={40} onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="field">
              <span>GST number (optional)</span>
              <input value={s.gstNumber} maxLength={20} onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} />
            </label>
          </div>
          <p className="muted small">Only the two header lines are printed on the estimate. Address, phone and GST number are kept for your records.</p>
        </section>

        <section className="card">
          <h3>Pricing defaults (for new estimates)</h3>
          <div className="form-grid">
            <label className="field">
              <span>Default gold rate (fine)</span>
              <div className="inline">
                <NumberInput value={s.defaultGoldRate} decimals={2} blankZero={false} onValue={(n) => set('defaultGoldRate', n)} />
                <select value={s.goldRateUnit} onChange={(e) => set('goldRateUnit', e.target.value as RateUnit)}>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {RATE_UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span>Default silver rate (fine)</span>
              <div className="inline">
                <NumberInput value={s.defaultSilverRate} decimals={2} blankZero={false} onValue={(n) => set('defaultSilverRate', n)} />
                <select value={s.silverRateUnit} onChange={(e) => set('silverRateUnit', e.target.value as RateUnit)}>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {RATE_UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span>Default labour</span>
              <div className="inline">
                <NumberInput value={s.defaultLabour} decimals={2} blankZero={false} onValue={(n) => set('defaultLabour', n)} />
                <select value={s.defaultLabourMode} onChange={(e) => set('defaultLabourMode', e.target.value as LabourMode)}>
                  {modes.map((m) => (
                    <option key={m} value={m}>
                      {LABOUR_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span>Silver (fine weight) formula</span>
              <select value={s.fineFormula} onChange={(e) => set('fineFormula', e.target.value === 'tunch_only' ? 'tunch_only' : 'tunch_plus_wastage')}>
                <option value="tunch_plus_wastage">Net × (Tunch + Wstg) ÷ 100</option>
                <option value="tunch_only">Net × Tunch ÷ 100</option>
              </select>
            </label>
            <label className="field">
              <span>GST</span>
              <div className="inline">
                <label className="check">
                  <input type="checkbox" checked={s.gstEnabled} onChange={(e) => set('gstEnabled', e.target.checked)} /> Enabled
                </label>
                <NumberInput className="tiny" value={s.gstPercent} decimals={2} blankZero={false} disabled={!s.gstEnabled} onValue={(n) => set('gstPercent', n)} />%
              </div>
            </label>
            <label className="field">
              <span>Rounding</span>
              <label className="check">
                <input type="checkbox" checked={s.roundGrandTotal} onChange={(e) => set('roundGrandTotal', e.target.checked)} /> Round grand total to the rupee
              </label>
            </label>
          </div>
          <p className="muted small">Amount = Silver (fine weight) × metal rate + Labour (+ other charges, + GST if enabled). Each estimate keeps the rates it was made with.</p>
        </section>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary" disabled={!sChanged || !s.shopName.trim()} onClick={() => void props.onSaveSettings(s)}>
          <Icon name="save" /> Save settings
        </button>
        {sChanged && (
          <button className="btn btn-ghost" onClick={() => setS(props.settings)}>
            Undo changes
          </button>
        )}
      </div>

      <section className="card">
        <h3>Products</h3>
        <p className="muted small">These appear as suggestions in the Description column. Picking one fills in metal, Tunch, Wstg and Labour.</p>
        <table className="list products">
          <thead>
            <tr>
              <th className="l">Name</th>
              <th className="l">Metal</th>
              <th>Tunch %</th>
              <th>Wstg %</th>
              <th>Labour</th>
              <th className="l">Labour basis</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prods.map((p) => (
              <tr key={p.id}>
                <td className="l">
                  <input value={p.name} maxLength={200} onChange={(e) => setP(p.id, { name: e.target.value })} />
                </td>
                <td className="l">
                  <select value={p.metal} onChange={(e) => setP(p.id, { metal: e.target.value === 'gold' ? 'gold' : 'silver' })}>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                  </select>
                </td>
                <td>
                  <NumberInput className="num" decimals={2} blankZero={false} value={p.tunch} onValue={(n) => setP(p.id, { tunch: n })} />
                </td>
                <td>
                  <NumberInput className="num" decimals={2} blankZero={false} value={p.wastage} onValue={(n) => setP(p.id, { wastage: n })} />
                </td>
                <td>
                  <NumberInput className="num" decimals={2} blankZero={false} value={p.labourRate} onValue={(n) => setP(p.id, { labourRate: n })} />
                </td>
                <td className="l">
                  <select value={p.labourMode} onChange={(e) => setP(p.id, { labourMode: e.target.value as LabourMode })}>
                    {modes.map((m) => (
                      <option key={m} value={m}>
                        {LABOUR_MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="icon-btn danger" title="Remove product" onClick={() => setProds((l) => l.filter((x) => x.id !== p.id))}>
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="save-bar">
          <button className="btn" onClick={() => setProds((l) => [...l, { id: newId(), name: '', metal: 'silver', tunch: 0, wastage: 0, labourRate: 0, labourMode: 'per_gram' }])}>
            <Icon name="plus" /> Add product
          </button>
          <button className="btn btn-primary" disabled={!pChanged || prods.some((p) => !p.name.trim())} onClick={() => void props.onSaveProducts(prods)}>
            <Icon name="save" /> Save products
          </button>
          {pChanged && prods.some((p) => !p.name.trim()) && <span className="muted small">Every product needs a name.</span>}
        </div>
      </section>

      <p className="muted small about">
        Version {props.version} · Works offline · Data file: {props.dataFile}
      </p>
    </div>
  );
}
