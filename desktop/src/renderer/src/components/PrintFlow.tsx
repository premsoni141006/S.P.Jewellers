// "Printing..." overlay, success toast and the failure dialog with Retry.

import { useCallback, useRef, useState } from 'react';
import { api, errorText, type PrintOutcome } from '../lib/api';
import { Modal } from './ui';

type Runner = (force: boolean) => Promise<PrintOutcome>;

interface State {
  phase: 'idle' | 'printing' | 'failed';
  label: string;
  outcome: PrintOutcome | null;
}

export function usePrintFlow(opts: { onSuccess: (msg: string) => void; openPrinterSettings: () => void }) {
  const [state, setState] = useState<State>({ phase: 'idle', label: '', outcome: null });
  const runner = useRef<Runner | null>(null);
  const busy = useRef(false);

  const go = useCallback(
    async (force: boolean) => {
      if (!runner.current || busy.current) return;
      busy.current = true;
      setState((s) => ({ ...s, phase: 'printing', outcome: null }));
      let outcome: PrintOutcome;
      try {
        outcome = await runner.current(force);
      } catch (err) {
        outcome = { ok: false, code: 'UNKNOWN', message: 'Printing failed.', detail: errorText(err) };
      }
      busy.current = false;
      if (outcome.ok) {
        setState({ phase: 'idle', label: '', outcome });
        opts.onSuccess(outcome.message);
      } else {
        setState((s) => ({ ...s, phase: 'failed', outcome }));
      }
    },
    [opts],
  );

  const run = useCallback(
    (label: string, fn: Runner) => {
      runner.current = fn;
      setState({ phase: 'printing', label, outcome: null });
      void go(false);
    },
    [go],
  );

  const view =
    state.phase === 'printing' ? (
      <div className="overlay">
        <div className="printing-card" role="status">
          <div className="spinner" />
          <div>
            <div className="printing-title">Printing...</div>
            <div className="muted">{state.label}</div>
          </div>
        </div>
      </div>
    ) : state.phase === 'failed' && state.outcome ? (
      <Modal
        title="Printing failed"
        onClose={() => setState({ phase: 'idle', label: '', outcome: null })}
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setState({ phase: 'idle', label: '', outcome: null });
                opts.openPrinterSettings();
              }}
            >
              Printer Settings
            </button>
            {state.outcome.canForce && (
              <button className="btn" onClick={() => void go(true)}>
                Send anyway
              </button>
            )}
            {state.outcome.code !== 'VALIDATION' && state.outcome.code !== 'NO_PRINTER_SELECTED' && (
              <button className="btn btn-primary" autoFocus onClick={() => void go(false)}>
                Retry
              </button>
            )}
          </>
        }
      >
        <p className="fail-msg">{state.outcome.message}</p>
        {state.outcome.detail && <p className="fail-detail">Reason from the system: {state.outcome.detail}</p>}
        {state.outcome.printer && <p className="muted">Printer: {state.outcome.printer}</p>}
        {(state.outcome.code === 'BLUETOOTH_UNREACHABLE' || state.outcome.code === 'PRINTER_OFFLINE') && (
          <p className="hint">
            Bluetooth printers: switch the printer on, keep it near this computer, and check it shows as paired in{' '}
            <button className="link" onClick={() => void api.app.openBluetoothSettings()}>
              Windows Bluetooth settings
            </button>
            . Then press Retry.
          </p>
        )}
      </Modal>
    ) : null;

  return { run, view, busy: state.phase === 'printing' };
}
