// Bridge to the Android app's native printer plugin (SpjPrinter). Inside the Capacitor app the
// WebView cannot use window.print() or Web Bluetooth, so printing goes through this plugin.
// No @capacitor dependency: the app injects window.Capacitor at runtime.

export interface PairedDevice {
  name: string;
  address: string;
  isPrinter: boolean;
  isClassic: boolean;
}

export type NativePrintState = 'completed' | 'cancelled' | 'queued' | 'blocked' | 'timeout';

interface SpjPrinterPlugin {
  printHtml(o: { html: string; jobName: string }): Promise<{ state: NativePrintState }>;
  bluetoothStatus(): Promise<{ supported: boolean; enabled: boolean; permission: string }>;
  listPairedPrinters(): Promise<{ devices: PairedDevice[] }>;
  printEscPos(o: { address: string; data: string }): Promise<{ bytes: number }>;
  openBluetoothSettings(): Promise<void>;
  saveFile(o: { name: string; mime: string; data: string }): Promise<{ location: string }>;
  shareFile(o: { name: string; mime: string; data: string }): Promise<void>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { SpjPrinter?: SpjPrinterPlugin };
}

const cap = (): CapacitorGlobal | undefined => (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

let nativeFlag: boolean | null = null;
/** True inside the Android app. Checked once; the global does not change at runtime. */
export function isNative(): boolean {
  if (nativeFlag === null) {
    try {
      nativeFlag = !!cap()?.isNativePlatform?.();
    } catch {
      nativeFlag = false;
    }
  }
  return nativeFlag;
}

export class NativeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function plugin(): SpjPrinterPlugin {
  const p = cap()?.Plugins?.SpjPrinter;
  if (!p) throw new NativeError('The printer module is missing from this app. Update the app.', 'NO_PLUGIN');
  return p;
}

/** Plugin rejections carry {message, code}; turn them into a NativeError with a plain message. */
async function call<T>(fn: (p: SpjPrinterPlugin) => Promise<T>): Promise<T> {
  try {
    return await fn(plugin());
  } catch (e) {
    if (e instanceof NativeError) throw e;
    const o = (e ?? {}) as { message?: string; code?: string };
    throw new NativeError(o.message || 'The printer did not respond.', o.code || 'FAILED');
  }
}

export const nativePrintHtml = (html: string, jobName: string) => call((p) => p.printHtml({ html, jobName }));
export const nativeBluetoothStatus = () => call((p) => p.bluetoothStatus());
export const nativeListPaired = () => call((p) => p.listPairedPrinters());
export const nativeOpenBluetoothSettings = () => call((p) => p.openBluetoothSettings());

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const nativePrintEscPos = (address: string, bytes: Uint8Array) => call((p) => p.printEscPos({ address, data: toBase64(bytes) }));

/** Saves a file (base64 data) into the phone's Downloads (PDF) or Pictures (image). */
export const nativeSaveFile = (o: { name: string; mime: string; data: string }): Promise<{ location: string }> => call((p) => p.saveFile(o));

/** Opens the phone's share sheet with a file (base64 data) attached. */
export const nativeShareFile = (o: { name: string; mime: string; data: string }): Promise<void> => call((p) => p.shareFile(o));
