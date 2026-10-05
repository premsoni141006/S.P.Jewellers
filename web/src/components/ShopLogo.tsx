import { activeShop } from '../lib/shop';

/** The shop's logo: the one uploaded in Settings, else S.P. Jewellers' own logo, else a monogram (for a shop without a logo yet). */
export function ShopLogo({ size, logoData, shop = activeShop(), name = '' }: { size: number; logoData?: string; shop?: 'SPJ' | 'KJ'; name?: string }) {
  if (logoData) return <img className="home-logo" src={logoData} alt="" width={size} height={size} style={{ objectFit: 'contain', background: '#fff' }} />;
  if (shop === 'SPJ') return <img className="home-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={size} height={size} />;
  const letters = (name || 'KJ').split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase() || shop;
  return <span className="home-logo mono" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">{letters}</span>;
}
