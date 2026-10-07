// Sign-in for the shops. User name SPJ (S.P. Jewellers) or KJ (Kashi Jewellers), each with its own password
// that the owner can change in Settings. This keeps casual visitors out of the app; it is not server-side
// security (the data lives on the device).

import { SHOP_SETTINGS, type ShopId } from '@shared';
import { KEYS, load, save } from './storage';
import { GLOBAL_KEYS, activeShop, keyFor, setActiveShop, shopOfUser } from './shop';

const DEFAULT_PASS: Record<ShopId, string> = { SPJ: '3262', KJ: '0800' };

/** The password of a shop: the one the owner set in Settings, otherwise its starting password. */
const passOf = (shop: ShopId): string => load<{ pass?: string }>(keyFor(shop, 'auth.v2'), {}).pass || DEFAULT_PASS[shop];
const currentPass = (): string => passOf(activeShop());

// Wrong passwords: the first 5 tries are free; from the 6th wrong one on, each wrong password locks every password
// box for 10 s more than the last (10 s, 20 s, 30 s ...). The count lives on this device, so a reload does not reset it.
const FREE_TRIES = 5;
const LOCK_STEP_MS = 10_000;
const FAIL_KEY = 'spj.pwfail.v1';
type Fails = { count: number; until: number };
const readFails = (): Fails => {
  try { return { count: 0, until: 0, ...(JSON.parse(window.localStorage.getItem(FAIL_KEY) ?? '{}') as Partial<Fails>) }; } catch { return { count: 0, until: 0 }; }
};
const writeFails = (f: Fails): void => { try { window.localStorage.setItem(FAIL_KEY, JSON.stringify(f)); } catch { /* the lock still works for this page view */ } };

/** Seconds left before another password may be tried (0 = free to try). */
export const lockSecondsLeft = (): number => Math.max(0, Math.ceil((readFails().until - Date.now()) / 1000));

/** Runs one password test under the lock: refused while locked, counted when wrong, count cleared when right. */
function attempt(test: () => boolean): boolean {
  if (lockSecondsLeft() > 0) return false;
  if (test()) { writeFails({ count: 0, until: 0 }); return true; }
  const count = readFails().count + 1;
  writeFails({ count, until: count > FREE_TRIES ? Date.now() + (count - FREE_TRIES) * LOCK_STEP_MS : 0 });
  return false;
}

/** What to show after a refused password: the usual message, or how long to wait when locked. */
export function passwordError(base = 'Password is not correct.'): string {
  const s = lockSecondsLeft();
  return s > 0 ? `Too many wrong passwords. Try again in ${s} second${s === 1 ? '' : 's'}.` : base;
}

export const checkPassword = (pass: string): boolean => attempt(() => pass === currentPass());

export function checkLogin(user: string, pass: string): boolean {
  return attempt(() => { const shop = shopOfUser(user); return !!shop && pass === passOf(shop); });
}

/** The Settings password that opens the cloud backup card. */
export const checkCloudGate = (pass: string): boolean => attempt(() => pass === '200614');

/** Changes the password of the signed-in shop after checking the current one. Returns an error message, or '' when done. */
export function changePassword(current: string, next: string, again: string): string {
  if (!checkPassword(current)) return passwordError('Current password is not correct.');
  if (next.length < 4) return 'New password must be at least 4 characters.';
  if (next !== again) return 'The two new passwords are not the same.';
  return save(KEYS.auth, { pass: next }) ? '' : 'Could not save the password on this device.';
}

/** The user name that signed in last on this device; shown again on the sign-in screen. */
export const savedUser = (): string => load<string>(GLOBAL_KEYS.user, '');

/** Signed in stays signed in on this device (until the browser data is cleared). Coming back from the Gallery still asks for the password (AppLock). */
export function isUnlocked(): boolean {
  return shopOfUser(load<string>(GLOBAL_KEYS.signedIn, '')) !== null;
}

/** Signs in as `user` (SPJ or KJ) and makes that shop's data the active one; `setUnlocked(false)` signs out. */
export function setUnlocked(on: boolean, user = ''): void {
  const shop = shopOfUser(user);
  if (on && shop) {
    setActiveShop(shop);
    save(GLOBAL_KEYS.signedIn, shop);
    save(GLOBAL_KEYS.user, shop);
  } else {
    save(GLOBAL_KEYS.signedIn, '');
  }
}

/** What a shop shows before the owner has changed anything. */
export const shopDefaults = (shop: ShopId = activeShop()) => SHOP_SETTINGS[shop];
