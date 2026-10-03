// Byte transports for ESC/POS printers.
//
//  - Serial (COMx): Bluetooth SPP printers paired in Windows get a virtual COM port. Node can
//    open \\.\COMx directly with fs, so no native serial module is needed. Opening the port
//    is what makes Windows bring up the Bluetooth link, so a printer that is off or out of
//    range fails here (after Windows' own timeout) rather than silently.
//  - RAW spooler job: for receipt printers installed with a Windows driver. The bytes go to
//    winspool.drv WritePrinter with datatype RAW, so the driver passes them through untouched.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPowerShell } from './powershell';
import { PrintError } from './types';

function setSerialParams(com: string, baud: number): Promise<void> {
  // For USB-serial adapters the baud rate matters; Bluetooth virtual ports ignore it.
  return new Promise((resolve) => {
    const child = spawn('mode.com', [com, `BAUD=${baud}`, 'PARITY=n', 'DATA=8', 'STOP=1'], { windowsHide: true });
    const t = setTimeout(() => {
      child.kill();
      resolve();
    }, 5000);
    child.on('error', () => resolve());
    child.on('close', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function serialError(com: string, err: NodeJS.ErrnoException): PrintError {
  const msg = `${err.code ?? ''} ${err.message}`;
  if (err.code === 'ENOENT') return new PrintError('PORT_NOT_FOUND', `${com} does not exist. The printer may have been removed from Windows Bluetooth settings.`, msg);
  if (err.code === 'EBUSY' || err.code === 'EACCES' || err.code === 'EPERM')
    return new PrintError('PORT_BUSY', `${com} is in use by another program, or Windows refused access to it. Close other printing apps and retry.`, msg);
  return new PrintError('BLUETOOTH_UNREACHABLE', 'Could not connect to the Bluetooth printer. Check that it is switched on, has paper, and is near this computer.', msg);
}

export async function sendToSerial(com: string, data: Uint8Array, baud: number, openTimeoutMs = 15000): Promise<void> {
  if (process.platform !== 'win32') throw new PrintError('NOT_SUPPORTED', 'Direct Bluetooth serial printing is only available on Windows.');
  if (!/^COM\d+$/i.test(com)) throw new PrintError('PORT_NOT_FOUND', `"${com}" is not a COM port.`);
  await setSerialParams(com, baud);

  const device = `\\\\.\\${com.toUpperCase()}`;
  let timedOut = false;
  const opening = fs.promises.open(device, 'r+');
  const fh = await Promise.race([
    opening,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new PrintError('BLUETOOTH_UNREACHABLE', 'The Bluetooth printer did not answer. Check that it is switched on and in range, then retry.', `Opening ${com} took longer than ${openTimeoutMs / 1000}s.`));
      }, openTimeoutMs),
    ),
  ]).catch((err) => {
    if (timedOut) opening.then((h) => h.close()).catch(() => undefined);
    throw err instanceof PrintError ? err : serialError(com, err as NodeJS.ErrnoException);
  });

  try {
    // Small chunks: cheap Bluetooth printers have tiny receive buffers.
    for (let i = 0; i < data.length; i += 1024) {
      await fh.write(data.subarray(i, i + 1024));
    }
    await fh.sync().catch(() => undefined);
  } catch (err) {
    throw serialError(com, err as NodeJS.ErrnoException);
  } finally {
    await fh.close().catch(() => undefined);
  }
}

/** Opens and closes the port to prove the Bluetooth link comes up. */
export async function probeSerial(com: string, openTimeoutMs = 15000): Promise<void> {
  await sendToSerial(com, new Uint8Array([0x1b, 0x40]), 9600, openTimeoutMs);
}

const RAW_PS = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class SpjRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int written);
  public static int Send(string printer, byte[] data, string doc) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var di = new DOCINFO { pDocName = doc, pDataType = "RAW" };
      int job = StartDocPrinter(h, 1, di);
      if (job == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(h)) throw new Win32Exception(Marshal.GetLastWin32Error());
        int written;
        if (!WritePrinter(h, data, data.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
        if (written != data.Length) throw new Exception("Only " + written + " of " + data.Length + " bytes were accepted.");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
      return job;
    } finally { ClosePrinter(h); }
  }
}
"@
try {
  $bytes = [System.IO.File]::ReadAllBytes($env:SPJ_RAW_FILE)
  $job = [SpjRawPrinter]::Send($env:SPJ_PRINTER, $bytes, $env:SPJ_DOC)
  Write-Output ("OK " + $job)
} catch {
  Write-Output ("ERR " + $_.Exception.Message)
}
`;

/** Returns the Windows job id. */
export async function sendRawToSpooler(printer: string, data: Uint8Array, docName: string): Promise<number> {
  if (process.platform !== 'win32') throw new PrintError('NOT_SUPPORTED', 'RAW printing through the Windows spooler is only available on Windows.');
  const file = path.join(os.tmpdir(), `spj-raw-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(file, data);
  try {
    const res = await runPowerShell(RAW_PS, { SPJ_RAW_FILE: file, SPJ_PRINTER: printer, SPJ_DOC: docName }, 30000);
    const line = res.stdout.trim().split(/\r?\n/).pop() ?? '';
    if (line.startsWith('OK ')) return Number(line.slice(3));
    const detail = line.startsWith('ERR ') ? line.slice(4) : res.stderr.trim() || 'No output from the print system.';
    if (/invalid printer name|1801/i.test(detail)) throw new PrintError('PRINTER_NOT_FOUND', `Printer "${printer}" is not installed on this computer.`, detail);
    throw new PrintError('SPOOLER_REJECTED', 'Windows did not accept the receipt print job.', detail);
  } finally {
    fs.rm(file, { force: true }, () => undefined);
  }
}
