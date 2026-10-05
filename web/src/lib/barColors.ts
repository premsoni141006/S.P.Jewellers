// Keeps the phone's status bar, its navigation bar and the browser's address-bar colour in step with the
// screen on show (the Gallery uses its gold / silver look; everything else the house maroon).

import { isNative, nativeSetBars } from './native';

const HOUSE = { status: '#6b0f1a', nav: '#fbf7ef', darkIcons: false };

export function setBarColors(c: { status: string; nav: string; darkIcons: boolean } = HOUSE): void {
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.status);
  } catch { /* the page colour is only decoration */ }
  if (isNative()) void nativeSetBars(c).catch(() => undefined);
}

export const GALLERY_BARS = {
  gold: { status: '#fffbf0', nav: '#f5ebd2', darkIcons: true },
  silver: { status: '#fdfcff', nav: '#eeedf6', darkIcons: true },
} as const;

export const restoreBarColors = (): void => setBarColors(HOUSE);
