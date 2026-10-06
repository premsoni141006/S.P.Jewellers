// Data model shared by the desktop app and the website.
// All weights are grams, all money is rupees. Percentages are plain numbers (91.6 = 91.6 %).

export type Metal = 'gold' | 'silver';

export type PcsUnit = 'pc' | 'pair';

/** How the Labour value typed for an item turns into rupees. */
/**
 * How the Making charge entered on an item is turned into rupees:
 *  - fixed:   the number is the total rupees (Silver items)
 *  - percent: the number is a % of the item's metal value (Gold items)
 *  - per_gram / per_piece: older data only; converted to a total when loaded
 */
export type LabourMode = 'per_gram' | 'per_piece' | 'fixed' | 'percent';

/** The unit the shop quotes a metal rate in. Rates are for fine (pure) metal. */
export type RateUnit = 'per_gram' | 'per_10g' | 'per_kg';

/**
 * Which percentages make up the fine ("Silver") weight.
 * @deprecated Wastage was removed, so only Net x Tunch / 100 is used; this setting is ignored.
 */
export type FineFormula = 'tunch_plus_wastage' | 'tunch_only';

export interface EstimateItem {
  id: string;
  description: string;
  metal: Metal;
  grossWt: number;
  lessWt: number;
  tunch: number;
  /** Gold only: the karat the owner typed (24, 22, 18...). Printed as "24K"; `tunch` holds the purity % that karat has in the Rates table. */
  karat?: number;
  /** @deprecated Wastage was removed; old saved values are ignored. Always 0 for new items. */
  wastage: number;
  pcs: number;
  /** @deprecated The pieces/pairs option was removed. Old saved data may still carry it; it is ignored. */
  pcsUnit?: PcsUnit;
  labourRate: number;
  labourMode: LabourMode;
  /** When set, replaces the calculated amount for this line. */
  amountOverride: number | null;
}

export interface OtherCharge {
  id: string;
  label: string;
  amount: number;
}

/** Pricing captured on each estimate so a reprint months later shows the same numbers. */
export interface EstimatePricing {
  goldRate: number;
  goldRateUnit: RateUnit;
  goldKarat?: '22' | '24';
  silverRate: number;
  silverRateUnit: RateUnit;
  fineFormula: FineFormula;
  gstEnabled: boolean;
  gstPercent: number;
  roundGrandTotal: boolean;
}

export type PrintStatus = 'not_printed' | 'printed' | 'failed';

/** Money received from the customer against a bill. Records are never edited or removed; each one lowers the balance. */
export interface Payment {
  id: string;
  /** Whole rupees. */
  amount: number;
  /** When it was received (ISO); the day name and date shown on the bill come from this. */
  at: string;
  /** How it was paid. Missing = cash (older payments and the amount deposited while making the bill). */
  mode?: 'cash' | 'upi' | 'gold' | 'silver';
  /** Old gold the customer gave instead of money: its value was cut from the bill (`amount` is that value). */
  gold?: GoldPayment;
  /** Old silver given instead of money (same idea, with a tunch % instead of a karat). */
  silver?: SilverPayment;
}

export interface SilverPayment {
  weight: number;
  /** Purity % of the silver. */
  tunch: number;
  /** Silver rate used, in rupees per 10 g. */
  rate: number;
  cutPct: number;
}

export interface GoldPayment {
  /** Weight of the old gold in grams. */
  weight: number;
  /** Its karat as the owner typed it (22, 24...). */
  karat: number;
  /** Purity % that karat has in the Rates table at that moment. */
  purity: number;
  /** Gold rate used, in rupees per 10 g. */
  rate: number;
  /** Percentage cut for melting / wastage (0 = none). */
  cutPct: number;
}

export interface Estimate {
  id: string;
  /** 0 until the estimate is saved for the first time. */
  number: number;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerPhone: string;
  /** Customer's locality / area (optional). */
  customerLocality?: string;
  pricing: EstimatePricing;
  items: EstimateItem[];
  otherCharges: OtherCharge[];
  printStatus: PrintStatus;
  printedAt: string | null;
  lastPrintError: string | null;
  /** Set from the preview: 'pending' shows a red dot in history, 'clear' a green one, unset shows no dot. */
  billStatus?: 'pending' | 'clear';
  /** Payments received so far (added from the final bill until it is marked Clear). */
  payments?: Payment[];
  /** Gold / silver the customer handed in (grams), same karat / purity as the metal bought, valued at its own rate (`goldRate` / `silverRate`, rupees per 10 g; missing = the bill's 24K rate). Its value is cut from the bill. */
  submitted?: { gold?: number; silver?: number; goldRate?: number; silverRate?: number };
  /** Amount deposited, typed while the bill is being made; becomes the first payment (with the day and time) when the bill is saved. */
  advance?: number;
}

export interface ShopSettings {
  /** First line of the printed header. */
  shopName: string;
  /** Second line of the printed header. */
  shopCode: string;
  address: string;
  /** Line printed between the shop name and the address, e.g. "Manufacturer of Gold & Silver Ornaments". */
  tagline?: string;
  /** Owner's name — kept for the shop's records and the app header; not printed on the estimate. */
  ownerName?: string;
  /** Print the black-and-white logo above the shop name on the A4 estimate. Missing = on. */
  printLogo?: boolean;
  /** Family line as the shop shows it, e.g. "Sh. Om Parkash S/o. Sh. Gopal Ram Soni". Not printed. */
  ownerFamily?: string;
  phone: string;
  /** A second owner (shops with two owners print both). */
  ownerName2?: string;
  phone2?: string;
  /** The shop's own logo (an image as a data URI), uploaded in Settings. Used on screen and, in black and white, on the bill. */
  logoData?: string;
  gstNumber: string;
  /** @deprecated Replaced by karatTable. */
  goldKarat?: '22' | '24';
  /** Purity % of each gold karat (set in the Rates pop-up), e.g. { "24": 100, "22": 92, "18": 75 }. */
  karatTable?: Record<string, number>;
  defaultGoldRate: number;
  goldRateUnit: RateUnit;
  defaultSilverRate: number;
  silverRateUnit: RateUnit;
  defaultLabour: number;
  defaultLabourMode: LabourMode;
  fineFormula: FineFormula;
  gstEnabled: boolean;
  gstPercent: number;
  roundGrandTotal: boolean;
}

/** An entry in the editable product list (Description suggestions with defaults). */
export interface Product {
  id: string;
  name: string;
  metal: Metal;
  tunch: number;
  wastage: number;
  labourRate: number;
  labourMode: LabourMode;
  pcsUnit?: PcsUnit;
}

export interface EstimateSummary {
  id: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  grandTotal: number;
  itemCount: number;
  printStatus: PrintStatus;
  printedAt: string | null;
  billStatus?: 'pending' | 'clear';
}
