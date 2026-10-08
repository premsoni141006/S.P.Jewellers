import { useEffect, useMemo } from 'react';
import { ZoomImage } from './ZoomImage';
import { fmtDate, fmtWeight, fmtOrderId, orderIdOf, stockMatchesForSale, type Estimate, type StockEntry } from '@shared';
import { useBackLayer } from '../lib/backStack';
import { usePhotoUrl } from '../lib/photos';
import { useLeave } from './useLeave';

function Slide({ piece, onRemove }: { piece: StockEntry; onRemove: () => void }) {
  const url = usePhotoUrl(piece.photoId);
  return (
    <div className="match-slide" data-testid="match-slide">
      <div className="match-photo">{url ? <ZoomImage src={url} /> : <span className="muted small">No photo</span>}</div>
      <div className="match-info">
        <b>{fmtWeight(piece.weight)} g</b>
        <span className="muted small">Tunch {piece.tunch}% · IN {fmtDate(`${piece.date}T12:00:00`)}</span>
      </div>
      <button className="btn btn-outline btn-sm" onClick={onRemove} data-testid="match-remove">Remove</button>
    </div>
  );
}

/**
 * After a bill is saved: for each sold item, shows the pieces still in stock with the same metal,
 * category and weight (as a swipeable row with their photos) so the owner can take them out of stock.
 */
export function StockMatchModal({ est, stock, onRemove, onClose }: { est: Estimate; stock: StockEntry[]; onRemove: (pieces: StockEntry[]) => void; onClose: () => void }) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose));

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string; metal: string; weight: number; pieces: StockEntry[] }> = [];
    for (const it of est.items) {
      const key = `${it.metal}|${it.description.trim().toLowerCase()}|${it.grossWt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pieces = stockMatchesForSale(stock, { metal: it.metal, description: it.description, weight: it.grossWt });
      if (pieces.length) out.push({ key, label: it.description.trim(), metal: it.metal, weight: it.grossWt, pieces });
    }
    return out;
  }, [est, stock]);

  // Everything handled: nothing more to show.
  useEffect(() => { if (groups.length === 0) leave(onClose); }, [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="match-backdrop">
      <div className="rates-card match-card" role="dialog" aria-modal="true" aria-label="Update stock" onClick={(e) => e.stopPropagation()} data-testid="match-modal">
        <div className="rates-head">
          <h2>Update stock</h2>
          <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="match-close">✕</button>
        </div>
        <p className="muted small">{fmtOrderId(orderIdOf(est))} is saved. These pieces are still in stock with the same category and weight as what was sold. Remove the ones that went out.</p>
        {groups.map((g) => (
          <section key={g.key} className="match-group" data-testid="match-group">
            <div className="match-head">
              <b>{g.label}</b>
              <span className="muted small">{g.metal === 'gold' ? 'Gold' : 'Silver'} · {fmtWeight(g.weight)} g sold</span>
            </div>
            <div className="match-row">
              {g.pieces.map((p) => <Slide key={p.id} piece={p} onRemove={() => onRemove([p])} />)}
            </div>
            {g.pieces.length > 1 && <button className="btn btn-plain btn-sm danger-text" onClick={() => onRemove(g.pieces)} data-testid="match-remove-all">Remove all ({g.pieces.length})</button>}
          </section>
        ))}
        <button className="btn btn-primary btn-block" onClick={() => leave(onClose)} data-testid="match-done">Done</button>
      </div>
    </div>
  );
}
