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

export const checkPassword = (pass: string): boolean => pass === currentPass();

export function checkLogin(user: string, pass: string): boolean {
  const shop = shopOfUser(user);
  return !!shop && pass === passOf(shop);
}

/** Changes the password of the signed-in shop after checking the current one. Returns an error message, or '' when done. */
export function changePassword(current: string, next: string, again: string): string {
  if (current !== currentPass()) return 'Current password is not correct.';
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
