import { useState } from 'react';
import { balanceLeft, boughtPurity, calcEstimate, fmtDayDateTime, fmtRupees, goldPaymentValue, paidTotal, ratePerGram, validatePayment, type Estimate, type GoldPayment, type SilverPayment } from '@shared';
import { useBackLayer } from '../lib/backStack';
import { NumField } from './NumField';

export type PayExtra = { mode: 'cash' | 'upi' | 'gold' | 'silver'; gold?: GoldPayment; silver?: SilverPayment };

/**
 * Asks what the customer has just given: cash, UPI, or gold / silver submitted later. Submitted gold or silver is just
 * its weight and a rate for that submission only (same karat / tunch as the one bought); its value is deducted from the bill. Every
 * payment is stamped with today's day and date.
 */
export function PaymentWindow({ est, onAdd, onClose }: { est: Estimate; onAdd: (amount: number, extra: PayExtra) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'cash' | 'upi' | 'gold' | 'silver'>('cash');
  const [amount, setAmount] = useState(0);
  const [wtG, setWtG] = useState(0);
  const [goldRate, setGoldRate] = useState(() => Math.round(ratePerGram(est.pricing.goldRate, est.pricing.goldRateUnit) * 10));
  const [silverRate, setSilverRate] = useState(() => Math.round(ratePerGram(est.pricing.silverRate, est.pricing.silverRateUnit) * 10));
  const [error, setError] = useState('');
  const now = new Date().toISOString();
  useBackLayer(true, onClose);
  const metalMode = mode === 'gold' || mode === 'silver';
  const purity = metalMode ? boughtPurity(est.items, mode) : 100;
  const rate = mode === 'gold' ? goldRate : silverRate;
  const metalValue = goldPaymentValue({ weight: wtG, purity, rate, cutPct: 0 });
  const value = metalMode ? metalValue : amount;
  const left = balanceLeft(est);
  const add = () => {
    if (metalMode && !(wtG > 0)) return setError(`Enter the weight of the submitted ${mode}.`);
    const p = validatePayment(est, value);
    if (p) return setError(metalMode && value > left ? `The ${mode} is worth ${fmtRupees(value)}, more than the ${fmtRupees(left)} left.` : p);
    if (mode === 'gold') onAdd(value, { mode, gold: { weight: wtG, karat: est.items.find((i) => i.metal === 'gold')?.karat ?? 0, purity, rate, cutPct: 0 } });
    else if (mode === 'silver') onAdd(value, { mode, silver: { weight: wtG, tunch: purity, rate, cutPct: 0 } });
    else onAdd(value, { mode });
  };
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation" data-testid="pay-backdrop">
      <div className="rates-card" role="dialog" aria-modal="true" aria-label="Add payment" onClick={(e) => e.stopPropagation()} data-testid="pay-window">
        <div className="rates-head"><h2>Add payment</h2><button className="bar-btn close-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="pay-sum">
          <span>Bill total <b>{fmtRupees(calcEstimate(est).grandTotal)}</b></span>
          <span>Paid so far <b>{fmtRupees(paidTotal(est))}</b></span>
          <span>Left <b data-testid="pay-window-left">{fmtRupees(left)}</b></span>
        </div>
        <div className="seg wide" role="group" aria-label="Paid with">
          {([['cash', 'Cash'], ['upi', 'UPI'], ['gold', 'Gold'], ['silver', 'Silver']] as const).map(([m, label]) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setError(''); }} data-testid={`pay-mode-${m}`}>{label}</button>
          ))}
        </div>
        {!metalMode ? (
          <NumField label={mode === 'upi' ? 'Amount received on UPI (₹)' : 'Cash received now (₹)'} value={amount} onChange={setAmount} step="int" testId="pay-amount" />
        ) : (
          <>
            <div className="grid-2">
              <NumField label={`Submitted ${mode}`} value={wtG} onChange={setWtG} step="weight" suffix="g" testId="pay-gold-wt" />
              {mode === 'gold'
                ? <NumField label="Gold rate for this (24K, ₹ per 10 g)" value={goldRate} onChange={setGoldRate} step="money" testId="pay-gold-rate" />
                : <NumField label="Silver rate for this (₹ per 10 g)" value={silverRate} onChange={setSilverRate} step="money" testId="pay-silver-rate" />}
            </div>
            <p className="muted small">This rate is for this submission only; it starts at the bill's rate and does not change anything else.</p>
            <p className="pay-gold-value">Value cut from the bill <b data-testid="pay-gold-value">{fmtRupees(metalValue)}</b></p>
          </>
        )}
        <p className="muted small" data-testid="pay-when">{fmtDayDateTime(now)}</p>
        {error && <p className="err small" role="alert" data-testid="pay-error">{error}</p>}
        <button className="btn btn-primary btn-block" onClick={add} data-testid="pay-save">{metalMode ? 'Cut from bill' : 'Add'}</button>
      </div>
    </div>
  );
}
