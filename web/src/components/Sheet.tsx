import type { ReactNode } from 'react';
import { useBackLayer } from '../lib/backStack';
import { useLeave } from './useLeave';

export interface SheetAction {
  label: string;
  kind?: 'primary' | 'danger' | 'plain';
  onClick: () => void;
}

export function Sheet({ title, children, actions, onClose }: { title: string; children?: ReactNode; actions: SheetAction[]; onClose: () => void }) {
  const { leaving, leave } = useLeave(180);
  useBackLayer(true, () => leave(onClose));
  return (
    <div className={`sheet-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">{title}</h2>
        {children && <div className="sheet-body">{children}</div>}
        <div className="sheet-actions">
          {actions.map((a) => (
            <button key={a.label} className={`btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-plain'}`} onClick={() => leave(a.onClick)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
