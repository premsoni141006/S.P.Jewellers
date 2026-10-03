import { useCallback, useEffect, useState } from 'react';
import { Badge, Icon } from '../components/ui';
import { api, errorText, type PrintOutcome, type PrinterConfig, type PrinterInfo } from '../lib/api';

const CONNECTION_LABEL: Record<PrinterInfo['connection'], string> = {
  bluetooth: 'Bluetooth',
  usb: 'USB',
  network: 'Network',
  virtual: 'Software (no paper)',
  local: 'Local port',
  unknown: 'Unknown',
};

const stateTone = (s: PrinterInfo['state']) => (s === 'ready' || s === 'busy' ? 'ok' : s === 'paired' ? 'gold' : s === 'offline' || s === 'error' ? 'err' : 'plain');

export function PrinterPage(props: {
  config: PrinterConfig;
  onConfig: (c: PrinterConfig) => void;
  busy: boolean;
  platform: string;
  onTestPrint: () => void;
  onTestEstimate: () => void;
}) {
  const { config } = props;
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [check, setCheck] = useState<PrintOutcome | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCheck(null);
    try {
      const r = await api.printers.list();
      setPrinters(r.printers);
      setWarning(r.warning);
    } catch (e) {
      setWarning(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = printers?.find((p) => p.id === config.printerId) ?? null;
  const missing = !!config.printerId && !!printers && !selected;

  const choose = (p: PrinterInfo) =>
    props.onConfig({
      ...config,
      printerId: p.id,
      printerLabel: p.displayName,
      kind: p.source === 'serial' ? 'escpos' : p.suggestedKind,
    });

  const bluetooth = printers?.filter((p) => p.connection === 'bluetooth') ?? [];

  return (
    <div className="page">
      <div className="toolbar">
        <h1 className="page-title">Printer Settings</h1>
        <div className="toolbar-group">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>
            <Icon name="refresh" /> {loading ? 'Looking for printers…' : 'Refresh Printers'}
          </button>
        </div>
      </div>

      <section className="card selected-printer">
        <div>
          <div className="label">Selected printer</div>
          <div className="sp-name">{config.printerLabel || 'None selected'}</div>
          <div className="sp-meta">
            {selected && (
              <>
                <span>
                  Status: <Badge tone={stateTone(selected.state)}>{selected.stateText}</Badge>
                </span>
                <span>
                  Type: <strong>{CONNECTION_LABEL[selected.connection]}</strong>
                </span>
                <span>
                  Prints as: <strong>{config.kind === 'document' ? 'A4 estimate' : `Receipt (ESC/POS, ${config.paperMm} mm)`}</strong>
                </span>
              </>
            )}
            {missing && <Badge tone="err">Not found on this computer — choose another printer or reconnect it</Badge>}
          </div>
          {check && <div className={`banner ${check.ok ? 'banner-ok' : 'banner-err'}`}>{check.message}{check.detail ? ` (${check.detail})` : ''}</div>}
        </div>
        <div className="sp-actions">
          <button className="btn btn-primary" disabled={!config.printerId || props.busy} onClick={props.onTestPrint}>
            <Icon name="print" /> Test Print
          </button>
          <button className="btn" disabled={!config.printerId || props.busy} onClick={props.onTestEstimate}>
            Print Test Estimate
          </button>
          <button
            className="btn"
            disabled={!config.printerId || checking}
            onClick={async () => {
              if (!config.printerId) return;
              setChecking(true);
              setCheck(null);
              try {
                setCheck(await api.printers.check(config.printerId));
              } catch (e) {
                setCheck({ ok: false, message: errorText(e) });
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? 'Checking…' : 'Check connection'}
          </button>
        </div>
      </section>

      {warning && <div className="banner banner-warn">{warning}</div>}

      <section className="card">
        <h3>Available printers</h3>
        {printers === null ? (
          <div className="muted pad">Looking for printers…</div>
        ) : printers.length === 0 ? (
          <div className="muted pad">No printers found. Install or pair a printer in Windows, then press Refresh Printers.</div>
        ) : (
          <table className="list printers">
            <thead>
              <tr>
                <th />
                <th className="l">Printer</th>
                <th className="l">Connection</th>
                <th className="l">Status</th>
                <th className="l">Detected as</th>
              </tr>
            </thead>
            <tbody>
              {printers.map((p) => (
                <tr key={p.id} className={p.id === config.printerId ? 'current' : ''} onClick={() => choose(p)}>
                  <td>
                    <input type="radio" name="printer" checked={p.id === config.printerId} onChange={() => choose(p)} aria-label={`Use ${p.displayName}`} />
                  </td>
                  <td className="l">
                    <div className="strong">
                      {p.displayName} {p.isDefault && <Badge>Windows default</Badge>}
                    </div>
                    <div className="muted small">
                      {p.driverName}
                      {p.portName ? ` · ${p.portName}` : ''}
                    </div>
                  </td>
                  <td className="l">
                    {p.connection === 'bluetooth' ? (
                      <Badge tone="gold">
                        <Icon name="bt" size={12} /> Bluetooth
                      </Badge>
                    ) : (
                      CONNECTION_LABEL[p.connection]
                    )}
                  </td>
                  <td className="l">
                    <Badge tone={stateTone(p.state)}>{p.stateText}</Badge>
                  </td>
                  <td className="l small">
                    <div>{p.suggestedKind === 'escpos' ? 'Receipt printer (ESC/POS)' : 'Normal printer (A4)'}</div>
                    <div className="muted">{p.detectedBy}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {printers && bluetooth.length === 0 && props.platform === 'win32' && <p className="muted small pad">No Bluetooth printer found. If you have one, pair it in Windows first (see below).</p>}
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Print format</h3>
          <div className="radio-list">
            <label className={selected?.source === 'serial' ? 'disabled' : ''}>
              <input type="radio" disabled={selected?.source === 'serial'} checked={config.kind === 'document'} onChange={() => props.onConfig({ ...config, kind: 'document' })} />
              <div>
                <strong>A4 estimate — normal printer</strong>
                <div className="muted small">Sent through the Windows print system. Works for Bluetooth, USB and network printers that have a Windows driver.</div>
              </div>
            </label>
            <label>
              <input type="radio" checked={config.kind === 'escpos'} onChange={() => props.onConfig({ ...config, kind: 'escpos' })} />
              <div>
                <strong>Receipt — thermal printer (ESC/POS)</strong>
                <div className="muted small">Only for printers that understand ESC/POS commands. Same header and the same ten columns, sized for receipt paper.</div>
              </div>
            </label>
          </div>
          {config.kind === 'escpos' && (
            <div className="form-grid">
              <label className="field">
                <span>Paper width</span>
                <select value={config.paperMm} onChange={(e) => props.onConfig({ ...config, paperMm: Number(e.target.value) === 58 ? 58 : 80 })}>
                  <option value={80}>80 mm (3 inch)</option>
                  <option value={58}>58 mm (2 inch)</option>
                </select>
              </label>
              <label className="field">
                <span>Receipt style</span>
                <select value={config.escposMode} onChange={(e) => props.onConfig({ ...config, escposMode: e.target.value === 'text' ? 'text' : 'raster' })}>
                  <option value="raster">Image (same look as A4)</option>
                  <option value="text">Plain text (for printers without image support)</option>
                </select>
              </label>
              {selected?.source === 'serial' && (
                <label className="field">
                  <span>Baud rate (USB-serial only)</span>
                  <select value={config.baudRate} onChange={(e) => props.onConfig({ ...config, baudRate: Number(e.target.value) })}>
                    {[9600, 19200, 38400, 57600, 115200].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="form-grid">
            <label className="field">
              <span>Copies</span>
              <select value={config.copies} onChange={(e) => props.onConfig({ ...config, copies: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="card help">
          <h3>Connecting a Bluetooth printer</h3>
          <p className="strong">Pair the printer from Windows Bluetooth settings first, then select it here.</p>
          <ol>
            <li>Switch the printer on and put it in pairing mode (see its manual).</li>
            <li>
              Windows: <em>Settings → Bluetooth &amp; devices → Add device → Bluetooth</em>. Choose the printer; enter its PIN if asked (often 0000 or 1234).
            </li>
            <li>
              <strong>Normal (A4) printer:</strong> Windows installs it under <em>Printers &amp; scanners</em>. Press <em>Refresh Printers</em> and pick it — it shows as Bluetooth.
            </li>
            <li>
              <strong>Thermal receipt printer:</strong> it appears as “Bluetooth device (COMx)”. Pick it, keep the format on <em>Receipt</em>, and press <em>Test Print</em>.
            </li>
          </ol>
          <div className="toolbar-group">
            <button className="btn btn-small" onClick={() => void api.app.openBluetoothSettings()}>
              <Icon name="bt" /> Open Bluetooth settings
            </button>
            {props.platform === 'win32' && (
              <button className="btn btn-small" onClick={() => void api.app.openPrintersSettings()}>
                Open Printers &amp; scanners
              </button>
            )}
          </div>
          <p className="muted small">The app never pairs devices itself — Windows does that. Your selected printer is remembered for every future print.</p>
        </section>
      </div>
    </div>
  );
}
