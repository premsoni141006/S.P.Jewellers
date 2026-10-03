// Web Bluetooth (BLE) for ESC/POS thermal printers.
// Supported: Chrome / Edge on Android, Windows, macOS, ChromeOS. Not supported: iOS (any
// browser), Firefox, Safari. Classic-Bluetooth-only printers (SPP) are invisible to Web
// Bluetooth — those print through the system print dialog or the Windows desktop app.

const SERVICES: BluetoothServiceUUID[] = [
  0x18f0,
  0xff00,
  0xfee7,
  0xae30,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const CHUNK = 180;

export const bleSupported = (): boolean => typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!navigator.bluetooth;

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

export function currentDevice(): BluetoothDevice | null {
  return device;
}

export class PrinterError extends Error {}

function explain(e: unknown): PrinterError {
  if (e instanceof PrinterError) return e;
  const name = e instanceof DOMException ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'NotFoundError') return new PrinterError('No printer was chosen.');
  if (name === 'SecurityError') return new PrinterError('Bluetooth was blocked. Open the site over https and allow Bluetooth for it.');
  if (name === 'NetworkError') return new PrinterError('Could not connect to the printer. Make sure it is switched on, in range and not connected to another phone.');
  if (name === 'NotSupportedError') return new PrinterError('This device does not accept printer data over Bluetooth Low Energy.');
  return new PrinterError(msg || 'Bluetooth printing failed.');
}

/** Opens the browser's Bluetooth chooser. Must run from a tap/click. */
export async function choosePrinter(): Promise<BluetoothDevice> {
  if (!bleSupported()) throw new PrinterError('This browser cannot use Bluetooth. Use Chrome on Android or a computer.');
  try {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    characteristic = null;
    return device;
  } catch (e) {
    throw explain(e);
  }
}

/** Finds a previously allowed printer without the chooser (Chrome with getDevices support). */
export async function restorePrinter(id: string): Promise<BluetoothDevice | null> {
  if (!bleSupported() || typeof navigator.bluetooth.getDevices !== 'function') return null;
  try {
    const list = await navigator.bluetooth.getDevices();
    const found = list.find((d) => d.id === id) ?? null;
    if (found) {
      device = found;
      characteristic = null;
    }
    return found;
  } catch {
    return null;
  }
}

async function writable(): Promise<BluetoothRemoteGATTCharacteristic> {
  if (!device) throw new PrinterError('No Bluetooth printer selected. Choose one in the Printer tab.');
  if (!device.gatt) throw new PrinterError('This Bluetooth device has no data connection (GATT).');
  if (characteristic && device.gatt.connected) return characteristic;
  let server: BluetoothRemoteGATTServer;
  try {
    server = await device.gatt.connect();
  } catch (e) {
    throw explain(e);
  }
  let services: BluetoothRemoteGATTService[] = [];
  try {
    services = await server.getPrimaryServices();
  } catch (e) {
    throw explain(e);
  }
  for (const svc of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try {
      chars = await svc.getCharacteristics();
    } catch {
      continue;
    }
    const c = chars.find((x) => x.properties.writeWithoutResponse) ?? chars.find((x) => x.properties.write);
    if (c) {
      characteristic = c;
      return c;
    }
  }
  throw new PrinterError('Connected, but this device has no writable printer channel. It may not be an ESC/POS printer.');
}

export async function connectPrinter(): Promise<void> {
  await writable();
}

export async function sendBytes(bytes: Uint8Array): Promise<void> {
  const c = await writable();
  const fast = c.properties.writeWithoutResponse && typeof c.writeValueWithoutResponse === 'function';
  try {
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      if (fast) {
        await c.writeValueWithoutResponse(part);
        await new Promise((r) => setTimeout(r, 15)); // let small printer buffers drain
      } else if (typeof c.writeValueWithResponse === 'function') {
        await c.writeValueWithResponse(part);
      } else {
        await c.writeValue(part);
      }
    }
  } catch (e) {
    characteristic = null;
    throw explain(e);
  }
}

export function disconnectPrinter(): void {
  try {
    device?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  characteristic = null;
}
