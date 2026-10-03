// Printer abstraction shared by discovery, the drivers and the UI.

/** How the printer is attached, as far as Windows can tell. */
export type ConnectionType = 'bluetooth' | 'usb' | 'network' | 'virtual' | 'local' | 'unknown';

/**
 * What the printer understands.
 *  - document: a normal Windows printer driver — we send the A4 estimate through the spooler.
 *  - escpos:   a receipt/thermal printer — we send ESC/POS bytes ourselves.
 */
export type PrinterKind = 'document' | 'escpos';

/**
 * Where the bytes go.
 *  - windows: an installed Windows printer (any connection: Bluetooth, USB, network).
 *  - serial:  a Bluetooth serial port (COMx) paired in Windows, for ESC/POS printers that
 *             have no Windows driver installed.
 */
export type PrinterSource = 'windows' | 'serial';

export type PrinterState = 'ready' | 'busy' | 'offline' | 'error' | 'paired' | 'unknown';

export interface PrinterInfo {
  /** Stable key: "win:<printer name>" or "com:COM5". */
  id: string;
  source: PrinterSource;
  /** Windows printer name, or the COM port for serial printers. */
  name: string;
  displayName: string;
  connection: ConnectionType;
  state: PrinterState;
  stateText: string;
  isDefault: boolean;
  driverName: string;
  portName: string;
  /** Best guess from the driver/port; the owner can override it in Printer Settings. */
  suggestedKind: PrinterKind;
  /** Why we think it is what we say it is — shown in the UI. */
  detectedBy: string;
}

export interface PrinterConfig {
  printerId: string | null;
  /** Remembered so a missing printer can still be named in error messages. */
  printerLabel: string;
  kind: PrinterKind;
  paperMm: 58 | 80;
  /** raster = the estimate rendered as an image (same layout); text = plain ESC/POS text. */
  escposMode: 'raster' | 'text';
  copies: number;
  baudRate: number;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  printerId: null,
  printerLabel: '',
  kind: 'document',
  paperMm: 80,
  escposMode: 'raster',
  copies: 1,
  baudRate: 9600,
};

export type PrintErrorCode =
  | 'NO_PRINTER_SELECTED'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_OFFLINE'
  | 'PRINTER_ERROR'
  | 'PORT_NOT_FOUND'
  | 'PORT_BUSY'
  | 'BLUETOOTH_UNREACHABLE'
  | 'SPOOLER_REJECTED'
  | 'JOB_FAILED'
  | 'NOT_SUPPORTED'
  | 'VALIDATION'
  | 'UNKNOWN';

export interface PrintOutcome {
  ok: boolean;
  /** One plain sentence for the shop owner. */
  message: string;
  code?: PrintErrorCode;
  /** The underlying system detail, shown smaller under the message. */
  detail?: string;
  /** True when the failure came from a pre-check and the owner may send the job anyway. */
  canForce?: boolean;
  printer?: string;
}

export class PrintError extends Error {
  constructor(
    readonly code: PrintErrorCode,
    message: string,
    readonly detail?: string,
    readonly canForce = false,
  ) {
    super(message);
  }
}
