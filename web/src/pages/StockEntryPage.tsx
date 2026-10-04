import { useState } from 'react';
import { availableStock, fmtDate, fmtWeight, newId, stockTotals, today, validateStockEntry, type Product, type StockEntry, type StockType } from '@shared';
import type { LabourMode } from '@shared';
import { deletePhoto, putPhoto, usePhotoUrl } from '../lib/photos';
import { Icon } from '../components/Icon';
import { NumField } from '../components/NumField';
import { PhotoField } from '../components/PhotoField';
import { ProductPicker } from '../components/ProductPicker';
import { ProductsModal } from '../components/ProductsModal';

/** A fresh, empty movement of the given type, dated today. */
export const newStockEntry = (type: StockType): StockEntry => ({
  id: newId(), date: today(), type, metal: 'gold', item: '', tunch: 0, weight: 0, pcs: 0, note: '', createdAt: new Date().toISOString(),
});

/** Stock OUT: pieces within this many grams of the estimated weight are listed (gold ±1 g, silver ±10 g). */
const NEAR_GRAMS = { gold: 1, silver: 10 } as const;

function PieceRow({ piece, on, onPick }: { piece: StockEntry; on: boolean; onPick: () => void }) {
  const url = usePhotoUrl(piece.photoId);
  return (
    <button type="button" className={`piece-row${on ? ' on' : ''}`} onClick={onPick} data-testid="find-piece">
      <span className="piece-photo">{url ? <img src={url} alt="" /> : <span className="muted small">No photo</span>}</span>
      <span className="piece-info">
        <b>{piece.item}</b>
        <span>{fmtWeight(piece.weight)} g · Tunch {piece.tunch}%</span>
        <span className="muted small">{fmtDate(`${piece.date}T12:00:00`)}{piece.pcs > 0 ? ` · ${piece.pcs} pcs` : ''}</span>
      </span>
    </button>
  );
}

/**
 * One stock movement on its own page. IN: photo, metal, category, weight, tunch, pieces, date, note.
 * OUT: metal, then category, then the estimated weight; pieces in stock near that weight are listed
 * (photo on the left, details on the right) to pick the one that is leaving.
 */
export function StockEntryPage({ initial, isNew, entries, products, defaultLabour, defaultLabourMode, onProductsChange, onSave, onRemoveStock, onBack }: {
  initial: StockEntry;
  isNew: boolean;
  entries: StockEntry[];
  products: Product[];
  defaultLabour: number;
  defaultLabourMode: LabourMode;
  onProductsChange: (list: Product[]) => void;
  onSave: (e: StockEntry) => void;
  onRemoveStock: (piece: StockEntry) => void;
  onBack: () => void;
}) {
  if (!isNew) return <EntryView entry={initial} canRemove={initial.type === 'in' && availableStock(entries).some((x) => x.id === initial.id)} onRemoveStock={onRemoveStock} />;
  return <NewEntryForm initial={initial} entries={entries} products={products} defaultLabour={defaultLabour} defaultLabourMode={defaultLabourMode} onProductsChange={onProductsChange} onSave={onSave} onBack={onBack} />;
}

/** A saved stock entry is a record: it can be looked at but not changed. Only "Remove this stock" (an OUT) takes it out. */
function EntryView({ entry: e, canRemove, onRemoveStock }: { entry: StockEntry; canRemove: boolean; onRemoveStock: (piece: StockEntry) => void }) {
  const url = usePhotoUrl(e.photoId);
  return (
    <div className="page" data-testid="stock-entry-page">
      <section className="card stack">
        {e.photoId && <div className="entry-photo">{url && <img src={url} alt="" />}</div>}
        {([
          ['Type', e.type === 'in' ? 'Stock IN' : 'Stock OUT'],
          ['Metal', e.metal === 'gold' ? 'Gold' : 'Silver'],
          ['Category', e.item || '—'],
          ['Weight', `${fmtWeight(e.weight)} g`],
          ['Tunch', e.tunch > 0 ? `${e.tunch}%` : '—'],
          ['No. of pieces', e.pcs > 0 ? String(e.pcs) : '—'],
          ['Date', fmtDate(`${e.date}T12:00:00`)],
          ['Note', e.note || '—'],
        ] as const).map(([k, v]) => (
          <div className="kv" key={k}><span className="muted">{k}</span><b data-testid={`view-${k.toLowerCase().replace(/[^a-z]/g, '')}`}>{v}</b></div>
        ))}
        {canRemove && <button className="btn btn-outline danger-text" onClick={() => onRemoveStock(e)} data-testid="remove-stock">Remove this stock</button>}
      </section>
    </div>
  );
}

function NewEntryForm({ initial, entries, products, defaultLabour, defaultLabourMode, onProductsChange, onSave, onBack }: {
  initial: StockEntry;
  entries: StockEntry[];
  products: Product[];
  defaultLabour: number;
  defaultLabourMode: LabourMode;
  onProductsChange: (list: Product[]) => void;
  onSave: (e: StockEntry) => void;
  onBack: () => void;
}) {
  const isNew = true;
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  const [e, setE] = useState<StockEntry>(initial);
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined); // undefined = unchanged
  const [pickedId, setPickedId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isIn = e.type === 'in';

  // OUT: pieces still in stock for the chosen metal / category near the estimated weight, closest first.
  const near = NEAR_GRAMS[e.metal];
  const pieces = e.type === 'out' && e.weight > 0
    ? availableStock(entries.filter((x) => x.id !== e.id))
        .filter((x) => x.metal === e.metal && (!e.item || x.item.trim().toLowerCase() === e.item.trim().toLowerCase()) && Math.abs(x.weight - e.weight) <= near + 0.0005)
        .sort((a, b) => Math.abs(a.weight - e.weight) - Math.abs(b.weight - e.weight))
    : [];

  // For an OUT, warn (do not block) when more is going out than the register says is in stock.
  const left = stockTotals(entries.filter((x) => x.id !== e.id), e.metal).netWt;
  const warn = e.type === 'out' && e.weight > left ? `Only ${fmtWeight(Math.max(left, 0))} g of ${e.metal} is recorded in stock. Saving this makes the stock negative.` : '';

  const save = async () => {
    const entry = { ...e, date: e.date || today() };
    const problem = validateStockEntry(entry);
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
      onSave({ ...entry, photoId, item: entry.item.trim(), note: entry.note.trim() });
    } catch {
      setSaving(false);
      setError('Could not save the photo on this phone. Try again, or remove the photo.');
    }
  };

  return (
    <div className="page" data-testid="stock-entry-page">
      <section className="card stack">
        {isIn && <PhotoField photoId={e.photoId} pending={photo} onChange={setPhoto} />}
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
        <NumField label={isIn ? 'Weight' : 'Weight (estimate)'} value={e.weight} onChange={(n) => setE({ ...e, weight: n })} step="weight" suffix="g" testId="stock-weight" />
      </section>

      {e.type === 'out' && (
        <section className="card stack" data-testid="find-box">
          <div className="section-title">In stock near {e.weight > 0 ? `${fmtWeight(e.weight)} g` : 'this weight'} <span className="muted small">(±{near} g)</span></div>
          {e.weight <= 0 ? <p className="muted small">Enter the weight to see the pieces in stock near it.</p>
            : pieces.length === 0 ? <p className="muted small">No piece in stock near this weight.</p>
            : (
              <div className="piece-list">
                {pieces.map((p) => (
                  <PieceRow key={p.id} piece={p} on={pickedId === p.id} onPick={() => { setPickedId(p.id); setE({ ...e, item: p.item, metal: p.metal, weight: p.weight, tunch: p.tunch, pcs: p.pcs }); }} />
                ))}
              </div>
            )}
        </section>
      )}

      <section className="card stack">
        <div className="grid-2">
          <NumField label="Tunch (optional)" value={e.tunch} onChange={(n) => setE({ ...e, tunch: n })} step="percent" suffix="%" testId="stock-tunch" />
          <NumField label="No. of pieces (optional)" value={e.pcs} onChange={(n) => setE({ ...e, pcs: n })} step="int" testId="stock-pcs" />
        </div>
        <label className="field">
          <span className="field-label">Date (optional, today if empty)</span>
          <span className="field-box"><input type="date" value={e.date} max="2100-12-31" onChange={(ev) => setE({ ...e, date: ev.target.value })} data-testid="stock-date" /></span>
        </label>
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <span className="field-box"><input value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="Party / bill no. / reason" autoComplete="off" data-testid="stock-note" /></span>
        </label>
        {warn && <p className="warn small" role="status" data-testid="stock-warn">{warn}</p>}
        {error && <p className="err small" role="alert" data-testid="stock-error">{error}</p>}
        <div className="prod-actions">
          <button className="btn btn-plain" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving} data-testid="stock-save">{isNew ? 'Save entry' : 'Save changes'}</button>
        </div>
      </section>

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
    </div>
  );
}
