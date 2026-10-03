// Windows print-queue checks: before a job (is the printer there and online?) and after it
// (did Windows actually get it out, or is it stuck with an error?).

import { parseJsonList, runPowerShell } from './powershell';
import { winPrinterState, type RawWinPrinter } from './discovery';
import { PrintError } from './types';

const STATUS_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
@(Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $env:SPJ_PRINTER } |
  Select-Object Name, PortName, DriverName, WorkOffline, PrinterStatus, DetectedErrorState, PNPDeviceID, Network, Default) | ConvertTo-Json -Compress
`;

/** Throws if the printer is missing, or (unless forced) offline / in an error state. */
export async function precheckWindowsPrinter(name: string): Promise<void> {
  if (process.platform !== 'win32') return;
  let found: RawWinPrinter[];
  try {
    found = parseJsonList<RawWinPrinter>((await runPowerShell(STATUS_PS, { SPJ_PRINTER: name }, 15000)).stdout);
  } catch {
    return; // Could not ask Windows; let the spooler decide.
  }
  if (found.length === 0) throw new PrintError('PRINTER_NOT_FOUND', `Printer "${name}" is no longer installed on this computer. Choose a printer in Printer Settings.`);
  const st = winPrinterState(found[0]);
  if (st.state === 'offline')
    throw new PrintError('PRINTER_OFFLINE', `"${name}" is offline. If it is a Bluetooth printer, switch it on and make sure it is connected in Windows Bluetooth settings.`, `Windows status: ${st.text}`, true);
  if (st.state === 'error') throw new PrintError('PRINTER_ERROR', `"${name}" reports a problem: ${st.text}.`, `Windows status: ${st.text}`, true);
}

const WATCH_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds([int]$env:SPJ_WAIT)
$s = ''
do {
  $all = @(Get-PrintJob -PrinterName $env:SPJ_PRINTER)
  if ($env:SPJ_JOBID) { $j = $all | Where-Object { $_.Id -eq [int]$env:SPJ_JOBID } | Select-Object -First 1 }
  else { $j = $all | Where-Object { $_.DocumentName -eq $env:SPJ_DOC } | Select-Object -First 1 }
  if (-not $j) { Write-Output 'DONE'; exit }
  $s = [string]$j.JobStatus
  if ($s -match 'Error|Offline|PaperOut|UserIntervention|Blocked') {
    # Remove the stuck job so a retry does not print twice when the printer comes back.
    Remove-PrintJob -InputObject $j
    Write-Output ('FAIL ' + $s)
    exit
  }
  Start-Sleep -Milliseconds 700
} while ((Get-Date) -lt $deadline)
Write-Output ('PENDING ' + $s)
`;

export type JobWatch = { state: 'done' } | { state: 'pending'; status: string } | { state: 'unknown' };

/**
 * Follows a spooled job for up to `waitSec`. Throws when Windows marks it as failed
 * (the job is removed from the queue so a retry does not produce a duplicate).
 */
export async function watchWindowsJob(printer: string, match: { docName?: string; jobId?: number }, waitSec = 12): Promise<JobWatch> {
  if (process.platform !== 'win32') return { state: 'unknown' };
  let out: string;
  try {
    const res = await runPowerShell(
      WATCH_PS,
      { SPJ_PRINTER: printer, SPJ_DOC: match.docName ?? '', SPJ_JOBID: match.jobId ? String(match.jobId) : '', SPJ_WAIT: String(waitSec) },
      (waitSec + 15) * 1000,
    );
    out = res.stdout.trim().split(/\r?\n/).pop() ?? '';
  } catch {
    return { state: 'unknown' };
  }
  if (out === 'DONE') return { state: 'done' };
  if (out.startsWith('FAIL ')) {
    const status = out.slice(5);
    const offline = /offline/i.test(status);
    throw new PrintError(
      offline ? 'PRINTER_OFFLINE' : 'JOB_FAILED',
      offline
        ? `"${printer}" went offline while printing. If it is a Bluetooth printer, check that it is on and connected, then retry.`
        : /paperout/i.test(status)
          ? `"${printer}" is out of paper. Load paper and retry.`
          : `"${printer}" could not print the job.`,
      `Windows job status: ${status}. The stuck job was removed from the queue.`,
    );
  }
  if (out.startsWith('PENDING')) return { state: 'pending', status: out.slice(8) };
  return { state: 'unknown' };
}
