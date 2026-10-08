import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { balanceLeft, fmtOrderId, orderIdOf, fmtRupees, paidTotal, renderEstimateHtml, type Estimate, type PrintHeader } from '@shared';
import { PaymentWindow, type PayExtra } from '../components/PaymentWindow';
import { Icon } from '../components/Icon';
import { billFileName, billPdf, saveBlob, shareBill } from '../lib/billExport';

// The A4 sheet in the shared template is 210 mm wide on a grey screen background.
const DOC_WIDTH = 820;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Shows the exact bill that is printed. It opens fitted to the screen and can be zoomed (buttons,
 * two-finger pinch, double-tap) and saved as an image or a PDF.
 */
export function PreviewScreen({ est, header, onClose, onPrint, onNotice, onStatus, onEnsureSaved, onAddPayment }: { est: Estimate; onAddPayment: (amount: number, extra: PayExtra) => void; onEnsureSaved: () => Estimate | null; header: PrintHeader; onClose: () => void; onPrint: () => void; onNotice: (msg: string) => void; onStatus: (s: 'pending' | 'clear' | 'nil') => void | Promise<void> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [fit, setFit] = useState(0.4); // scale that fits the bill to the screen width
  const [zoom, setZoom] = useState(1); // times that: 1 = fitted
  const [height, setHeight] = useState(1200);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const html = renderEstimateHtml(est, header);
  const scale = fit * zoom;

  // Keep the point under the fingers (or the middle of the screen) where it is while zooming.
  const anchor = useRef<{ cx: number; cy: number; fx: number; fy: number } | null>(null);
  const zoomTo = (next: number, focus?: { x: number; y: number }) => {
    const el = wrap.current;
    const z = clamp(next);
    if (el) {
      const rect = el.getBoundingClientRect();
      const fx = focus ? focus.x - rect.left : rect.width / 2;
      const fy = focus ? focus.y - rect.top : rect.height / 2;
      anchor.current = { cx: (el.scrollLeft + fx) / scale, cy: (el.scrollTop + fy) / scale, fx, fy };
    }
    setZoom(z);
  };
  useLayoutEffect(() => {
    const el = wrap.current;
    const a = anchor.current;
    if (el && a) {
      el.scrollLeft = a.cx * scale - a.fx;
      el.scrollTop = a.cy * scale - a.fy;
      anchor.current = null;
    }
  }, [scale]);

  useEffect(() => {
    const measure = () => setFit(Math.min(1, (wrap.current?.clientWidth ?? 360) / DOC_WIDTH));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight);
  };

  // ---- two-finger pinch and double-tap
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const mid = () => {
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { d0: Math.max(1, dist()), z0: zoom };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) zoomTo(pinch.current.z0 * (dist() / pinch.current.d0), mid());
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const wasOne = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.type === 'pointerup' && wasOne) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 320 && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 30) {
        lastTap.current = null;
        zoomTo(zoom > 1.05 ? 1 : 2.5, { x: e.clientX, y: e.clientY });
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  // Save: the bill goes into History (if it is not there yet) and the PDF is saved to the phone.
  // Share: the same, then the share screen opens with the PDF.
  const run = async (kind: 'save' | 'share') => {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      const target = onEnsureSaved();
      if (!target) return;
      if (kind === 'share') await shareBill(target, header);
      else onNotice(`PDF saved to ${await saveBlob(billFileName(target, 'pdf'), await billPdf(target, header))}.`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the bill. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="preview" role="dialog" aria-modal="true" aria-label="Print preview" data-testid="preview-screen">
      <header className="preview-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Close preview"><Icon name="close" /></button>
        <div className="preview-title">
          <span>Final bill</span>
          <span className="muted small">{fmtOrderId(orderIdOf(est))} · A4</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onPrint} data-testid="preview-print">Print</button>
      </header>

      <div className="preview-tools">
        <div className="zoom-group" role="group" aria-label="Zoom">
          <button className="icon-btn" onClick={() => zoomTo(zoom / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" data-testid="zoom-out"><Icon name="zoomout" size={20} /></button>
          <span className="zoom-level" data-testid="zoom-level" aria-live="polite">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomTo(zoom * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" data-testid="zoom-in"><Icon name="zoomin" size={20} /></button>
          <button className="btn btn-plain btn-sm" onClick={() => zoomTo(1)} disabled={zoom === 1} data-testid="zoom-fit">Fit</button>
        </div>
        <div className="save-group">
          <button className="btn btn-outline btn-sm" onClick={() => void run('save')} disabled={!!busy} data-testid="download-pdf"><Icon name="download" size={16} /> {busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-outline btn-sm" onClick={() => void run('share')} disabled={!!busy} data-testid="share-bill">{busy === 'share' ? 'Preparing…' : 'Share'}</button>
        </div>
      </div>
      {est.billStatus !== 'clear' && est.billStatus !== 'nil' && <div className="status-group" role="group" aria-label="Bill status">
        <button className={`btn btn-outline btn-sm status-pending${est.billStatus === 'pending' ? ' on' : ''}`} onClick={() => onStatus('pending')} data-testid="mark-pending">Pending</button>
        <button className={`btn btn-outline btn-sm status-clear`} onClick={() => onStatus('clear')} data-testid="mark-clear">Clear</button>
        <button className="btn btn-outline btn-sm status-nil" onClick={() => onStatus('nil')} data-testid="mark-nil">Nil</button>
      </div>}
      {est.number > 0 && (
        <div className="pay-bar" data-testid="pay-bar">
          <span>Paid <b data-testid="pay-paid">{fmtRupees(paidTotal(est))}</b></span>
          <span>Left <b data-testid="pay-left">{fmtRupees(balanceLeft(est))}</b></span>
          {est.billStatus !== 'clear' && est.billStatus !== 'nil' && balanceLeft(est) > 0 && <button className="btn btn-outline btn-sm" onClick={() => setPaying(true)} data-testid="pay-add">+ Payment</button>}
        </div>
      )}
      {paying && <PaymentWindow est={est} onClose={() => setPaying(false)} onAdd={(a, extra) => { onAddPayment(a, extra); setPaying(false); }} />}
      {error && <p className="err small preview-error" role="alert" data-testid="download-error">{error}</p>}

      <div
        className="preview-body"
        ref={wrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        data-testid="preview-body"
      >
        <div style={{ width: DOC_WIDTH * scale, height: height * scale, margin: '0 auto', overflow: 'hidden' }}>
          <iframe
            ref={frame}
            title="Estimate document"
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={onLoad}
            data-testid="preview-frame"
            style={{ width: DOC_WIDTH, height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block', pointerEvents: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
