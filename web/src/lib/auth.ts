// Simple sign-in for the shop: user name SPJ, and a password the owner can change in Settings.
// This keeps casual visitors out of the app; it is not server-side security (data lives on the device).

import { KEYS, load, save } from './storage';

export const LOGIN_USER = 'SPJ';
const DEFAULT_PASS = '443262';
const SESSION_KEY = 'spj.unlocked';

const currentPass = (): string => load<{ pass?: string }>(KEYS.auth, {}).pass || DEFAULT_PASS;

export const checkPassword = (pass: string): boolean => pass === currentPass();

export const checkLogin = (user: string, pass: string): boolean => user.trim().toUpperCase() === LOGIN_USER && pass === currentPass();

/** Changes the password after checking the current one. Returns an error message, or '' when done. */
export function changePassword(current: string, next: string, again: string): string {
  if (current !== currentPass()) return 'Current password is not correct.';
  if (next.length < 4) return 'New password must be at least 4 characters.';
  if (next !== again) return 'The two new passwords are not the same.';
  return save(KEYS.auth, { pass: next }) ? '' : 'Could not save the password on this device.';
}

export function isUnlocked(): boolean {
  try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
export function setUnlocked(on: boolean): void {
  try { if (on) window.sessionStorage.setItem(SESSION_KEY, '1'); else window.sessionStorage.removeItem(SESSION_KEY); } catch { /* the sign-in just asks again */ }
}
