import type { ShopSettings } from '@shared';
import { Icon } from '../components/Icon';
import { NumField } from '../components/NumField';
import type { AppStore } from '../lib/store';
import { isNative } from '../lib/native';

interface Props {
  store: AppStore;
  onPrinter: () => void;
}

function Text({ label, value, onChange, hint, testId }: { label: string; value: string; onChange: (v: string) => void; hint?: string; testId?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box"><input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} autoComplete="off" /></span>
      {hint && <span className="hint">{hint}</span>}
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

      <p className="muted small">Changes are saved on this device as you type. Rates and Products are on the Home screen.</p>

      <section className="card stack">
        <div className="section-title">Shop</div>
        <Text label="Shop name (printed on the estimate)" value={s.shopName} onChange={(v) => set({ shopName: v })} testId="shop-name" />
        <Text label="Address" value={s.address} onChange={(v) => set({ address: v })} hint="Not printed on the estimate." />
        <Toggle label="Print logo on the estimate (black & white)" checked={s.printLogo !== false} onChange={(v) => set({ printLogo: v })} />
        <Text label="Owner name" value={s.ownerName ?? ''} onChange={(v) => set({ ownerName: v })} hint="Shown in the app header. Not printed." />
        <Text label="Family line" value={s.ownerFamily ?? ''} onChange={(v) => set({ ownerFamily: v })} hint="e.g. Sh. Om Parkash S/o. Sh. Gopal Ram Soni. Not printed." />
        <Text label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} />
        <Text label="GST number (optional)" value={s.gstNumber} onChange={(v) => set({ gstNumber: v })} />
      </section>

      <section className="card stack">
        <div className="section-title">GST</div>
        <Toggle label="Charge GST" checked={s.gstEnabled} onChange={(v) => set({ gstEnabled: v })} />
        {s.gstEnabled && <NumField label="GST %" value={s.gstPercent} onChange={(n) => set({ gstPercent: n })} suffix="%" />}
      </section>
      <p className="muted small center">{isNative() ? 'Everything is saved on this phone and works without internet.' : 'Data is stored only in this browser. Clearing site data removes it.'}</p>
    </div>
  );
}
