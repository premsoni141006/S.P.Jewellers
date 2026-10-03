import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

// ------------------------------------------------------------------ icons (16px, stroke)

const paths: Record<string, string> = {
  plus: 'M8 3v10M3 8h10',
  save: 'M3 3h8l2 2v8H3zM5 3v3h5V3M5 13V9h6v4',
  print: 'M4 6V2h8v4M4 11H2V6h12v5h-2M4 9h8v5H4z',
  eye: 'M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zM8 10a2 2 0 100-4 2 2 0 000 4z',
  gear: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3',
  copy: 'M5 5h8v8H5zM3 11V3h8',
  trash: 'M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10',
  refresh: 'M13 3v4H9M3 13V9h4M12.5 7A5 5 0 004 5M3.5 9A5 5 0 0012 11',
  close: 'M4 4l8 8M12 4l-8 8',
  undo: 'M4 6h6a3 3 0 010 6H6M4 6l3-3M4 6l3 3',
  file: 'M4 2h5l3 3v9H4zM9 2v3h3',
  bt: 'M5 5l6 6-3 3V2l3 3-6 6',
  check: 'M3 8l3 3 7-7',
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// ------------------------------------------------------------------ number input

const toText = (v: number, blankZero: boolean) => (blankZero && v === 0 ? '' : String(v));

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValue: (n: number) => void;
  decimals?: number;
  integer?: boolean;
  blankZero?: boolean;
};

/** Text box for numbers that lets the user type "4." or "" without the value jumping. */
export function NumberInput({ value, onValue, decimals = 3, integer = false, blankZero = true, onBlur, onFocus, ...rest }: NumberInputProps) {
  const [text, setText] = useState(() => toText(value, blankZero));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(toText(value, blankZero));
  }, [value, blankZero]);

  const pattern = integer ? /^\d*$/ : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        setText(toText(value, blankZero));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, '').trim();
        if (!pattern.test(t)) return;
        setText(t);
        const n = t === '' || t === '.' ? 0 : Number(t);
        if (Number.isFinite(n)) onValue(n);
      }}
    />
  );
}

// ------------------------------------------------------------------ modal

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  extra?: { label: string; onClick: () => void };
  onConfirm: () => void;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  if (!state) return null;
  return (
    <Modal
      title={state.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {state.extra && (
            <button
              className="btn"
              onClick={() => {
                onClose();
                state.extra?.onClick();
              }}
            >
              {state.extra.label}
            </button>
          )}
          <button
            className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
            autoFocus
            onClick={() => {
              onClose();
              state.onConfirm();
            }}
          >
            {state.confirmLabel}
          </button>
        </>
      }
    >
      {state.body}
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  text: string;
}

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === 'ok' && <Icon name="check" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'err' | 'gold' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
