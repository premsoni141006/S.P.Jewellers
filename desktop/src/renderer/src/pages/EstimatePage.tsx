import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  LABOUR_MODE_LABEL,
  LABOUR_MODE_SHORT,
  RATE_UNIT_LABEL,
  calcEstimate,
  cloneItem,
  fmtDateTime,
  fmtEstimateNo,
  fmtMoney,
  fmtPercent,
  fmtWeight,
  itemFromProduct,
  newId,
  newItem,
  silverRateText,
  type Estimate,
  type EstimateItem,
  type LabourMode,
  type Product,
  type ShopSettings,
} from '@shared';
import { Badge, Icon, NumberInput } from '../components/ui';

const NEXT_MODE: Record<LabourMode, LabourMode> = { per_gram: 'per_piece', per_piece: 'fixed', fixed: 'per_gram' };

// Editable columns in tab order; Enter moves down a column.
const COLS = ['desc', 'gross', 'less', 'tunch', 'wstg', 'pcs', 'labour', 'amount'] as const;

export function EstimatePage(props: {
  est: Estimate;
  setEst: (fn: (e: Estimate) => Estimate) => void;
  settings: ShopSettings;
  products: Product[];
  dirty: boolean;
  invalidIds: Set<string>;
  issues: string[];
  onDismissIssues: () => void;
  printerLabel: string;
  busy: boolean;
  onNew: () => void;
  onSave: () => void;
  onPreview: () => void;
  onPrint: () => void;
  onPrinterSettings: () => void;
  onClear: () => void;
}) {
  const { est, setEst, settings, products } = props;
  const totals = useMemo(() => calcEstimate(est), [est]);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);

  const updateItem = (id: string, patch: Partial<EstimateItem>) =>
    setEst((e) => ({ ...e, items: e.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = (focus = true) => {
    const it = newItem(settings, est.items.at(-1)?.metal ?? 'silver');
    setEst((e) => ({ ...e, items: [...e.items, it] }));
    if (focus) setTimeout(() => document.querySelector<HTMLInputElement>(`[data-cell="${it.id}:desc"]`)?.focus(), 0);
  };

  const onDescChange = (it: EstimateItem, value: string) => {
    const p = products.find((x) => x.name.toLowerCase() === value.trim().toLowerCase());
    // Picking a product from the list fills its defaults; typing freely only sets the text.
    if (p && p.name !== it.description) {
      setEst((e) => ({ ...e, items: e.items.map((x) => (x.id === it.id ? itemFromProduct(p, x) : x)) }));
    } else {
      updateItem(it.id, { description: value });
    }
  };

  const onCellKey = (e: KeyboardEvent<HTMLInputElement>, row: number, col: (typeof COLS)[number]) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (row === est.items.length - 1) {
      addItem(false);
      setTimeout(() => focusCell(row + 1, 'desc'), 0);
    } else focusCell(row + 1, col);
  };
  const focusCell = (row: number, col: string) => {
    const el = document.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
  };
  const cell = (it: EstimateItem, row: number, col: (typeof COLS)[number]) => ({
    'data-row': row,
    'data-col': col,
    'data-cell': `${it.id}:${col}`,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => onCellKey(e, row, col),
  });

  const p = est.pricing;
  const silverRate = silverRateText(est);
  const setPricing = (patch: Partial<Estimate['pricing']>) => setEst((e) => ({ ...e, pricing: { ...e.pricing, ...patch } }));

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={props.onNew}>
            <Icon name="plus" /> New Estimate
          </button>
          <button className="btn" onClick={props.onSave} disabled={props.busy}>
            <Icon name="save" /> Save Estimate
          </button>
          <button className="btn" onClick={props.onPreview}>
            <Icon name="eye" /> Print Preview
          </button>
          <button className="btn btn-primary" onClick={props.onPrint} disabled={props.busy}>
            <Icon name="print" /> Print
          </button>
          <button className="btn" onClick={props.onPrinterSettings}>
            <Icon name="gear" /> Printer Settings
          </button>
        </div>
        <div className="est-meta">
          <span className="est-no">{fmtEstimateNo(est.number)}</span>
          {est.number > 0 && <span className="muted">{fmtDateTime(est.createdAt)}</span>}
          {est.printStatus === 'printed' && <Badge tone="ok">Printed</Badge>}
          {est.printStatus === 'failed' && <Badge tone="err">Print failed</Badge>}
          {props.dirty ? <Badge tone="warn">Unsaved changes · auto-saved as draft</Badge> : est.number > 0 ? <Badge>Saved</Badge> : null}
        </div>
      </div>

      {props.issues.length > 0 && (
        <div className="banner banner-err" role="alert">
          <div>
            <strong>Fix these before printing:</strong>
            <ul>
              {props.issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <button className="icon-btn" onClick={props.onDismissIssues} aria-label="Dismiss">
            <Icon name="close" />
          </button>
        </div>
      )}

      <section className="card info-bar">
        <label className="field">
          <span>Customer name (optional)</span>
          <input value={est.customerName} maxLength={120} onChange={(e) => setEst((x) => ({ ...x, customerName: e.target.value }))} />
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input value={est.customerPhone} maxLength={40} onChange={(e) => setEst((x) => ({ ...x, customerPhone: e.target.value }))} />
        </label>
        <label className="field rate">
          <span>Gold rate (fine) · {RATE_UNIT_LABEL[p.goldRateUnit]}</span>
          <NumberInput value={p.goldRate} decimals={2} blankZero={false} onValue={(n) => setPricing({ goldRate: n })} />
        </label>
        <label className="field rate">
          <span>Silver rate (fine) · {RATE_UNIT_LABEL[p.silverRateUnit]}</span>
          <NumberInput value={p.silverRate} decimals={2} blankZero={false} onValue={(n) => setPricing({ silverRate: n })} />
        </label>
      </section>

      <section className="card grid-card">
        <datalist id="product-list">
          {products.map((pr) => (
            <option key={pr.id} value={pr.name} />
          ))}
        </datalist>
        <div className="grid-scroll">
          <table className="grid">
            <colgroup>
              <col style={{ width: 34 }} />
              <col />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 128 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 128 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th className="l">Description</th>
                <th>G. Wt.</th>
                <th>Less Wt.</th>
                <th>Net Wt.</th>
                <th>Tunch</th>
                <th>Wstg</th>
                <th>Pcs</th>
                <th>Labour</th>
                <th>Silver</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {est.items.map((it, row) => {
                const c = totals.items[row];
                const bad = props.invalidIds.has(it.id);
                return (
                  <tr key={it.id} className={bad ? 'row-bad' : ''}>
                    <td className="idx">{row + 1}</td>
                    <td className="l">
                      <div className="desc-cell">
                        <button
                          className={`metal metal-${it.metal}`}
                          title={`${it.metal === 'gold' ? 'Gold' : 'Silver'} — uses the ${it.metal} rate. Click to switch.`}
                          onClick={() => updateItem(it.id, { metal: it.metal === 'gold' ? 'silver' : 'gold' })}
                        >
                          {it.metal === 'gold' ? 'Gold' : 'Silver'}
                        </button>
                        <input
                          list="product-list"
                          value={it.description}
                          maxLength={200}
                          placeholder="Item description"
                          onChange={(e) => onDescChange(it, e.target.value)}
                          {...cell(it, row, 'desc')}
                        />
                      </div>
                    </td>
                    <td>
                      <NumberInput className="num" value={it.grossWt} onValue={(n) => updateItem(it.id, { grossWt: n })} placeholder="0.000" {...cell(it, row, 'gross')} />
                    </td>
                    <td>
                      <NumberInput className="num" value={it.lessWt} onValue={(n) => updateItem(it.id, { lessWt: n })} placeholder="0.000" {...cell(it, row, 'less')} />
                    </td>
                    <td className="calc">{fmtWeight(c.netWt)}</td>
                    <td>
                      <NumberInput className="num" decimals={2} value={it.tunch} onValue={(n) => updateItem(it.id, { tunch: n })} placeholder="0" {...cell(it, row, 'tunch')} />
                    </td>
                    <td>
                      <NumberInput className="num" decimals={2} value={it.wastage} onValue={(n) => updateItem(it.id, { wastage: n })} placeholder="0" {...cell(it, row, 'wstg')} />
                    </td>
                    <td>
                      <div className="labour-cell">
                        <NumberInput className="num" integer blankZero={false} value={it.pcs} onValue={(n) => updateItem(it.id, { pcs: n })} {...cell(it, row, 'pcs')} />
                        <button className="mode" title="Pieces or pairs (pair prints as “1 P”) — click to change" onClick={() => updateItem(it.id, { pcsUnit: it.pcsUnit === 'pair' ? 'pc' : 'pair' })}>
                          {it.pcsUnit === 'pair' ? 'P' : 'pc'}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="labour-cell" title={`Labour ${LABOUR_MODE_LABEL[it.labourMode]} = ₹ ${fmtMoney(c.labour)}`}>
                        <NumberInput className="num" decimals={2} value={it.labourRate} onValue={(n) => updateItem(it.id, { labourRate: n })} placeholder="0" {...cell(it, row, 'labour')} />
                        <button className="mode" onClick={() => updateItem(it.id, { labourMode: NEXT_MODE[it.labourMode] })} title="Labour per gram / per piece / fixed — click to change">
                          {LABOUR_MODE_SHORT[it.labourMode]}
                        </button>
                      </div>
                      {it.labourMode !== 'fixed' && c.labour > 0 && <div className="sub">= {fmtMoney(c.labour)}</div>}
                    </td>
                    <td className="calc" title={`Fine weight: Net × (Tunch${p.fineFormula === 'tunch_plus_wastage' ? ' + Wstg' : ''}) ÷ 100 = ${fmtWeight(c.fineWt)} g`}>
                      {it.metal === 'silver' ? silverRate : '—'}
                      <div className="sub">fine {fmtWeight(c.fineWt)} g</div>
                    </td>
                    <td>
                      {c.isOverride || editingAmount === it.id ? (
                        <div className="amount-cell">
                          <NumberInput
                            className="num"
                            decimals={2}
                            blankZero={false}
                            autoFocus={editingAmount === it.id}
                            value={it.amountOverride ?? c.amount}
                            onValue={(n) => updateItem(it.id, { amountOverride: n })}
                            onBlur={() => setEditingAmount(null)}
                            {...cell(it, row, 'amount')}
                          />
                          <button className="mode" title="Go back to the calculated amount" onClick={() => updateItem(it.id, { amountOverride: null })}>
                            <Icon name="undo" size={13} />
                          </button>
                        </div>
                      ) : (
                        <button className="amount-btn" title="Calculated: fine weight × rate + labour. Click to type an amount instead." onClick={() => setEditingAmount(it.id)}>
                          {fmtMoney(c.amount)}
                        </button>
                      )}
                      {c.isOverride && <div className="sub">manual</div>}
                    </td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Duplicate item" onClick={() => setEst((e) => ({ ...e, items: e.items.flatMap((x) => (x.id === it.id ? [x, cloneItem(x)] : [x])) }))}>
                        <Icon name="copy" />
                      </button>
                      <button className="icon-btn danger" title="Delete item" onClick={() => setEst((e) => ({ ...e, items: e.items.filter((x) => x.id !== it.id) }))}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {est.items.length === 0 && (
                <tr>
                  <td colSpan={12} className="empty">
                    No items. Press “Add item” to start.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td className="l">Total</td>
                <td>{fmtWeight(totals.grossWt)}</td>
                <td>{fmtWeight(totals.lessWt)}</td>
                <td>{fmtWeight(totals.netWt)}</td>
                <td />
                <td />
                <td>{totals.pcs}</td>
                <td>{fmtMoney(totals.labour)}</td>
                <td className="muted small">fine {fmtWeight(totals.fineWt)}</td>
                <td>{fmtMoney(totals.itemsAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="grid-actions">
          <button className="btn" onClick={() => addItem()}>
            <Icon name="plus" /> Add item
          </button>
          <button className="btn btn-ghost" onClick={props.onClear} disabled={est.items.length === 0 && !est.customerName}>
            <Icon name="trash" /> Clear estimate
          </button>
          <span className="muted hint-inline">Enter moves down; Enter on the last row adds a new item. Silver column prints the silver rate per gram.</span>
        </div>
      </section>

      <div className="bottom">
        <section className="card charges">
          <h3>Other charges</h3>
          {est.otherCharges.map((c) => (
            <div className="charge-row" key={c.id}>
              <input value={c.label} maxLength={80} placeholder="e.g. Hallmarking" onChange={(e) => setEst((x) => ({ ...x, otherCharges: x.otherCharges.map((o) => (o.id === c.id ? { ...o, label: e.target.value } : o)) }))} />
              <NumberInput className="num" decimals={2} value={c.amount} placeholder="0.00" onValue={(n) => setEst((x) => ({ ...x, otherCharges: x.otherCharges.map((o) => (o.id === c.id ? { ...o, amount: n } : o)) }))} />
              <button className="icon-btn danger" title="Remove" onClick={() => setEst((x) => ({ ...x, otherCharges: x.otherCharges.filter((o) => o.id !== c.id) }))}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
          <button className="btn btn-small" onClick={() => setEst((x) => ({ ...x, otherCharges: [...x.otherCharges, { id: newId(), label: '', amount: 0 }] }))}>
            <Icon name="plus" /> Add charge
          </button>
          <div className="checks">
            <label className="check">
              <input type="checkbox" checked={p.gstEnabled} onChange={(e) => setPricing({ gstEnabled: e.target.checked })} /> GST
              <NumberInput className="num tiny" decimals={2} blankZero={false} value={p.gstPercent} onValue={(n) => setPricing({ gstPercent: n })} disabled={!p.gstEnabled} />%
            </label>
            <label className="check">
              <input type="checkbox" checked={p.roundGrandTotal} onChange={(e) => setPricing({ roundGrandTotal: e.target.checked })} /> Round grand total to rupee
            </label>
          </div>
        </section>

        <section className="card totals">
          <div className="t-row muted">
            <span>Silver Bhav</span>
            <span>{silverRate}</span>
          </div>
          <div className="t-row muted">
            <span>Net Wt. / fine weight</span>
            <span>
              {fmtWeight(totals.netWt)} g / {fmtWeight(totals.fineWt)} g
            </span>
          </div>
          <div className="t-row">
            <span>Subtotal</span>
            <span>₹ {fmtMoney(totals.subtotal)}</span>
          </div>
          {p.gstEnabled && (
            <div className="t-row">
              <span>GST ({fmtPercent(p.gstPercent)}%)</span>
              <span>₹ {fmtMoney(totals.gst)}</span>
            </div>
          )}
          {totals.roundOff !== 0 && (
            <div className="t-row muted">
              <span>Round off</span>
              <span>{fmtMoney(totals.roundOff)}</span>
            </div>
          )}
          <div className="t-row grand">
            <span>Grand Total</span>
            <span data-testid="grand-total">₹ {fmtMoney(totals.grandTotal)}</span>
          </div>
          <div className="printer-line muted">
            Printer: {props.printerLabel || 'not selected'}{' '}
            <button className="link" onClick={props.onPrinterSettings}>
              change
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
