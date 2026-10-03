// Finds printers and works out what each one is.
//
// Windows owns Bluetooth pairing. Once a printer is paired it shows up in one of two ways:
//  1. As an installed Windows printer (it has a driver). Its port tells us how it is
//     attached: a COM port that belongs to a Bluetooth device, a USB port, an IP/WSD port...
//  2. As a "Standard Serial over Bluetooth link (COMx)" port only — typical for cheap
//     ESC/POS thermal printers that ship without a Windows driver. Those we list as serial
//     printers and talk to directly with ESC/POS.

import type { WebContents } from 'electron';
import { parseJsonList, runPowerShell } from './powershell';
import type { ConnectionType, PrinterInfo, PrinterKind, PrinterState } from './types';

export interface RawWinPrinter {
  Name: string;
  PortName: string | null;
  DriverName: string | null;
  WorkOffline: boolean | null;
  PrinterStatus: number | null;
  DetectedErrorState: number | null;
  PNPDeviceID: string | null;
  Network: boolean | null;
  Default: boolean | null;
}

export interface RawBtPort {
  FriendlyName: string;
  InstanceId: string;
  Status: string | null;
  Present: boolean | null;
  DeviceName: string | null;
}

const DISCOVERY_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$printers = @(Get-CimInstance -ClassName Win32_Printer | Select-Object Name, PortName, DriverName, WorkOffline, PrinterStatus, DetectedErrorState, PNPDeviceID, Network, Default)
$btDevices = @(Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName, InstanceId)
$ports = @(Get-PnpDevice -Class Ports | Where-Object { $_.InstanceId -like 'BTHENUM*' } | ForEach-Object {
  $mac = $null
  if ($_.InstanceId -match '&([0-9A-F]{12})_') { $mac = $Matches[1] }
  $dev = $null
  if ($mac -and $mac -ne '000000000000') { $dev = $btDevices | Where-Object { $_.InstanceId -like ('*' + $mac + '*') } | Select-Object -First 1 }
  [pscustomobject]@{
    FriendlyName = $_.FriendlyName
    InstanceId   = $_.InstanceId
    Status       = [string]$_.Status
    Present      = [bool]$_.Present
    DeviceName   = if ($dev) { $dev.FriendlyName } else { $null }
  }
})
[pscustomobject]@{ printers = $printers; ports = $ports } | ConvertTo-Json -Depth 4 -Compress
`;

const VIRTUAL = /microsoft print to pdf|microsoft xps|onenote|fax|send to|adobe pdf|pdf24|cutepdf/i;
const ESC_POS_HINT = /\bpos\b|pos-?\d|thermal|receipt|generic \/ text only|\b(58|80)\s?mm\b|xp-?\d|tm-?[tm]\d|rp-?\d|mpt|zj-?\d|gprinter|rongta|epson tm|bixolon|sunmi|goojprt|bluetooth printer/i;

export function comOf(text: string | null | undefined): string | null {
  const m = /\b(COM\d+)\b/i.exec(text ?? '');
  return m ? m[1].toUpperCase() : null;
}

/** Outgoing Bluetooth serial ports carry the remote device address; incoming ones are all zeros. */
export function isOutgoingBtPort(p: RawBtPort): boolean {
  const m = /&([0-9A-F]{12})_/i.exec(p.InstanceId);
  return !!m && m[1] !== '000000000000';
}

export function winPrinterState(p: RawWinPrinter): { state: PrinterState; text: string } {
  const err: Record<number, string> = {
    3: 'Low paper',
    4: 'Out of paper',
    6: 'Out of toner/ink',
    7: 'Door open',
    8: 'Paper jam',
    9: 'Offline',
    10: 'Needs service',
    11: 'Output tray full',
  };
  if (p.WorkOffline) return { state: 'offline', text: 'Offline (Windows has it set to "Use printer offline")' };
  if (p.PrinterStatus === 7) return { state: 'offline', text: 'Offline' };
  const e = p.DetectedErrorState ?? 0;
  if (e === 9) return { state: 'offline', text: 'Offline' };
  if (e === 3) return { state: 'ready', text: 'Ready (low paper)' };
  if (err[e]) return { state: 'error', text: err[e] };
  if (p.PrinterStatus === 4) return { state: 'busy', text: 'Printing' };
  if (p.PrinterStatus === 6) return { state: 'error', text: 'Stopped' };
  if (p.PrinterStatus === 3 || p.PrinterStatus === 5) return { state: 'ready', text: 'Ready' };
  return { state: 'unknown', text: 'Status not reported' };
}

export function classifyWinPrinter(p: RawWinPrinter, btPorts: RawBtPort[]): PrinterInfo {
  const port = (p.PortName ?? '').trim();
  const pnp = (p.PNPDeviceID ?? '').toUpperCase();
  const com = comOf(port);
  const btPort = com ? btPorts.find((b) => comOf(b.FriendlyName) === com) : undefined;

  let connection: ConnectionType = 'unknown';
  let detectedBy = '';
  if (btPort) {
    connection = 'bluetooth';
    detectedBy = `Port ${com} is a Bluetooth serial link${btPort.DeviceName ? ` to "${btPort.DeviceName}"` : ''}.`;
  } else if (pnp.startsWith('BTHENUM') || /^BTH/i.test(port) || /bluetooth/i.test(`${port} ${p.DriverName}`)) {
    connection = 'bluetooth';
    detectedBy = 'Windows lists it as a Bluetooth device.';
  } else if (/^USB/i.test(port) || pnp.startsWith('USBPRINT') || pnp.startsWith('USB')) {
    connection = 'usb';
    detectedBy = `USB port ${port}.`;
  } else if (VIRTUAL.test(p.Name) || /^(PORTPROMPT:|FILE:|nul:?|XPSPort:|SHRFAX:)/i.test(port)) {
    connection = 'virtual';
    detectedBy = 'Software printer (does not print on paper).';
  } else if (p.Network || /^(WSD-|IP_|\\\\|https?:)|^\d+\.\d+\.\d+\.\d+/i.test(port)) {
    connection = 'network';
    detectedBy = `Network port ${port}.`;
  } else if (com || /^LPT/i.test(port)) {
    connection = 'local';
    detectedBy = `Local port ${port}.`;
  } else {
    detectedBy = port ? `Port ${port}.` : 'Port not reported.';
  }

  const kind: PrinterKind = ESC_POS_HINT.test(`${p.Name} ${p.DriverName ?? ''}`) ? 'escpos' : 'document';
  if (kind === 'escpos') detectedBy += ' Driver/name looks like a receipt (ESC/POS) printer.';

  const st = winPrinterState(p);
  return {
    id: `win:${p.Name}`,
    source: 'windows',
    name: p.Name,
    displayName: p.Name,
    connection,
    state: st.state,
    stateText: st.text,
    isDefault: !!p.Default,
    driverName: p.DriverName ?? '',
    portName: port,
    suggestedKind: kind,
    detectedBy: detectedBy.trim(),
  };
}

export function classifyBtPort(p: RawBtPort): PrinterInfo | null {
  const com = comOf(p.FriendlyName);
  if (!com || !isOutgoingBtPort(p)) return null;
  const present = p.Present !== false && (p.Status ?? 'OK').toUpperCase() !== 'ERROR';
  return {
    id: `com:${com}`,
    source: 'serial',
    name: com,
    displayName: `${p.DeviceName ?? 'Bluetooth device'} (${com})`,
    connection: 'bluetooth',
    // Windows only knows the pairing; the link itself is opened when we print.
    state: present ? 'paired' : 'offline',
    stateText: present ? 'Paired — connects when printing' : 'Paired but not available (turned off or out of range?)',
    isDefault: false,
    driverName: 'No Windows driver — direct ESC/POS',
    portName: com,
    suggestedKind: 'escpos',
    detectedBy: `Bluetooth serial port${p.DeviceName ? ` for "${p.DeviceName}"` : ''}.`,
  };
}

/** Printers Electron/Chromium can print to (all platforms). */
async function electronPrinters(wc: WebContents): Promise<PrinterInfo[]> {
  const list = await wc.getPrintersAsync();
  return list.map((p) => {
    const opts = (p.options ?? {}) as Record<string, string>;
    // CUPS (macOS/Linux) reports printer-state 3 idle, 4 processing, 5 stopped.
    const cups = Number(opts['printer-state']);
    const state: PrinterState = cups === 3 ? 'ready' : cups === 4 ? 'busy' : cups === 5 ? 'offline' : 'unknown';
    const uri = opts['device-uri'] ?? '';
    const connection: ConnectionType = /^usb:/i.test(uri) ? 'usb' : /^bluetooth:/i.test(uri) ? 'bluetooth' : /^(ipp|ipps|dnssd|lpd|socket|http)/i.test(uri) ? 'network' : 'unknown';
    return {
      id: `win:${p.name}`,
      source: 'windows' as const,
      name: p.name,
      displayName: p.displayName || p.name,
      connection,
      state,
      stateText: state === 'ready' ? 'Ready' : state === 'busy' ? 'Printing' : state === 'offline' ? 'Stopped' : 'Status not reported',
      isDefault: (p as unknown as { isDefault?: boolean }).isDefault === true,
      driverName: opts['printer-make-and-model'] ?? p.description ?? '',
      portName: uri,
      suggestedKind: ESC_POS_HINT.test(`${p.name} ${opts['printer-make-and-model'] ?? ''}`) ? ('escpos' as const) : ('document' as const),
      detectedBy: uri ? `Device ${uri}.` : 'Reported by the system print service.',
    };
  });
}

export async function discoverPrinters(wc: WebContents): Promise<{ printers: PrinterInfo[]; warning: string | null }> {
  const base = await electronPrinters(wc);
  if (process.platform !== 'win32') return { printers: base, warning: null };

  try {
    const res = await runPowerShell(DISCOVERY_PS);
    const data = JSON.parse(res.stdout.trim() || '{}') as { printers?: unknown; ports?: unknown };
    const raw = parseJsonList<RawWinPrinter>(JSON.stringify(data.printers ?? []));
    const ports = parseJsonList<RawBtPort>(JSON.stringify(data.ports ?? []));
    const printers = raw.map((p) => classifyWinPrinter(p, ports));
    // Include anything Chromium sees that WMI did not (rare: per-session redirected printers).
    for (const b of base) if (!printers.some((p) => p.name === b.name)) printers.push(b);
    // Bluetooth serial ports not already used by an installed printer.
    const usedComs = new Set(printers.map((p) => comOf(p.portName)).filter(Boolean));
    for (const port of ports) {
      const info = classifyBtPort(port);
      if (info && !usedComs.has(info.name)) printers.push(info);
    }
    return { printers, warning: null };
  } catch (err) {
    return {
      printers: base,
      warning: `Could not read printer details from Windows (${(err as Error).message}). Bluetooth serial printers will not be listed.`,
    };
  }
}
