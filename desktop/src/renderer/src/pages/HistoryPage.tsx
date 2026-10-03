import { useEffect, useMemo, useState } from 'react';
import { fmtDateTime, fmtEstimateNo, fmtMoney, type EstimateSummary } from '@shared';
import { Badge, Icon } from '../components/ui';
import { api, errorText } from '../lib/api';

export function HistoryPage(props: {
  refreshKey: number;
  currentId: string;
  onView: (id: string) => void;
  onOpen: (id: string) => void;
  onReprint: (id: string) => void;
  onDelete: (s: EstimateSummary) => void;
}) {
  const [list, setList] = useState<EstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.estimates
      .list()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, [props.refreshKey]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!list || !term) return list ?? [];
    return list.filter((s) => fmtEstimateNo(s.number).toLowerCase().includes(term) || s.customerName.toLowerCase().includes(term) || String(s.number) === term);
  }, [list, q]);

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="page-title">Estimate history</h1>
        <input className="search" placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="banner banner-err">Could not load history: {error}</div>}
      <section className="card">
        <table className="list">
          <thead>
            <tr>
              <th className="l">Estimate No.</th>
              <th className="l">Date</th>
              <th className="l">Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th className="l">Print status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className={s.id === props.currentId ? 'current' : ''}>
                <td className="l strong">{fmtEstimateNo(s.number)}</td>
                <td className="l">{fmtDateTime(s.createdAt)}</td>
                <td className="l">{s.customerName || <span className="muted">—</span>}</td>
                <td>{s.itemCount}</td>
                <td className="strong">₹ {fmtMoney(s.grandTotal)}</td>
                <td className="l">
                  {s.printStatus === 'printed' ? (
                    <Badge tone="ok">Printed {s.printedAt ? fmtDateTime(s.printedAt) : ''}</Badge>
                  ) : s.printStatus === 'failed' ? (
                    <Badge tone="err">Failed</Badge>
                  ) : (
                    <Badge>Not printed</Badge>
                  )}
                </td>
                <td className="row-actions wide">
                  <button className="btn btn-small" onClick={() => props.onView(s.id)}>
                    <Icon name="eye" /> View
                  </button>
                  <button className="btn btn-small" onClick={() => props.onOpen(s.id)}>
                    Open
                  </button>
                  <button className="btn btn-small" onClick={() => props.onReprint(s.id)}>
                    <Icon name="print" /> Reprint
                  </button>
                  <button className="icon-btn danger" title="Delete" onClick={() => props.onDelete(s)}>
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
            {list && shown.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {list.length === 0 ? 'No saved estimates yet. Saved and printed estimates appear here.' : 'No estimate matches the search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
