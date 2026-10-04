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
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !(e.target as Element | null)?.closest?.('.preview-body')) e.preventDefault(); }, { passive: false });
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The Android app serves the files itself; a service worker is only for the website.
if (import.meta.env.PROD && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional; the app works without it */
    });
  });
}
