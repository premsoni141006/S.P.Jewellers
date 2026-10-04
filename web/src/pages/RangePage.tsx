import { useMemo, useState } from 'react';
import { cashTotals, fmtDate, fmtRupees, fmtWeight, sortCash, sortStock, stockTotals } from '@shared';
import type { AppStore } from '../lib/store';

const yearStart = (): string => `${new Date().getFullYear()}-01-01`;
const yearEnd = (): string => `${new Date().getFullYear()}-12-31`;

/**
 * Report for a date range (the ongoing year until changed): what came in and went out of the
 * Silver / Gold stock, or of the cash register, between two dates.
 */
export function RangePage({ kind, store }: { kind: 'metal' | 'cash'; store: AppStore }) {
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(yearEnd);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

  const stock = useMemo(() => store.stock.filter((e) => inRange(e.date)), [store.stock, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const cash = useMemo(() => store.cash.filter((e) => inRange(e.date)), [store.cash, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page" data-testid={kind === 'cash' ? 'range-cash' : 'range-metal'}>
      <section className="card range-dates">
        <label className="field">
          <span className="field-label">From</span>
          <span className="field-box"><input type="date" value={from} max="2100-12-31" onChange={(e) => setFrom(e.target.value)} data-testid="range-from" /></span>
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <span className="field-box"><input type="date" value={to} max="2100-12-31" onChange={(e) => setTo(e.target.value)} data-testid="range-to" /></span>
        </label>
      </section>

      {kind === 'metal' ? (
        <>
          {(['gold', 'silver'] as const).map((m) => {
            const t = stockTotals(stock, m);
            return (
              <section className="card range-card" key={m} data-testid={`range-${m}`}>
                <div className="section-title">{m === 'gold' ? 'Gold' : 'Silver'}</div>
                <div className="range-line"><span>In</span><b className="in" data-testid={`range-${m}-in`}>{fmtWeight(t.inWt)} g</b></div>
                <div className="range-line"><span>Out</span><b className="out" data-testid={`range-${m}-out`}>{fmtWeight(t.outWt)} g</b></div>
                <div className="range-line"><span>Difference</span><b className={t.netWt < 0 ? 'out' : ''} data-testid={`range-${m}-net`}>{fmtWeight(t.netWt)} g</b></div>
              </section>
            );
          })}
          {sortStock(stock).map((e) => (
            <section className="card range-row" key={e.id} data-testid="range-entry">
              <div><b>{e.item || 'Unnamed'}</b><div className="muted small">{fmtDate(`${e.date}T12:00:00`)} · {e.metal === 'gold' ? 'Gold' : 'Silver'}{e.note ? ` · ${e.note}` : ''}</div></div>
              <b className={`stock-amt ${e.type}`}>{e.type === 'in' ? '+' : '−'}{fmtWeight(e.weight)} g</b>
            </section>
          ))}
          {stock.length === 0 && <div className="card empty"><p className="muted">No stock entries between these dates.</p></div>}
        </>
      ) : (
        <>
          {(() => {
            const t = cashTotals(cash);
            return (
              <section className="card range-card" data-testid="range-cash-card">
                <div className="range-line"><span>In</span><b className="in" data-testid="range-cash-in">{fmtRupees(t.inAmt)}</b></div>
                <div className="range-line"><span>Out</span><b className="out" data-testid="range-cash-out">{fmtRupees(t.outAmt)}</b></div>
                <div className="range-line"><span>Difference</span><b className={t.balance < 0 ? 'out' : ''} data-testid="range-cash-net">{fmtRupees(t.balance)}</b></div>
              </section>
            );
          })()}
          {sortCash(cash).map((e) => (
            <section className="card range-row" key={e.id} data-testid="range-entry">
              <div><b>{e.note || 'Cash'}</b><div className="muted small">{fmtDate(`${e.date}T12:00:00`)}</div></div>
              <b className={`stock-amt ${e.type}`}>{e.type === 'in' ? '+' : '−'}{fmtRupees(e.amount)}</b>
            </section>
          ))}
          {cash.length === 0 && <div className="card empty"><p className="muted">No cash entries between these dates.</p></div>}
        </>
      )}
    </div>
  );
}
