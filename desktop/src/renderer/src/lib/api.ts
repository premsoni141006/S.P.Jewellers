import type { SpjApi } from '../../../preload/api';

declare global {
  interface Window {
    spj: SpjApi;
  }
}

export const api: SpjApi = window.spj;
export type { PrintOutcome, PrinterConfig, PrinterInfo } from '../../../preload/api';

/** IPC errors arrive as "Error invoking remote method 'x': Error: <reason>" — keep the reason. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
