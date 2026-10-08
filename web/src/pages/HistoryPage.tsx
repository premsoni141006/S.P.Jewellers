import { useMemo, useState, type ReactNode } from 'react';
import { balanceLeft, fmtDateTime, fmtOrderId, orderIdOf, fmtRupees, paidTotal, searchEstimates, type Estimate } from '@shared';
import { SearchBar } from '../components/SearchBar';
import { summarize, type AppStore } from '../lib/store';

interface Props {
  store: AppStore;
  /** Unsaved estimates (red dot): the one open in the editor first, then ones set aside with "+". */
  drafts: Array<{ est: Estimate; current: boolean }>;
  onContinueDraft: (d: { est: Estimate; current: boolean }) => void;
  onViewDraft: (d: { est: Estimate; current: boolean }) => void;
  onDiscardDraft: (d: { est: Estimate; current: boolean }) => void;
  onView: (e: Estimate) => void;
  onReprint: (e: Estimate) => void;
  onShare: (e: Estimate) => void;
  onDownload: (e: Estimate) => void;
  confirm?: (title: string, body: ReactNode, ok: string, danger?: boolean) => Promise<boolean>;
}

const STATUS = { printed: ['Printed', 'pill-ok'], failed: ['Print failed', 'pill-err'], not_printed: ['Not printed', 'pill-muted'] } as const;

export function HistoryPage({ store, drafts, onContinueDraft, onViewDraft, onDiscardDraft, onView, onReprint, onShare, onDownload }: Props) {
  const [q, setQ] = useState('');
  const searching = q.trim() !== '';
  const list = useMemo(() => (searching ? searchEstimates(store.history, q) : [...store.history].sort((a, b) => b.number - a.number)), [store.history, q, searching]);
  const shownDrafts = searching ? [] : drafts;
  return (
    <div className="page" data-testid="history-page">
      <SearchBar value={q} onChange={setQ} placeholder="Search name, number, item, amount, date, pending, clear…" label="Search saved bills" testId="history-search" />
      {searching && list.length === 0 && (
        <div className="card empty"><p>Nothing matches “{q.trim()}”.</p></div>
      )}
      {!searching && list.length === 0 && drafts.length === 0 && (
        <div className="card empty">
          <p>No estimates yet.</p>
          <p className="muted small">An estimate shows up here as soon as you add a product, and turns green once it is saved.</p>
        </div>
      )}
      {shownDrafts.map((d) => {
        const s = summarize(d.est);
        return (
          <section className="card hist-card is-draft" key={`draft-${d.est.id}`} data-testid="draft-row">
            <span className="status-dot dot-draft" role="img" aria-label="Draft" />
            <div className="hist-top">
              <div>
                <div className="hist-no">Draft <span className="draft-tag">{d.est.number > 0 ? `editing ${fmtOrderId(orderIdOf(d.est))}` : 'not saved'}</span></div>
                <div className="muted small">{fmtDateTime(s.updatedAt)}</div>
              </div>
              <div className="hist-amt"><b>{fmtRupees(s.grandTotal)}</b></div>
            </div>
            <div className="hist-meta">
              <span>{s.customerName.trim() || <span className="muted">No customer</span>}</span>
              <span className="muted">{s.itemCount} item{s.itemCount === 1 ? '' : 's'}</span>
            </div>
            <div className="hist-actions three">
              <button className="btn btn-plain btn-sm" onClick={() => onViewDraft(d)}>View</button>
              <button className="btn btn-primary btn-sm" onClick={() => onContinueDraft(d)} data-testid="draft-continue">Continue</button>
              <button className="btn btn-plain btn-sm danger-text" onClick={() => onDiscardDraft(d)} data-testid="draft-discard">Discard</button>
            </div>
          </section>
        );
      })}
      {list.map((e) => {
        const s = summarize(e);
        const [label, cls] = STATUS[s.printStatus];
        return (
          <section className={`card hist-card${e.billStatus === 'clear' || e.billStatus === 'nil' ? ' is-clear' : ''}`} key={e.id} data-testid="history-row">
            {e.billStatus === 'pending' && <span className="status-dot dot-draft" role="img" aria-label="Pending" data-testid="dot-pending" />}
            {e.billStatus === 'clear' && <span className="status-dot dot-done" role="img" aria-label="Clear" data-testid="dot-done" />}
            {e.billStatus === 'nil' && <span className="status-dot dot-nil" role="img" aria-label="Nil" data-testid="dot-nil" />}
            <div className="hist-top" onClick={e.billStatus === 'clear' || e.billStatus === 'nil' ? () => onView(e) : undefined} data-testid="hist-top">
              <div>
                <div className="hist-no">{fmtOrderId(orderIdOf(s))}</div>
                <div className="muted small">{fmtDateTime(s.updatedAt)}</div>
              </div>
              <div className="hist-amt">
                <b>{fmtRupees(s.grandTotal)}</b>
                <span className={`pill ${cls}`}>{label}</span>
              </div>
            </div>
            <div className="hist-meta">
              <span>{s.customerName.trim() || <span className="muted">No customer</span>}</span>
              <span className="muted">{s.itemCount} item{s.itemCount === 1 ? '' : 's'}</span>
            </div>
            {paidTotal(e) > 0 && <div className="hist-pay muted small" data-testid="hist-pay">Paid {fmtRupees(paidTotal(e))} · Left {fmtRupees(balanceLeft(e))}</div>}
            {e.printStatus === 'failed' && e.lastPrintError && <p className="err small">{e.lastPrintError}</p>}
            <div className="hist-actions">
              <button className="btn btn-plain btn-sm" onClick={() => onView(e)} data-testid="hist-view">View</button>
              <button className="btn btn-plain btn-sm" onClick={() => onShare(e)} data-testid="hist-share">Share</button>
              <button className="btn btn-plain btn-sm" onClick={() => onReprint(e)} data-testid="reprint">Reprint</button>
              <button className="btn btn-plain btn-sm" onClick={() => onDownload(e)} data-testid="hist-download">Download</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
