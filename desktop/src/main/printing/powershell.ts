// Runs Windows PowerShell scripts for things Electron does not expose: printer ports and
// drivers, Bluetooth serial ports, print-queue job status, and RAW spooler jobs.
// Scripts are passed with -EncodedCommand and data through environment variables, so no
// user text is ever spliced into a command line.

import { spawn } from 'node:child_process';

export interface PsResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function runPowerShell(script: string, env: Record<string, string> = {}, timeoutMs = 20000): Promise<PsResult> {
  if (process.platform !== 'win32') return Promise.reject(new Error('PowerShell is only available on Windows'));
  // Force UTF-8 output so printer names with non-ASCII characters survive.
  const full = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$ProgressPreference = 'SilentlyContinue'\n${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, ...env }, windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`PowerShell timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/** Parses ConvertTo-Json output, which is an object for one result and an array for many. */
export function parseJsonList<T>(text: string): T[] {
  const t = text.trim();
  if (!t) return [];
  const v = JSON.parse(t) as T | T[];
  return Array.isArray(v) ? v : [v];
}
