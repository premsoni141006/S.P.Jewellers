// System Back (Android button or edge-swipe) for a single-page app.
//
// Inside the Android app the native side asks the page directly: MainActivity calls
// window.spjHandleBack(); if it returns true a layer was closed, otherwise the app exits.
// That avoids browser history altogether (Android's web view skips history entries a page adds
// without a fresh touch, so a history based approach is unreliable there).
//
// In a plain browser (the website) the same layers are tied to ONE spare history entry instead:
// Every screen / pop-up that can be "closed" registers itself as a layer with useBackLayer().
// While at least one layer is open the page keeps exactly ONE spare history entry (the
// "sentinel") ahead of the current one. A system Back pops that single entry, which closes
// exactly the top layer, and the sentinel is put back if more layers remain. With no layer open
// (the Home screen) there is no sentinel, so Back leaves the app on the first press.
//
// Closing a layer from the UI (an on-screen arrow, Save, etc.) never touches history except in
// one place - when the last layer closes, the now-unused sentinel is removed - and the popstate
// that removal causes is recognised and ignored. That is what prevents "two pages back at once".

import { useEffect, useRef } from 'react';

interface Layer {
  close: () => void;
}

const layers: Layer[] = [];
const isNativeApp = (): boolean => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
const SENTINEL = { spjBackSentinel: true };

let hasSentinel = false; // history currently holds the spare entry and we are standing on it
let removing = false; // we asked the browser to pop the sentinel ourselves
let timer: number | undefined;

function schedule(ms: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(reconcile, ms);
}

/** Brings history in line with the number of open layers. Runs a moment after layers change. */
function reconcile(): void {
  if (isNativeApp()) return; // the app handles Back natively, no history entries needed
  if (removing) return; // the popstate for our own pop will schedule another pass
  if (layers.length > 0 && !hasSentinel) {
    try {
      window.history.pushState(SENTINEL, '');
      hasSentinel = true;
    } catch {
      /* history unavailable: back simply leaves the app */
    }
  } else if (layers.length === 0 && hasSentinel) {
    removing = true;
    window.history.back();
    // If the browser never reports the pop, do not stay stuck.
    window.setTimeout(() => {
      if (removing) {
        removing = false;
        hasSentinel = false;
        schedule(0);
      }
    }, 600);
  }
}

/** Called by the Android activity on every system Back. Returns true when it closed a layer. */
function handleBack(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

if (typeof window !== 'undefined') {
  (window as unknown as { spjHandleBack: () => boolean }).spjHandleBack = handleBack;

  // A reload can land on a stale sentinel entry; make it an ordinary entry again.
  try {
    if ((window.history.state as { spjBackSentinel?: boolean } | null)?.spjBackSentinel) window.history.replaceState(null, '');
  } catch {
    /* ignore */
  }

  window.addEventListener('popstate', () => {
    if (isNativeApp()) return;
    if (removing) {
      // The pop we asked for: nothing to close.
      removing = false;
      hasSentinel = false;
      schedule(0);
      return;
    }
    // The user went back: the sentinel is gone, close exactly one layer.
    hasSentinel = false;
    const top = layers[layers.length - 1];
    if (top) top.close();
    schedule(60); // let React apply the close, then re-add the sentinel if layers remain
  });
}

/**
 * While `active`, this screen / pop-up is a back layer: a system Back calls `close` for the
 * most recently opened layer only.
 */
export function useBackLayer(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { close: () => closeRef.current() };
    layers.push(layer);
    schedule(30);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      schedule(30);
    };
  }, [active]);
}
