import { useState, type ReactNode } from 'react';
import { ProductPicker } from '../components/ProductPicker';
import { ProductsModal } from '../components/ProductsModal';
import { submittedRate, paidTotal, calcEstimate, cloneItem, defaultTunch, DEFAULT_KARAT, purityForKarat, usesTunch, fmtMoney, fmtPercent, fmtRupees, fmtWeight,
  itemFromProduct, newItem, switchMakingMode, type EstimateItem,
} from '@shared';
import { Icon } from '../components/Icon';
import { NumField, ReadField } from '../components/NumField';
import type { AppStore } from '../lib/store';

interface Props {
  store: AppStore;
  invalid: Set<string>;
  onSave: () => void;
  onPreview: () => void;
  confirm: (title: string, body: ReactNode, ok: string, danger?: boolean) => Promise<boolean>;
}


export function EstimatePage({ store, invalid, onSave, onPreview, confirm }: Props) {
  const [pickFor, setPickFor] = useState<string | null>(null);
  // The item whose name is being typed (the pencil beside the item chooser).
  const [editName, setEditName] = useState<string | null>(null);
  // "+" in the picker opens the Products pop-up right here; closing it brings the picker back.
  const [managingFor, setManagingFor] = useState<string | null>(null);
  const { est, setEst, settings, products } = store;
  const totals = calcEstimate(est);

  const update = (patch: Partial<typeof est>) => setEst({ ...est, ...patch, updatedAt: new Date().toISOString() });
  const setItem = (id: string, patch: Partial<EstimateItem>) => update({ items: est.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const addItem = () => {
    const it = newItem(settings, est.items.at(-1)?.metal ?? 'silver');
    update({ items: [...est.items, it] });
    setPickFor(it.id); // choose the item straight away
  };

  const removeItem = async (it: EstimateItem, n: number) => {
    const blank = !it.description.trim() && !it.grossWt;
    if (!blank && !(await confirm(`Delete item ${n}?`, it.description || 'This item will be removed.', 'Delete', true))) return;
    update({ items: est.items.filter((x) => x.id !== it.id) });
  };

  const clear = async () => {
    if (!(await confirm('Clear this estimate?', 'All items, charges and customer details on this estimate will be removed.', 'Clear', true))) return;
    update({ items: [], otherCharges: [], customerName: '', customerPhone: '', customerLocality: '' });
  };

  return (
    <div className="page" data-testid="estimate-page">
      <section className="card" data-testid="customer-card">
        <div className="stack">
          <label className="field">
            <span className="field-label">Customer name</span>
            <span className="field-box"><input value={est.customerName} onChange={(e) => update({ customerName: e.target.value })} autoComplete="off" autoCapitalize="words" data-testid="customer-name" /></span>
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Contact number</span>
              <span className="field-box"><input value={est.customerPhone} onChange={(e) => update({ customerPhone: e.target.value.replace(/[^0-9+ ]/g, '') })} inputMode="tel" autoComplete="off" data-testid="customer-phone" /></span>
            </label>
            <label className="field">
              <span className="field-label">Address</span>
              <span className="field-box"><input value={est.customerLocality ?? ''} onChange={(e) => update({ customerLocality: e.target.value })} autoComplete="off" autoCapitalize="words" data-testid="customer-locality" /></span>
            </label>
          </div>
        </div>
      </section>

      {est.items.map((it, idx) => {
        const c = totals.items[idx];
        return (
          <section key={it.id} className={`card item-card${invalid.has(it.id) ? ' has-error' : ''}`} data-testid="item-card">
            <div className="item-head">
              <span className="item-no">Item {idx + 1}</span>
              <div className="seg" role="group" aria-label="Metal">
                {(['gold', 'silver'] as const).map((m) => (
                  <button key={m} className={it.metal === m ? 'on' : ''} onClick={() => it.metal !== m && setItem(it.id, { metal: m, tunch: m === 'gold' ? purityForKarat(settings.karatTable, DEFAULT_KARAT) : defaultTunch(m), karat: m === 'gold' ? DEFAULT_KARAT : undefined, labourRate: 0, labourMode: m === 'gold' ? 'percent' : 'fixed' })} aria-pressed={it.metal === m}>
                    {m === 'gold' ? 'Gold' : 'Silver'}
                  </button>
                ))}
              </div>
              <div className="item-tools">
                <button className="icon-btn" onClick={() => update({ items: [...est.items.slice(0, idx + 1), cloneItem(it), ...est.items.slice(idx + 1)] })} aria-label={`Duplicate item ${idx + 1}`} data-testid="duplicate">
                  <Icon name="copy" size={18} />
                </button>
                <button className="icon-btn danger" onClick={() => void removeItem(it, idx + 1)} aria-label={`Delete item ${idx + 1}`} data-testid="delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
            <div className="row-desc">
              <label className="field">
                <span className="field-label">Description</span>
                <span className="field-box">
                  {editName === it.id ? (
                    <input
                      className="desc-input"
                      autoFocus
                      value={it.description}
                      onChange={(e) => setItem(it.id, { description: e.target.value })}
                      onBlur={() => setEditName(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Item name"
                      autoComplete="off"
                      data-testid="desc-input"
                    />
                  ) : (
                    <>
                      <button type="button" className={`picker-field${it.description ? '' : ' empty'}`} onClick={() => setPickFor(it.id)} data-testid="desc" data-value={it.description} aria-haspopup="dialog">
                        <span>{it.description || 'Choose an item'}</span>
                        <Icon name="chevron" size={18} />
                      </button>
                      <button type="button" className="desc-edit" onClick={() => setEditName(it.id)} aria-label="Edit the item name" data-testid="desc-edit"><Icon name="draft" size={17} /></button>
                    </>
                  )}
                </span>
              </label>
              {it.metal === 'gold' && it.karat !== undefined
                ? <NumField label="Karat" value={it.karat} onChange={(n) => setItem(it.id, { karat: n, tunch: purityForKarat(settings.karatTable, n) })} step="int" suffix="K" testId="karat" />
                : usesTunch(it, est.pricing) && <NumField label="Tunch" value={it.tunch} onChange={(n) => setItem(it.id, { tunch: n })} step="percent" suffix="%" testId="tunch" />}
            </div>
            <div className="grid-3">
              <NumField label="G. Wt." value={it.grossWt} onChange={(n) => setItem(it.id, { grossWt: n })} step="weight" suffix="g" testId="gross" />
              <NumField label="Less Wt." value={it.lessWt} onChange={(n) => setItem(it.id, { lessWt: n })} step="weight" suffix="g" testId="less" />
              <ReadField label="Net Wt." value={fmtWeight(c.netWt)} testId="net" />
            </div>
            <div className="grid-2">
              <NumField label="No. of pieces" value={it.pcs} onChange={(n) => setItem(it.id, { pcs: n })} step="int" testId="pcs" />
              {it.labourMode === 'percent' ? (
                <NumField label="Making charge (%)" value={it.labourRate} onChange={(n) => setItem(it.id, { labourRate: n, labourMode: 'percent' })} step="percent" suffix="%" testId="labour" />
              ) : (
                <NumField label="Making charge (₹)" value={it.labourRate} onChange={(n) => setItem(it.id, { labourRate: n, labourMode: 'fixed' })} testId="labour" />
              )}
            </div>
            <div className="making-switch" role="group" aria-label="Enter making charge as">
              <span className="muted small">Enter making charge as</span>
              <div className="seg">
                <button type="button" className={it.labourMode === 'percent' ? 'on' : ''} aria-pressed={it.labourMode === 'percent'} onClick={() => update({ items: est.items.map((x) => (x.id === it.id ? switchMakingMode(x, est.pricing, 'percent') : x)) })} data-testid="making-pct">%</button>
                <button type="button" className={it.labourMode !== 'percent' ? 'on' : ''} aria-pressed={it.labourMode !== 'percent'} onClick={() => update({ items: est.items.map((x) => (x.id === it.id ? switchMakingMode(x, est.pricing, 'fixed') : x)) })} data-testid="making-amt">₹ amount</button>
              </div>
            </div>
            {it.labourMode === 'percent' && it.labourRate > 0 && <p className="muted small making-note" data-testid="making-note">Making charge = {fmtRupees(c.labour)} ({fmtPercent(it.labourRate)}% of {it.metal === 'gold' ? 'gold' : 'silver'} value)</p>}
            <ReadField label="Item amount" value={fmtRupees(c.amount)} testId="amount" strong />
          </section>
        );
      })}

      <div className="row-actions">
        <button className="btn btn-primary grow" onClick={addItem} data-testid="add-item"><Icon name="plus" size={18} /> Add item</button>
        {est.items.length > 0 && <button className="btn btn-plain" onClick={() => void clear()} data-testid="clear">Clear</button>}
      </div>

      {est.items.length > 0 && (<>

      <section className="card summary-card">
        <div className="section-title">Totals</div>
        <div className="kv"><span>No. of items</span><span data-testid="total-items">{totals.pcs}</span></div>
        <div className="kv"><span>Total G. Wt.</span><span>{fmtWeight(totals.grossWt)} g</span></div>
        <div className="kv"><span>Total Net Wt.</span><span>{fmtWeight(totals.netWt)} g</span></div>
        <div className="kv"><span>Total Fine wt.</span><span>{fmtWeight(totals.fineWt)} g</span></div>
      </section>

      <section className="card summary-card" data-testid="deposit-card">
        <div className="section-title">Payment</div>
        <NumField label="Amount deposited (₹)" value={est.advance ?? 0} onChange={(n) => update({ advance: n })} step="int" testId="deposit" />
        {(['gold', 'silver'] as const).map((m) => (
          <div className="grid-2" key={m}>
            <NumField label={`Submitted ${m} (g)`} value={est.submitted?.[m] ?? 0} onChange={(n) => update({ submitted: { ...est.submitted, [m]: n } })} step="weight" suffix="g" testId={`submitted-${m}`} />
            <NumField label={m === 'gold' ? 'Gold rate (24K, ₹ per 10 g)' : 'Silver rate (₹ per 10 g)'} value={submittedRate(est, m)} onChange={(n) => update({ submitted: { ...est.submitted, [m === 'gold' ? 'goldRate' : 'silverRate']: n } })} step="money" testId={`submitted-${m}-rate`} />
          </div>
        ))}
        {(totals.submittedCredit.gold > 0 || totals.submittedCredit.silver > 0) && (
          <div className="deposit-list" data-testid="deposit-list">
            {(['gold', 'silver'] as const).filter((m) => totals.submittedCredit[m] > 0).map((m) => (
              <div className="kv" key={m}><span>Less: submitted {m} {fmtWeight(est.submitted?.[m] ?? 0)} g</span><b data-testid={`credit-${m}`}>−{fmtRupees(totals.submittedCredit[m])}</b></div>
            ))}
          </div>
        )}
        <p className="muted small">The rate here is for the submitted metal only (it starts at the bill's 24K rate; change it if you agreed another price). It is valued at the same karat / tunch as the one bought and cut from the bill. Gold or silver submitted later is added from the final bill the same way.</p>
        <div className="kv"><span>Bill total</span><span data-testid="dep-total">{fmtRupees(totals.grandTotal)}</span></div>
        <div className="kv"><span>Left to pay</span><b data-testid="dep-left">{fmtRupees(Math.max(0, totals.grandTotal - Math.round(est.advance ?? 0) - paidTotal(est)))}</b></div>
        <p className="muted small">The amount deposited is saved with today's day and date when you save the bill. More can be added later from the bill.</p>
      </section>

      <div className="totals-bar" data-testid="totals">
        <div className="totals-small">
          <span>Subtotal <b data-testid="subtotal">{fmtMoney(totals.subtotal)}</b></span>
          {est.pricing.gstEnabled && <span>GST {est.pricing.gstPercent}% <b data-testid="gst">{fmtMoney(totals.gst)}</b></span>}
        </div>
        <div className="totals-grand">
          <span>Grand Total</span>
          <b data-testid="grand-total">{fmtRupees(totals.grandTotal)}</b>
        </div>
        <div className="bar-actions">
          <button className="btn btn-outline" onClick={onPreview} data-testid="preview">Preview</button>
          <button className="btn btn-primary" onClick={onSave} data-testid="save">Save</button>
        </div>
      </div>
      </>)}
      {pickFor && (
        <ProductPicker
          products={products}
          selected={est.items.find((i) => i.id === pickFor)?.description ?? ''}
          onClose={() => setPickFor(null)}
          onPick={(p) => {
            const it = est.items.find((i) => i.id === pickFor);
            if (it) setItem(it.id, itemFromProduct(p, { ...it, description: p.name }));
            setPickFor(null);
          }}
          onAdd={() => { setManagingFor(pickFor); setPickFor(null); }}
        />
      )}
      {managingFor && (
        <ProductsModal
          products={products}
          startAdd
          defaultLabour={settings.defaultLabour}
          defaultLabourMode={settings.defaultLabourMode}
          onChange={store.setProducts}
          onClose={() => { setPickFor(managingFor); setManagingFor(null); }}
        />
      )}
    </div>
  );
}
