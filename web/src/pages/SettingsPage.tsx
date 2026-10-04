import { useState } from 'react';
import type { ShopSettings } from '@shared';
import { Icon } from '../components/Icon';
import { NumField } from '../components/NumField';
import type { AppStore } from '../lib/store';
import { changePassword } from '../lib/auth';

interface Props {
  store: AppStore;
  onPrinter: () => void;
}

function PasswordCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (label: string, value: string, set: (v: string) => void, testId: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box"><input type="password" value={value} onChange={(e) => { set(e.target.value); setMsg(null); }} autoComplete="off" data-testid={testId} /></span>
    </label>
  );
  return (
    <section className="card stack">
      <div className="section-title">Password</div>
      {field('Current password', cur, setCur, 'pw-current')}
      {field('New password', next, setNext, 'pw-new')}
      {field('New password again', again, setAgain, 'pw-again')}
      {msg && <p className={msg.ok ? 'small' : 'err small'} role="status" data-testid="pw-msg">{msg.text}</p>}
      <button className="btn btn-primary" data-testid="pw-save" onClick={() => {
        const err = changePassword(cur, next, again);
        if (err) setMsg({ ok: false, text: err });
        else { setMsg({ ok: true, text: 'Password changed.' }); setCur(''); setNext(''); setAgain(''); }
      }}>Change password</button>
    </section>
  );
}

function Text({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box"><input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} autoComplete="off" /></span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function SettingsPage({ store, onPrinter }: Props) {
  const { settings: s, setSettings } = store;
  const set = (patch: Partial<ShopSettings>) => setSettings({ ...s, ...patch });

  return (
    <div className="page" data-testid="settings-page">
      <button className="card row-link" onClick={onPrinter} data-testid="open-printer">
        <span className="tile-icon"><Icon name="printer" size={26} /></span>
        <span className="tile-text"><b>Printer settings</b><span className="muted small">{store.printer.mode === 'thermal' ? 'Bluetooth thermal printer' : 'Phone print dialog'}{store.printer.nativeName ? ` · ${store.printer.nativeName}` : ''}</span></span>
        <Icon name="next" size={18} />
      </button>

      <section className="card stack">
        <Toggle label="Print logo on the estimate (black & white)" checked={s.printLogo !== false} onChange={(v) => set({ printLogo: v })} />
      </section>

      <section className="card stack">
        <div className="section-title">Shop</div>
        <Text label="Shop name (printed on the estimate)" value={s.shopName} onChange={(v) => set({ shopName: v })} testId="shop-name" />
        <Text label="Address" value={s.address} onChange={(v) => set({ address: v })} />
        <Text label="Owner name" value={s.ownerName ?? ''} onChange={(v) => set({ ownerName: v })} />
        <Text label="Family line" value={s.ownerFamily ?? ''} onChange={(v) => set({ ownerFamily: v })} />
        <Text label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} />
        <Text label="GST number (optional)" value={s.gstNumber} onChange={(v) => set({ gstNumber: v })} />
      </section>

      <section className="card stack">
        <div className="section-title">GST</div>
        <Toggle label="Charge GST" checked={s.gstEnabled} onChange={(v) => set({ gstEnabled: v })} />
        {s.gstEnabled && <NumField label="GST %" value={s.gstPercent} onChange={(n) => set({ gstPercent: n })} suffix="%" />}
      </section>

      <PasswordCard />
    </div>
  );
}
