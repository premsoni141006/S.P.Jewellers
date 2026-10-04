import { useState } from 'react';
import { newId, today, validateCashEntry, type CashEntry, type StockType } from '@shared';
import { useBackLayer } from '../lib/backStack';
import { NumField } from './NumField';
import { useLeave } from './useLeave';

export const newCashEntry = (type: StockType): CashEntry => ({ id: newId(), date: today(), type, amount: 0, note: '', createdAt: new Date().toISOString() });

/** Pop-up (blurred page behind) to add or edit one cash movement. */
export function CashEntryModal({ initial, isNew, onSave, onClose }: { initial: CashEntry; isNew: boolean; onSave: (e: CashEntry) => void; onClose: () => void }) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose));
  const [e, setE] = useState<CashEntry>(initial);
  const [error, setError] = useState('');
  const isIn = e.type === 'in';
  const save = () => {
    const problem = validateCashEntry(e);
    if (problem) return setError(problem);
    leave(() => onSave({ ...e, amount: Math.round(e.amount), note: e.note.trim() }));
  };
  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="cash-backdrop">
      <div className="rates-card picker-card" role="dialog" aria-modal="true" aria-label="Cash entry" onClick={(ev) => ev.stopPropagation()} data-testid="cash-modal">
        <div className="rates-head">
          <h2>{isNew ? (isIn ? 'Cash IN' : 'Cash OUT') : 'Edit entry'}</h2>
          <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="cash-close">✕</button>
        </div>
        <div className="stack">
          <NumField label="Amount (₹)" value={e.amount} onChange={(n) => setE({ ...e, amount: n })} step="int" testId="cash-amount" />
          <label className="field">
            <span className="field-label">Date</span>
            <span className="field-box"><input type="date" value={e.date} max="2100-12-31" onChange={(ev) => setE({ ...e, date: ev.target.value })} data-testid="cash-date" /></span>
          </label>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <span className="field-box"><input value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="Who / what for (sale, rent, advance…)" autoComplete="off" data-testid="cash-note" /></span>
          </label>
          {error && <p className="err small" role="alert" data-testid="cash-error">{error}</p>}
          <div className="prod-actions">
            <button className="btn btn-plain" onClick={() => leave(onClose)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} data-testid="cash-save">{isNew ? 'Save entry' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
