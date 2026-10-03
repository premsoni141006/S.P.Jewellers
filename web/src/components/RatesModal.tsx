import { useState } from 'react';
import type { RateUnit } from '@shared';
import { NumField } from './NumField';
import { useBackLayer } from '../lib/backStack';
import { useLeave } from './useLeave';

export interface RatesValue {
  silverRate: number;
  silverUnit: RateUnit;
  goldRate: number;
  goldUnit: RateUnit;
}

/** Rates are always entered per 10 grams. Older settings in per-gram / per-kg are converted, so the price does not change. */
const toPer10g = (rate: number, unit: RateUnit): number =>
  Math.round((unit === 'per_gram' ? rate * 10 : unit === 'per_kg' ? rate / 100 : rate) * 100) / 100;

function RateBlock({ title, rate, onRate, testId }: { title: string; rate: number; onRate: (n: number) => void; testId: string }) {
  return (
    <section className="rate-block">
      <h3>{title}</h3>
      <NumField label="₹ per 10 grams" value={rate} onChange={onRate} testId={`${testId}-input`} />
    </section>
  );
}

export function RatesModal({ initial, onSave, onClose }: { initial: RatesValue; onSave: (v: RatesValue) => void; onClose: () => void }) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose)); // system Back closes this pop-up only
  const [v, setV] = useState<RatesValue>(() => ({
    silverRate: toPer10g(initial.silverRate, initial.silverUnit),
    silverUnit: 'per_10g',
    goldRate: toPer10g(initial.goldRate, initial.goldUnit),
    goldUnit: 'per_10g',
  }));

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="rates-backdrop">
      <div className="rates-card" role="dialog" aria-modal="true" aria-label="Today's rates" onClick={(e) => e.stopPropagation()} data-testid="rates-modal">
        <div className="rates-head">
          <h2>Today's rates</h2>
          <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="rates-close">✕</button>
        </div>
        <RateBlock title="Silver" testId="silver" rate={v.silverRate} onRate={(n) => setV({ ...v, silverRate: n })} />
        <RateBlock title="Gold" testId="gold" rate={v.goldRate} onRate={(n) => setV({ ...v, goldRate: n })} />
        <p className="muted small">Rate of pure (fine) metal. New estimates use these rates; saved estimates keep the rates they were made with.</p>
        <button className="btn btn-primary btn-block" onClick={() => leave(() => onSave(v))} data-testid="rates-save">Save rates</button>
      </div>
    </div>
  );
}
