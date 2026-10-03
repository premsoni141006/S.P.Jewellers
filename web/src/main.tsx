import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initKeyboardFocus } from './lib/keyboardFocus';
import { isNative } from './lib/native';
import './styles.css';

initKeyboardFocus();

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
