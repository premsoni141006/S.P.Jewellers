import { useRef, useState } from 'react';
import { useBackLayer } from '../lib/backStack';
import { useLeave } from '../components/useLeave';
import type { ShopSettings } from '@shared';
import { Icon } from '../components/Icon';
import { NumField } from '../components/NumField';
import type { AppStore } from '../lib/store';
import { changePassword, checkCloudGate, checkDeleteGate, passwordError, setUnlocked } from '../lib/auth';
import { ShopLogo } from '../components/ShopLogo';
import { logoFromFile } from '../lib/logoImage';
import { DEFAULT_CLOUD_URL, loadCloudConfig, wipeData, type WipeChoice, pingCloud, saveCloudConfig, syncAll, useCloudStatus } from '../lib/cloud';
import { fmtDateTime } from '@shared';

interface Props {
  store: AppStore;
  onPrinter: () => void;
}

/** Forces the newest version of the site: forgets the saved copies of the app files, then reloads. Your data is not touched. */
async function updateApp(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch { /* reload anyway */ }
  window.location.replace(`${window.location.pathname}?v=${Date.now()}`);
}

/** Cloud backup: the shop's Cloudflare Worker (R2). Everything stays on the phone too; this adds a copy in the cloud and shares it between devices. */
function CloudCard({ onSynced }: { onSynced: () => void }) {
  const cfg = loadCloudConfig();
  const st = useCloudStatus();
  const [url, setUrl] = useState(cfg?.url ?? DEFAULT_CLOUD_URL);
  const [key, setKey] = useState(cfg?.key ?? '');
  const [msg, setMsg] = useState('');
  const connect = async () => {
    const c = { url: url.trim().replace(/\/+$/, ''), key: key.trim() };
    if (!c.url || !c.key) { setMsg('Enter the cloud address and the key.'); return; }
    setMsg('Checking…');
    const problem = await pingCloud(c);
    if (problem) { setMsg(problem); return; }
    saveCloudConfig(c);
    setMsg('Connected. Syncing…');
    if (await syncAll(c)) onSynced();
    setMsg('');
  };
  const field = (label: string, value: string, set: (v: string) => void, testId: string, type = 'text') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-box"><input type={type} value={value} onChange={(e) => { set(e.target.value); setMsg(''); }} autoComplete="off" autoCapitalize="off" data-testid={testId} /></span>
    </label>
  );
  return (
    <section className="card stack" data-testid="cloud-card">
      <div className="section-title">Cloud backup</div>
      {field('Cloud address', url, setUrl, 'cloud-url')}
      {field('Cloud key', key, setKey, 'cloud-key', 'password')}
      <p className="small" role="status" data-testid="cloud-status">
        {msg || (st.state === 'off' ? 'Off. Data is only on this device.'
          : st.state === 'syncing' ? 'Syncing…'
          : st.state === 'error' ? `Could not sync: ${st.error}`
          : st.last ? `In sync · last ${fmtDateTime(st.last)}` : 'Connected.')}
      </p>
      <div className="grid-2">
        <button className="btn btn-primary" onClick={() => void connect()} data-testid="cloud-connect">{cfg ? 'Save & sync' : 'Connect'}</button>
        {cfg && <button className="btn btn-plain" onClick={() => { saveCloudConfig({ url: '', key: '' }); setMsg(''); }} data-testid="cloud-off">Turn off</button>}
      </div>
    </section>
  );
}


/** Asks for the password that opens the Cloud backup card. */
function GateWindow({ onOpen, onClose, check = checkCloudGate }: { onOpen: () => void; onClose: () => void; check?: (pass: string) => boolean }) {
  const { leaving, leave } = useLeave();
  useBackLayer(true, () => leave(onClose));
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => leave(onClose)} role="presentation">
      <form className="rates-card" role="dialog" aria-modal="true" aria-label="Password" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (check(pass)) leave(onOpen); else setError(passwordError()); }} data-testid="cloud-gate">
        <div className="rates-head"><h2>Password</h2><button type="button" className="bar-btn close-x" onClick={() => leave(onClose)} aria-label="Close">✕</button></div>
        <label className="field">
          <span className="field-label">Enter the password</span>
          <span className="field-box"><input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} autoComplete="off" autoFocus data-testid="cloud-gate-pass" /></span>
        </label>
        {error && <p className="err small" role="alert" data-testid="cloud-gate-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" data-testid="cloud-gate-ok">Open</button>
      </form>
    </div>
  );
}

/** The Cloud backup card stays hidden behind a thin "spj-img" card: tap it 5 times in a row, then enter the password. */
function CloudGate({ onSynced }: { onSynced: () => void }) {
  const [shown, setShown] = useState(false);
  const [asking, setAsking] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  if (shown) return <CloudCard onSynced={onSynced} />;
  const tap = () => {
    const now = Date.now();
    taps.current = { n: now - taps.current.t < 2000 ? taps.current.n + 1 : 1, t: now };
    if (taps.current.n >= 5) { taps.current = { n: 0, t: 0 }; setAsking(true); }
  };
  return (
    <>
      <button type="button" className="thin-card" onClick={tap} data-testid="cloud-thin">spj-img</button>
      {asking && <GateWindow onClose={() => setAsking(false)} onOpen={() => { setAsking(false); setShown(true); }} />}
    </>
  );
}

const WIPE_ROWS: { key: keyof WipeChoice; label: string }[] = [
  { key: 'bills', label: 'Bills' },
  { key: 'stock', label: 'Stock entries' },
  { key: 'images', label: 'Images (stock photos)' },
  { key: 'cash', label: 'Cash entries' },
  { key: 'picks', label: 'Customer picks (Gallery likes)' },
  { key: 'products', label: 'Products' },
  { key: 'settings', label: 'Shop settings' },
];

/** Deletes saved data on purpose, on this device and in the cloud. Tick what to delete, then confirm. */
function DeleteCard({ onDone }: { onDone: () => void }) {
  const [pick, setPick] = useState<WipeChoice>({ bills: false, stock: false, images: false, cash: false, picks: false, products: false, settings: false });
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const any = Object.values(pick).some(Boolean);
  const all = Object.values(pick).every(Boolean);
  const run = async () => {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    const problem = await wipeData(pick);
    setBusy(false);
    setSure(false);
    if (problem) { setMsg(problem); return; }
    setMsg('Deleted.');
    setPick({ bills: false, stock: false, images: false, cash: false, picks: false, products: false, settings: false });
    onDone();
  };
  return (
    <section className="card stack" data-testid="delete-card">
      <div className="section-title">Delete saved data</div>
      <Toggle label="Everything" checked={all} onChange={(v) => { setPick({ bills: v, stock: v, images: v, cash: v, picks: v, products: v, settings: v }); setSure(false); setMsg(''); }} />
      {WIPE_ROWS.map((r) => (
        <Toggle key={r.key} label={r.label} checked={pick[r.key]} onChange={(v) => { setPick({ ...pick, [r.key]: v }); setSure(false); setMsg(''); }} />
      ))}
      <p className="small" role="status" data-testid="delete-status">
        {msg || (all ? 'Deletes everything here and in the cloud, and every phone clears itself the next time it opens.' : 'Deletes the ticked items here and in the cloud. A phone that still has them can send them back; tick Everything to clear every phone.')}
      </p>
      <button className="btn btn-primary" disabled={!any || busy} onClick={() => void run()} data-testid="delete-go">{busy ? 'Deleting…' : sure ? 'Tap again to delete for good' : 'Delete ticked'}</button>
    </section>
  );
}

/** The delete card stays hidden behind a thin "spj-del" card: tap it 5 times in a row, then enter the password. */
function DeleteGate({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [asking, setAsking] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  if (shown) return <DeleteCard onDone={onDone} />;
  const tap = () => {
    const now = Date.now();
    taps.current = { n: now - taps.current.t < 2000 ? taps.current.n + 1 : 1, t: now };
    if (taps.current.n >= 5) { taps.current = { n: 0, t: 0 }; setAsking(true); }
  };
  return (
    <>
      <button type="button" className="thin-card" onClick={tap} data-testid="delete-thin">spj-del</button>
      {asking && <GateWindow check={checkDeleteGate} onClose={() => setAsking(false)} onOpen={() => { setAsking(false); setShown(true); }} />}
    </>
  );
}

/** The shop logo: upload one from the phone's gallery or camera; it shows in the app and prints (in black and white) on the bill. */
function LogoCard({ s, set }: { s: ShopSettings; set: (p: Partial<ShopSettings>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      set({ logoData: await logoFromFile(file), printLogo: true });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not use that picture. Try another one.');
    }
  };
  return (
    <section className="card stack" data-testid="logo-card">
      <div className="section-title">Shop logo</div>
      <div className="logo-row">
        <ShopLogo size={64} logoData={s.logoData} name={s.shopName} />
        <div className="logo-actions">
          <button className="btn btn-outline btn-sm" onClick={() => input.current?.click()} data-testid="logo-upload">{s.logoData ? 'Change logo' : 'Upload logo'}</button>
          {s.logoData && <button className="btn btn-plain btn-sm" onClick={() => set({ logoData: undefined })} data-testid="logo-remove">Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="logo-file" />
      </div>
      {error && <p className="err small" role="alert" data-testid="logo-error">{error}</p>}
      <Toggle label="Print logo on the estimate (black & white)" checked={s.printLogo !== false} onChange={(v) => set({ printLogo: v })} />
    </section>
  );
}

/** Which shop is signed in, and a way to sign out (to open the other shop). */
function AccountCard({ shopName }: { shopName: string }) {
  return (
    <section className="card stack" data-testid="account-card">
      <div className="section-title">Account</div>
      <p className="small">Signed in: <b data-testid="account-shop">{shopName}</b></p>
      <button className="btn btn-outline" onClick={() => void updateApp()} data-testid="update-app">Update app now</button>
      <button className="btn btn-outline" onClick={() => { setUnlocked(false); window.location.reload(); }} data-testid="sign-out">Sign out / switch shop</button>
    </section>
  );
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

      <LogoCard s={s} set={set} />

      <section className="card stack">
        <div className="section-title">Shop</div>
        <Text label="Shop name (printed on the estimate)" value={s.shopName} onChange={(v) => set({ shopName: v })} testId="shop-name" />
        <Text label="Line under the shop name" value={s.tagline ?? ''} onChange={(v) => set({ tagline: v })} testId="tagline" />
        <Text label="Address" value={s.address} onChange={(v) => set({ address: v })} />
        <Text label="Owner name" value={s.ownerName ?? ''} onChange={(v) => set({ ownerName: v })} />
        <Text label="Family line" value={s.ownerFamily ?? ''} onChange={(v) => set({ ownerFamily: v })} />
        <Text label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} />
        <Text label="Second owner name (optional)" value={s.ownerName2 ?? ''} onChange={(v) => set({ ownerName2: v })} testId="owner2-name" />
        <Text label="Second owner phone (optional)" value={s.phone2 ?? ''} onChange={(v) => set({ phone2: v })} testId="owner2-phone" />
        <Text label="GST number (optional)" value={s.gstNumber} onChange={(v) => set({ gstNumber: v })} />
      </section>

      <section className="card stack">
        <div className="section-title">GST</div>
        <Toggle label="Charge GST" checked={s.gstEnabled} onChange={(v) => set({ gstEnabled: v })} />
        {s.gstEnabled && <NumField label="GST %" value={s.gstPercent} onChange={(n) => set({ gstPercent: n })} suffix="%" />}
      </section>

      <CloudGate onSynced={store.reload} />

      <DeleteGate onDone={store.reload} />

      <PasswordCard />

      <AccountCard shopName={s.shopName} />
    </div>
  );
}
