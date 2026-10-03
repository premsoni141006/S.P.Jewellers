import { useState } from 'react';
import { newId, type LabourMode, type Product } from '@shared';
import { Icon } from './Icon';
import { NumField } from './NumField';
import { useBackLayer } from '../lib/backStack';
import { useLeave } from './useLeave';


type Draft = Product & { isNew: boolean };

const blank = (labour: number, mode: LabourMode): Draft => ({ id: newId(), isNew: true, name: '', metal: 'silver', tunch: 0, wastage: 0, labourRate: labour, labourMode: mode });

/**
 * Pop-up (blurred page behind) that lists every saved product. The owner can add, edit or delete
 * products right here — no trip to Settings.
 */
export function ProductsModal({ products, defaultLabour, defaultLabourMode, startAdd, onChange, onClose }: {
  products: Product[];
  defaultLabour: number;
  defaultLabourMode: LabourMode;
  startAdd?: boolean;
  onChange: (list: Product[]) => void;
  onClose: () => void;
}) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose)); // system Back closes this pop-up only
  const [form, setForm] = useState<Draft | null>(() => (startAdd ? blank(defaultLabour, defaultLabourMode) : null));
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const list = products.filter((p) => p.name.trim());

  const save = () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return setError('Enter the item name.');
    if (list.some((p) => p.id !== form.id && p.name.trim().toLowerCase() === name.toLowerCase())) return setError('An item with this name already exists.');
    if (form.tunch < 0 || form.tunch > 100) return setError('Tunch must be between 0 and 100.');
    const { isNew, ...p } = form;
    const clean: Product = { ...p, name };
    onChange(isNew ? [...products.filter((x) => x.name.trim()), clean] : products.map((x) => (x.id === clean.id ? clean : x)));
    setForm(null);
    setError('');
  };

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="products-backdrop">
      <div className="rates-card picker-card" role="dialog" aria-modal="true" aria-label="Products" onClick={(e) => e.stopPropagation()} data-testid="products-modal">
        <div className="rates-head">
          <h2>{form ? (form.isNew ? 'New item' : 'Edit item') : 'Products'}</h2>
          <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="products-close">✕</button>
        </div>

        {form ? (
          <div className="stack">
            <label className="field">
              <span className="field-label">Item name</span>
              <span className="field-box"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" autoCapitalize="words" autoFocus data-testid="prod-name" /></span>
            </label>
            <NumField label="Tunch" value={form.tunch} onChange={(n) => setForm({ ...form, tunch: n })} step="percent" suffix="%" testId="prod-tunch" />
            {error && <p className="err small" role="alert" data-testid="prod-error">{error}</p>}
            <div className="prod-actions">
              <button className="btn btn-plain" onClick={() => { setForm(null); setError(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={save} data-testid="prod-save">Save item</button>
            </div>
          </div>
        ) : (
          <ul className="pick-list">
            {list.map((p) => (
              <li key={p.id} className="prod-item" data-testid="prod-item">
                {confirmDel === p.id ? (
                  <div className="prod-confirm">
                    <span>Delete <b>{p.name}</b>?</span>
                    <span className="prod-confirm-btns">
                      <button className="btn btn-plain btn-sm" onClick={() => setConfirmDel(null)}>No</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { onChange(products.filter((x) => x.id !== p.id)); setConfirmDel(null); }} data-testid="prod-delete-yes">Yes, delete</button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button className="pick-row prod-main" onClick={() => setForm({ ...p, isNew: false })} data-testid="prod-edit">
                      <span className="pick-name">{p.name}</span>
                      <span className="pick-meta">Tunch {p.tunch}%</span>
                    </button>
                    <button className="icon-btn danger" onClick={() => setConfirmDel(p.id)} aria-label={`Delete ${p.name}`} data-testid="prod-delete"><Icon name="trash" size={20} /></button>
                  </>
                )}
              </li>
            ))}
            {list.length === 0 && <li className="muted small pick-empty">No saved items yet.</li>}
            <li>
              <button className="pick-row pick-add" onClick={() => setForm(blank(defaultLabour, defaultLabourMode))} data-testid="prod-add">
                <span className="pick-plus" aria-hidden="true">+</span>
                <span className="pick-name">Add new item</span>
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
