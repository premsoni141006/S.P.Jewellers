// Which shop is signed in on this device. Each shop keeps its own data (bills, stock, cash, products,
// settings, photos, cloud copy), kept apart by a storage prefix: SPJ keeps "spj.", Shree Bala Ji Jewellers uses "sbj.".

import { SHOP_IDS, type ShopId } from '@shared';

/** These two are shared by all shops: who is signed in, and the last user name typed. */
export const GLOBAL_KEYS = { signedIn: 'spj.signedin.v1', user: 'spj.user.v1' } as const;

export const shopOfUser = (user: string): ShopId | null => {
  const u = user.trim().toUpperCase();
  return (SHOP_IDS as string[]).includes(u) ? (u as ShopId) : null;
};

const prefixOf = (shop: ShopId): string => (shop === 'SBJ' ? 'sbj' : 'spj');

function readActive(): ShopId {
  try {
    return shopOfUser(JSON.parse(window.localStorage.getItem(GLOBAL_KEYS.signedIn) ?? '""') as string) ?? 'SPJ';
  } catch {
    return 'SPJ';
  }
}

let active: ShopId = readActive();
export const activeShop = (): ShopId => active;
export const setActiveShop = (s: ShopId): void => { active = s; };
export const shopPrefix = (): string => prefixOf(active);
/** The storage key for `name` ("history.v1") in the given shop. */
export const keyFor = (shop: ShopId, name: string): string => `${prefixOf(shop)}.${name}`;
