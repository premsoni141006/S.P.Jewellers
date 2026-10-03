import { useEffect, useState } from 'react';
import { sampleEstimate, type PrintHeader } from '@shared';
import type { SheetSpec } from '../App';
import { bleSupported, choosePrinter, connectPrinter, currentDevice, disconnectPrinter, restorePrinter } from '../lib/bluetooth';
import { isNative, nativeBluetoothStatus, nativeListPaired, nativeOpenBluetoothSettings, type PairedDevice } from '../lib/native';
import { errorText, printEstimate, testPrint, type PrintOutcome, type PrinterConfig } from '../lib/printing';
import type { AppStore } from '../lib/store';

interface Props {
  store: AppStore;
  header: PrintHeader;
  setBusy: (s: string | null) => void;
  setToast: (s: string) => void;
  setSheet: (s: SheetSpec | null) => void;
}

type Link = 'unknown' | 'connected' | 'not_connected';

export function PrinterPage({ store, header, setBusy, setToast, setSheet }: Props) {
  const { printer, setPrinter, settings } = store;
  const native = isNative();
  const [link, setLink] = useState<Link>(currentDevice()?.gatt?.connected ? 'connected' : 'unknown');
  const ble = bleSupported();

  // Android app: paired devices
  const [paired, setPaired] = useState<PairedDevice[] | null>(null);
  const [btNote, setBtNote] = useState<string | null>(null);
  const [loadingPaired, setLoadingPaired] = useState(false);

  useEffect(() => {
    if (!native && printer.mode === 'thermal' && printer.deviceId && !currentDevice()) void restorePrinter(printer.deviceId);
  }, [native, printer.mode, printer.deviceId]);

  const set = (patch: Partial<PrinterConfig>) => setPrinter({ ...printer, ...patch });

  const loadPaired = async () => {
    setLoadingPaired(true);
    setBtNote(null);
    try {
      const st = await nativeBluetoothStatus().catch(() => null);
      if (st && !st.supported) {
        setBtNote('This phone has no Bluetooth.');
        setPaired([]);
        return;
      }
      if (st && !st.enabled) {
        setBtNote('Bluetooth is off. Turn it on, then tap Refresh.');
        setPaired([]);
        return;
      }
      const { devices } = await nativeListPaired();
      setPaired([...devices].sort((a, b) => Number(b.isPrinter) - Number(a.isPrinter) || a.name.localeCompare(b.name)));
      if (devices.length === 0) setBtNote('No paired devices. Pair the printer in Android Bluetooth settings first.');
    } catch (e) {
      setBtNote(errorText(e));
      setPaired([]);
    } finally {
      setLoadingPaired(false);
    }
  };

  useEffect(() => {
    if (native && printer.mode === 'thermal' && paired === null) void loadPaired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, printer.mode]);

  const run = async (label: string, job: () => Promise<PrintOutcome | void>, success: string) => {
    setBusy(label);
    try {
      const res = await job();
      if (printer.mode === 'thermal') setLink('connected');
      setToast(res ? res.message : success);
    } catch (e) {
      if (printer.mode === 'thermal') setLink('not_connected');
      setSheet({
        title: 'Printer problem',
        body: <p data-testid="print-error">{errorText(e)}</p>,
        actions: [
          { label: 'Retry', kind: 'primary', onClick: () => { setSheet(null); void run(label, job, success); } },
          { label: 'Close', onClick: () => setSheet(null) },
        ],
      });
    } finally {
      setBusy(null);
    }
  };

  const choose = async () => {
    try {
      const d = await choosePrinter();
      set({ deviceId: d.id, deviceName: d.name || 'Bluetooth printer' });
      await run('Connecting...', connectPrinter, `Connected to ${d.name || 'printer'}.`);
    } catch (e) {
      setToast(errorText(e));
    }
  };

  const statusText = link === 'connected' ? 'Connected' : link === 'not_connected' ? 'Not connected' : 'Connects when you print';
  const openBtSettings = () => void nativeOpenBluetoothSettings().catch((e) => setToast(errorText(e)));

  return (
    <div className="page" data-testid="printer-page">

      <section className="card">
        <div className="section-title">How do you print?</div>
        <label className={`choice${printer.mode === 'system' ? ' on' : ''}`}>
          <input type="radio" name="mode" checked={printer.mode === 'system'} onChange={() => set({ mode: 'system' })} data-testid="mode-system" />
          <span>
            <b>System printer (A4)</b>
            <span className="muted small block">
              {native
                ? "Uses Android's print screen. Printers on Bluetooth, Wi-Fi or USB appear there through Android print services."
                : "Uses this phone's or computer's print dialog. Works with Bluetooth, Wi-Fi and USB printers that are set up on the device."}
            </span>
          </span>
        </label>
        <label className={`choice${printer.mode === 'thermal' ? ' on' : ''}`}>
          <input type="radio" name="mode" checked={printer.mode === 'thermal'} onChange={() => set({ mode: 'thermal' })} data-testid="mode-thermal" />
          <span>
            <b>Bluetooth thermal printer (ESC/POS)</b>
            <span className="muted small block">Prints a receipt-width estimate directly on 58 mm / 80 mm paper.</span>
          </span>
        </label>
      </section>

      {printer.mode === 'system' && (
        <section className="card">
          <div className="section-title">System printer</div>
          <ol className="steps">
            {native ? (
              <>
                <li>Set up the printer on the phone: pair it in Android Bluetooth settings, or connect it to the same Wi-Fi. Install the maker's print service app if Android asks.</li>
                <li>Tap <b>Print</b>. Android's print screen opens with the A4 estimate.</li>
                <li>Pick the printer at the top. Keep paper size <b>A4</b>.</li>
              </>
            ) : (
              <>
                <li>Pair the printer from the phone's Bluetooth settings (or connect it by Wi-Fi/USB) first.</li>
                <li>Tap <b>Print</b>. The print dialog opens with the A4 estimate.</li>
                <li>Choose the printer in the dialog. Set paper to <b>A4</b> and scale to <b>100% / Actual size</b>.</li>
              </>
            )}
          </ol>
          {!native && <p className="muted small">A website cannot pick the printer by itself or print without the dialog. For one-tap printing use the Windows desktop app.</p>}
        </section>
      )}

      {printer.mode === 'thermal' && native && (
        <section className="card" data-testid="native-thermal">
          <div className="section-title">Bluetooth thermal printer</div>
          <div className="notice small">Pair the printer in Android Bluetooth settings first, then select it here.</div>
          <div className="kv gap-top"><span>Printer</span><b>{printer.nativeName ?? 'None selected'}</b></div>
          <div className="kv"><span>Type</span><span>Bluetooth</span></div>
          <div className="device-list" role="radiogroup" aria-label="Paired devices">
            {(paired ?? []).map((d) => (
              <label key={d.address} className={`device${printer.nativeAddress === d.address ? ' on' : ''}`}>
                <input type="radio" name="bt" checked={printer.nativeAddress === d.address} onChange={() => set({ nativeAddress: d.address, nativeName: d.name || d.address })} />
                <span style={{ minWidth: 0 }}>
                  <span className="device-name block">{d.name || 'Unnamed device'}</span>
                  <span className="muted small">{d.isPrinter ? 'Printer' : 'Other device'} · {d.address}</span>
                </span>
              </label>
            ))}
          </div>
          {btNote && <p className="err small">{btNote}</p>}
          <div className="row-actions gap-top">
            <button className="btn btn-outline grow" onClick={() => void loadPaired()} disabled={loadingPaired}>{loadingPaired ? 'Looking…' : 'Refresh'}</button>
            <button className="btn btn-plain grow" onClick={openBtSettings}>Bluetooth settings</button>
          </div>
          <PaperWidth printer={printer} set={set} />
        </section>
      )}

      {printer.mode === 'thermal' && !native && (
        <section className="card">
          <div className="section-title">Bluetooth thermal printer</div>
          {!ble ? (
            <div className="notice" data-testid="ble-unsupported">
              This browser cannot connect to Bluetooth printers. Use <b>Chrome</b> or <b>Edge</b> on Android or a computer. iPhone and iPad browsers do not allow it — use <b>System printer</b> there.
            </div>
          ) : (
            <>
              <div className="kv"><span>Printer</span><b data-testid="ble-name">{printer.deviceName ?? 'None chosen'}</b></div>
              <div className="kv"><span>Status</span><span className={link === 'connected' ? 'ok' : link === 'not_connected' ? 'err' : 'muted'}>{printer.deviceName ? statusText : '—'}</span></div>
              <div className="kv"><span>Type</span><span>Bluetooth (BLE)</span></div>
              <div className="row-actions">
                <button className="btn btn-outline grow" onClick={() => void choose()}>{printer.deviceName ? 'Change printer' : 'Choose printer'}</button>
                {printer.deviceName && (
                  <button className="btn btn-plain" onClick={() => { disconnectPrinter(); setLink('not_connected'); set({ deviceId: null, deviceName: null }); }}>Forget</button>
                )}
              </div>
              <p className="muted small">Switch the printer on and keep it near. If it does not appear in the list, it may only support classic Bluetooth — use System printer or the desktop app.</p>
            </>
          )}
          <PaperWidth printer={printer} set={set} />
        </section>
      )}

      <section className="card">
        <div className="section-title">Check the printer</div>
        <div className="stack">
          <button className="btn btn-primary" data-testid="test-print" onClick={() => void run('Printing test page...', () => testPrint(header, printer), 'Done.')}>Test Print</button>
          <button
            className="btn btn-outline"
            data-testid="test-estimate"
            onClick={() => void run('Printing test estimate...', () => printEstimate(sampleEstimate(settings), header, printer), 'Done.')}
          >
            Print Test Estimate
          </button>
        </div>
        <p className="muted small">Test Print prints the shop name, "Printer Test Successful" and the date and time.</p>
      </section>
    </div>
  );
}

function PaperWidth({ printer, set }: { printer: PrinterConfig; set: (p: Partial<PrinterConfig>) => void }) {
  return (
    <div className="field gap-top">
      <span className="field-label">Paper width</span>
      <div className="seg wide" role="group" aria-label="Paper width">
        {([58, 80] as const).map((w) => (
          <button key={w} className={printer.paperMm === w ? 'on' : ''} onClick={() => set({ paperMm: w })} aria-pressed={printer.paperMm === w}>{w} mm</button>
        ))}
      </div>
    </div>
  );
}
