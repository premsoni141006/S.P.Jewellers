import type { Product } from '@shared';
import { useBackLayer } from '../lib/backStack';
import { useLeave } from './useLeave';

/** Pop-up (blurred page behind) listing the saved items. New items are added in Settings, via the "+" row. */
export function ProductPicker({ products, selected, onPick, onAdd, onClose }: { products: Product[]; selected: string; onPick: (p: Product) => void; onAdd: () => void; onClose: () => void }) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose)); // system Back closes this pop-up only
  const list = products.filter((p) => p.name.trim());
  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation" data-testid="picker-backdrop">
      <div className="rates-card picker-card" role="dialog" aria-modal="true" aria-label="Choose item" onClick={(e) => e.stopPropagation()} data-testid="picker-modal">
        <div className="rates-head">
          <h2>Choose item</h2>
          <button className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close" data-testid="picker-close">✕</button>
        </div>
        <ul className="pick-list">
          {list.map((p) => (
            <li key={p.id}>
              <button className={`pick-row${p.name === selected ? ' on' : ''}`} onClick={() => leave(() => onPick(p))} data-testid="pick-option">
                <span className="pick-name">{p.name}</span>
                <span className="pick-meta">Tunch {p.tunch}%</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted small pick-empty">No saved items yet.</li>}
          <li>
            <button className="pick-row pick-add" onClick={() => leave(onAdd)} data-testid="pick-add">
              <span className="pick-plus" aria-hidden="true">+</span>
              <span className="pick-name">Add new item</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
