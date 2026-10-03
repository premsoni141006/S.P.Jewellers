import { useState } from 'react';
import { fmtWeight, newId, stockTotals, today, validateStockEntry, type Product, type StockEntry, type StockType } from '@shared';
import { useBackLayer } from '../lib/backStack';
import { deletePhoto, putPhoto } from '../lib/photos';
import { Icon } from './Icon';
import { NumField } from './NumField';
import { PhotoField } from './PhotoField';
import { ProductPicker } from './ProductPicker';
import { ProductsModal } from './ProductsModal';
import { useLeave } from './useLeave';
import type { LabourMode } from '@shared';

/** A fresh, empty movement of the given type, dated today. */
export const newStockEntry = (type: StockType): StockEntry => ({
  id: newId(), date: today(), type, metal: 'gold', item: '', tunch: 0, weight: 0, pcs: 0, note: '', createdAt: new Date().toISOString(),
});

/**
 * Pop-up (blurred page behind) to add or edit one stock movement: photo of the product, its
 * category (picked from the saved products), weight, tunch, metal and date.
 */
export function StockEntryModal({ initial, isNew, entries, products, defaultLabour, defaultLabourMode, onProductsChange, onSave, onClose }: {
  initial: StockEntry;
  isNew: boolean;
  entries: StockEntry[];
  products: Product[];
  defaultLabour: number;
  defaultLabourMode: LabourMode;
  onProductsChange: (list: Product[]) => void;
  onSave: (e: StockEntry) => void;
  onClose: () => void;
}) {
  const { leaving, leave } = useLeave();
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  // The entry pop-up is a back layer only while nothing sits on top of it.
  useBackLayer(!picking && !managing, () => leave(onClose));
  const [e, setE] = useState<StockEntry>(initial);
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined); // undefined = unchanged
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isIn = e.type === 'in';

  // For an OUT, warn (do not block) when more is going out than the register says is in stock.
  const left = stockTotals(entries.filter((x) => x.id !== e.id), e.metal).netWt;
  const warn = e.type === 'out' && e.weight > left ? `Only ${fmtWeight(Math.max(left, 0))} g of ${e.metal} is recorded in stock. Saving this makes the stock negative.` : '';

  const save = async () => {
    const problem = validateStockEntry(e);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      let photoId = e.photoId;
      if (photo instanceof Blob) {
        photoId = photoId ?? newId();
        await putPhoto(photoId, photo);
      } else if (photo === null && photoId) {
        await deletePhoto(photoId);
        photoId = undefined;
      }
      leave(() => onSave({ ...e, photoId, item: e.item.trim(), note: e.note.trim() }));
    } catch {
      setSaving(false);
      setError('Could not save the photo on this phone. Try again, or remove the photo.');
    }
  };

  return (
    <>
      <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="stock-backdrop">
        <div className="rates-card picker-card" role="dialog" aria-modal="true" aria-label="Stock entry" onClick={(ev) => ev.stopPropagation()} data-testid="stock-modal">
          <div className="rates-head">
            <h2>{isNew ? (isIn ? 'Stock IN' : 'Stock OUT') : 'Edit entry'}</h2>
            <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="stock-close">✕</button>
          </div>
          <div className="stack">
            <div className="seg wide" role="group" aria-label="Direction">
              <button type="button" className={isIn ? 'on' : ''} onClick={() => setE({ ...e, type: 'in' })} data-testid="stock-type-in">IN (came into shop)</button>
              <button type="button" className={!isIn ? 'on' : ''} onClick={() => setE({ ...e, type: 'out' })} data-testid="stock-type-out">OUT (left the shop)</button>
            </div>
            <PhotoField photoId={e.photoId} pending={photo} onChange={setPhoto} />
            <div className="seg wide" role="group" aria-label="Metal">
              <button type="button" className={e.metal === 'gold' ? 'on' : ''} onClick={() => setE({ ...e, metal: 'gold' })} data-testid="stock-gold">Gold</button>
              <button type="button" className={e.metal === 'silver' ? 'on' : ''} onClick={() => setE({ ...e, metal: 'silver' })} data-testid="stock-silver">Silver</button>
            </div>
            <label className="field">
              <span className="field-label">Category (saved item)</span>
              <span className="field-box">
                <button type="button" className={`picker-field${e.item ? '' : ' empty'}`} onClick={() => setPicking(true)} data-testid="stock-item" data-value={e.item} aria-haspopup="dialog">
                  <span>{e.item || 'Choose an item'}</span>
                  <Icon name="chevron" size={18} />
                </button>
              </span>
            </label>
            <div className="grid-2">
              <NumField label="Weight" value={e.weight} onChange={(n) => setE({ ...e, weight: n })} step="weight" suffix="g" testId="stock-weight" />
              <NumField label="Tunch" value={e.tunch} onChange={(n) => setE({ ...e, tunch: n })} step="percent" suffix="%" testId="stock-tunch" />
            </div>
            <div className="grid-2">
              <NumField label="No. of pieces" value={e.pcs} onChange={(n) => setE({ ...e, pcs: n })} step="int" testId="stock-pcs" />
              <label className="field">
                <span className="field-label">Date</span>
                <span className="field-box"><input type="date" value={e.date} max="2100-12-31" onChange={(ev) => setE({ ...e, date: ev.target.value })} data-testid="stock-date" /></span>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Note (optional)</span>
              <span className="field-box"><input value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="Party / bill no. / reason" autoComplete="off" data-testid="stock-note" /></span>
            </label>
            {warn && <p className="warn small" role="status" data-testid="stock-warn">{warn}</p>}
            {error && <p className="err small" role="alert" data-testid="stock-error">{error}</p>}
            <div className="prod-actions">
              <button className="btn btn-plain" onClick={() => leave(onClose)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={saving} data-testid="stock-save">{isNew ? 'Save entry' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      </div>

      {picking && (
        <ProductPicker
          products={products}
          selected={e.item}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            // The saved item's tunch is filled in, unless one was already typed.
            setE({ ...e, item: p.name, tunch: e.tunch > 0 ? e.tunch : p.tunch });
            setPicking(false);
          }}
          onAdd={() => { setPicking(false); setManaging(true); }}
        />
      )}
      {managing && (
        <ProductsModal
          products={products}
          startAdd
          defaultLabour={defaultLabour}
          defaultLabourMode={defaultLabourMode}
          onChange={onProductsChange}
          onClose={() => { setManaging(false); setPicking(true); }}
        />
      )}
    </>
  );
}
