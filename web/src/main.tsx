import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initKeyboardFocus } from './lib/keyboardFocus';
import { isNative } from './lib/native';
import './styles.css';

initKeyboardFocus();

// iPhone Safari ignores user-scalable=no: block its pinch gestures directly (double-tap zoom is off through touch-action).
// (The bill preview has its own zoom, built on pointer events, which this does not touch.)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !(e.target as Element | null)?.closest?.('.preview-body, .gx-stage, .crop-frame')) e.preventDefault(); }, { passive: false });
async function start(): Promise<void> {
  // One-time wipe: the first time a device opens this version it forgets everything saved on it (bills, stock, cash,
  // photos, products, settings, password). Change WIPE_ID to wipe every device again.
  const WIPE_ID = '2026-10-09-new-shop';
  try {
    if (window.localStorage.getItem('spj.wipe.v1') !== WIPE_ID) {
      // the password the owner set stays through the wipe
      let pass = '';
      try { pass = (JSON.parse(window.localStorage.getItem('spj.settings.v1') ?? '{}') as { loginPass?: string }).loginPass || (JSON.parse(window.localStorage.getItem('spj.auth.v3') ?? '{}') as { pass?: string }).pass || ''; } catch { /* no saved password */ }
      for (const k of Object.keys(window.localStorage)) if (/^(spj|kj)\./.test(k) && k !== 'spj.cloud.v1') window.localStorage.removeItem(k);
      if (pass) window.localStorage.setItem('spj.settings.v1', JSON.stringify({ loginPass: pass }));
      for (const db of ['spj-photos', 'kj-photos']) indexedDB.deleteDatabase(db);
      window.localStorage.setItem('spj.wipe.v1', WIPE_ID);
    }
  } catch { /* storage blocked: nothing saved to wipe */ }
  // Development only: ?demo=stock loads sample stock to try Stock OUT.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'stock') {
    const { loadDemoStock } = await import('./lib/demoData');
    await loadDemoStock();
    window.history.replaceState(null, '', window.location.pathname);
  }
  mount();
}

function mount(): void {
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
}

void start();

// The Android app serves the files itself; a service worker is only for the website.
if (import.meta.env.PROD && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional; the app works without it */
    });
  });
}

// A website opened from the home screen is resumed, not reloaded, so it can keep running an old copy. When a newer one is
// published, load it: check when the app starts and every time it comes back to the front.
if (import.meta.env.PROD && !isNative()) {
  const current = () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? '';
  const check = async () => {
    try {
      const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
      const latest = /\/assets\/index-[^"']+\.js/.exec(await res.text())?.[0];
      if (latest && current() && current() !== latest) {
        const last = Number(sessionStorage.getItem('spj.reloaded') ?? 0);
        if (Date.now() - last > 30_000) { sessionStorage.setItem('spj.reloaded', String(Date.now())); window.location.reload(); }
      }
    } catch { /* offline: keep the copy that is running */ }
  };
  window.setTimeout(check, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
}
