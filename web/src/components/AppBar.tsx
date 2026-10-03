import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function AppBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="appbar">
      <div className="appbar-side">
        {onBack && (
          <button className="bar-btn" onClick={onBack} aria-label="Back" data-testid="bar-back">
            <Icon name="back" size={22} />
          </button>
        )}
      </div>
      <h1 className="appbar-title">{title}</h1>
      <div className="appbar-side right">{right}</div>
    </header>
  );
}

/** Gold serif wordmark with the diamond ornament, shared by Home and the splash header. */
export function Ornament() {
  return (
    <svg className="ornament" viewBox="0 0 220 12" aria-hidden="true">
      <path d="M0 6h92M128 6h92" stroke="currentColor" strokeWidth="1" />
      <path d="M110 1l5 5-5 5-5-5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="98" cy="6" r="1.6" fill="currentColor" />
      <circle cx="122" cy="6" r="1.6" fill="currentColor" />
    </svg>
  );
}
