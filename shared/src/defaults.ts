import type { Estimate, EstimateItem, EstimatePricing, Metal, Product, ShopSettings } from './types';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'S.P. JEWELLERS',
  // Second printed line under the shop name. Empty: the bill shows the shop name only.
  shopCode: '',
  address: 'Main Bazar, Near Gandhi Chowk, Ellenabad-125102',
  tagline: 'Manufacturer of Gold & Silver Ornaments',
  ownerName: 'Sandeep Soni',
  printLogo: true,
  ownerFamily: 'Sh. Om Parkash S/o. Sh. Gopal Ram Soni',
  phone: '94166 25950',
  gstNumber: '',
  // Rates are for fine (pure) metal. The owner sets today's rate in Settings or on the estimate.
  defaultGoldRate: 7200,
  goldRateUnit: 'per_gram',
  defaultSilverRate: 231,
  silverRateUnit: 'per_gram',
  defaultLabour: 0,
  defaultLabourMode: 'fixed',
  fineFormula: 'tunch_plus_wastage',
  gstEnabled: false,
  gstPercent: 3,
  roundGrandTotal: true,
};

export type ShopId = 'SPJ' | 'KJ';
export const SHOP_IDS: ShopId[] = ['SPJ', 'KJ'];

/** What each shop starts with. SPJ keeps the settings above; Kashi Jewellers has its own name, address and two owners, and no logo until one is uploaded. */
export const SHOP_SETTINGS: Record<ShopId, ShopSettings> = {
  SPJ: DEFAULT_SETTINGS,
  KJ: {
    ...DEFAULT_SETTINGS,
    shopName: 'KASHI JEWELLERS',
    address: 'Main Bazar, Bhadra',
    ownerName: 'Jaideep Soni',
    ownerFamily: '',
    phone: '9782785300',
    ownerName2: 'Yogesh Soni',
    phone2: '9929288743',
    printLogo: false,
  },
};

/** Demo product list. Fully editable in Settings → Products. */
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 'p-gold-ring', name: 'Gold Ring – Classic', metal: 'gold', tunch: 92, wastage: 0, labourRate: 0, labourMode: 'fixed' },
  { id: 'p-gold-chain', name: 'Gold Chain – Daily Wear', metal: 'gold', tunch: 92, wastage: 0, labourRate: 0, labourMode: 'fixed' },
  { id: 'p-gold-earrings', name: 'Gold Earrings – Floral', metal: 'gold', tunch: 92, wastage: 0, labourRate: 0, labourMode: 'fixed' },
  { id: 'p-gold-bracelet', name: 'Gold Bracelet – Designer', metal: 'gold', tunch: 92, wastage: 0, labourRate: 0, labourMode: 'fixed' },
  { id: 'p-silver-anklet', name: 'Silver Anklet – Traditional', metal: 'silver', tunch: 100, wastage: 0, labourRate: 0, labourMode: 'fixed' },
  { id: 'p-silver-ring', name: 'Silver Ring – Plain', metal: 'silver', tunch: 100, wastage: 0, labourRate: 0, labourMode: 'fixed' },
];

export function pricingFromSettings(s: ShopSettings): EstimatePricing {
  return {
    goldRate: s.defaultGoldRate,
    goldRateUnit: s.goldRateUnit,
    goldKarat: '24', // the old 22K-rate switch is gone: karat and purity come from the Rates table
    silverRate: s.defaultSilverRate,
    silverRateUnit: s.silverRateUnit,
    fineFormula: s.fineFormula,
    gstEnabled: s.gstEnabled,
    gstPercent: s.gstPercent,
    roundGrandTotal: s.roundGrandTotal,
  };
}

/** Purity % of each gold karat until the owner changes them in the Rates pop-up. */
export const DEFAULT_KARAT_TABLE: Record<string, number> = { '24': 100, '22': 92, '21': 87.5, '20': 83.3, '18': 75, '14': 58.5 };
export const KARATS = Object.keys(DEFAULT_KARAT_TABLE).map(Number);
export const DEFAULT_KARAT = 22;

/** Purity % for a karat: from the owner's table, otherwise karat / 24. */
export function purityForKarat(table: Record<string, number> | undefined, karat: number): number {
  const v = (table ?? DEFAULT_KARAT_TABLE)[String(karat)];
  return typeof v === 'number' && v > 0 ? v : Math.round((karat / 24) * 10000) / 100;
}

/** Tunch every new item starts with: gold 92 (22K), silver 100. */
export const defaultTunch = (metal: Metal): number => (metal === 'gold' ? 92 : 100);

export function newItem(s: ShopSettings, metal: Metal = 'silver'): EstimateItem {
  return {
    id: newId(),
    description: '',
    metal,
    grossWt: 0,
    lessWt: 0,
    tunch: metal === 'gold' ? purityForKarat(s.karatTable, DEFAULT_KARAT) : defaultTunch(metal),
    ...(metal === 'gold' ? { karat: DEFAULT_KARAT } : {}),
    wastage: 0,
    pcs: 1,
    // Gold: making charge is a percentage; Silver: a rupee amount. Nothing is pre-filled.
    labourRate: 0,
    labourMode: metal === 'gold' ? 'percent' : 'fixed',
    amountOverride: null,
  };
}

export function itemFromProduct(p: Product, base: EstimateItem): EstimateItem {
  return {
    ...base,
    description: p.name,
    // The metal is chosen on the item when the estimate is made, not stored on the product.
    tunch: base.tunch,
    karat: base.karat,
    wastage: 0,
  };
}

export function newEstimate(s: ShopSettings): Estimate {
  const now = new Date().toISOString();
  return {
    id: newId(),
    number: 0,
    createdAt: now,
    updatedAt: now,
    customerName: '',
    customerPhone: '',
    customerLocality: '',
    pricing: pricingFromSettings(s),
    items: [newItem(s)],
    otherCharges: [],
    printStatus: 'not_printed',
    printedAt: null,
    lastPrintError: null,
  };
}

/** A filled-in estimate used by "Print Test Estimate". Not saved to history. */
export function sampleEstimate(s: ShopSettings): Estimate {
  const est = newEstimate(s);
  // Same items as the shop's sample estimate (SP_Jewellers_Simple_Demo_Estimate_v2.pdf).
  // [product, gross, less, pcs, making]: Gold making is a % of the gold value, Silver making is rupees.
  const rows: Array<[string, number, number, number, number]> = [
    ['p-gold-ring', 5.25, 0, 1, 5],
    ['p-gold-chain', 12.8, 0, 1, 4],
    ['p-gold-earrings', 4.6, 0.2, 1, 6],
    ['p-gold-bracelet', 8.35, 0, 1, 5],
    ['p-silver-anklet', 38.5, 0, 1, 900],
    ['p-silver-ring', 7.8, 0, 1, 300],
  ];
  est.items = rows.map(([pid, g, l, pcs, making]) => {
    const p = SAMPLE_PRODUCTS.find((x) => x.id === pid) as Product;
    return { ...itemFromProduct(p, newItem(s, p.metal)), metal: p.metal, grossWt: g, lessWt: l, pcs, labourRate: making };
  });
  est.pricing.gstEnabled = true;
  return est;
}

export function cloneItem(it: EstimateItem): EstimateItem {
  return { ...it, id: newId() };
}
