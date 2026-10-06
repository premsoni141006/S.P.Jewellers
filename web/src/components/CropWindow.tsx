import { useEffect, useRef, useState } from 'react';
import { useBackLayer } from '../lib/backStack';

const ASPECTS = [
  { id: 'sq', label: 'Square', r: 1 },
  { id: '43', label: '4:3', r: 4 / 3 },
  { id: '32', label: '3:2', r: 3 / 2 },
] as const;
const FRAME_W = 300; // the crop frame is this wide on screen; its height follows the chosen shape
const MAX_ZOOM = 4;
const OUT_MAX = 800; // the saved picture is at most this many px on its long side

/**
 * A photo was just taken or chosen: set how it will look before it is saved. Pick a shape, drag the picture
 * under the frame, pinch / use the slider to zoom, then "Use photo" saves exactly what is inside the frame.
 */
export function CropWindow({ file, onDone, onCancel }: { file: Blob; onDone: (b: Blob) => void; onCancel: () => void }) {
  useBackLayer(true, onCancel);
  // The picture's address is made in an effect (and revoked in its cleanup). Making it while rendering broke it when React ran the effect twice in development.
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null); // natural size of the picture
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>(ASPECTS[1]);
  const [zoom, setZoom] = useState(1); // 1 = just covers the frame
  const [pos, setPos] = useState({ x: 0, y: 0 }); // picture centre relative to the frame centre
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);

  const fw = FRAME_W;
  const fh = Math.round(FRAME_W / aspect.r);
  const cover = size ? Math.max(fw / size.w, fh / size.h) : 1;
  const scale = cover * zoom;
  const dw = size ? size.w * scale : fw;
  const dh = size ? size.h * scale : fh;
  const clamp = (p: { x: number; y: number }, w = dw, h = dh) => ({
    x: Math.max(-(w - fw) / 2, Math.min((w - fw) / 2, p.x)),
    y: Math.max(-(h - fh) / 2, Math.min((h - fh) / 2, p.y)),
  });
  // A new shape or zoom keeps the picture covering the frame.
  useEffect(() => { setPos((p) => clamp(p)); }, [aspect, zoom, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setBusy(true);
    if (pts.current.size === 2) pinch.current = { d0: Math.max(1, dist()), z0: zoom };
  };
  const move = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) setZoom(Math.max(1, Math.min(MAX_ZOOM, pinch.current.z0 * (dist() / pinch.current.d0))));
    else if (pts.current.size === 1) setPos((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
  };
  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) setBusy(false);
  };

  const save = async () => {
    if (!size) return;
    setError('');
    try {
      const bmp = await createImageBitmap(file);
      const left = fw / 2 + pos.x - dw / 2;
      const top = fh / 2 + pos.y - dh / 2;
      const sx = Math.max(0, -left / scale), sy = Math.max(0, -top / scale);
      const sw = Math.min(size.w - sx, fw / scale), sh = Math.min(size.h - sy, fh / scale);
      const k = Math.min(1, OUT_MAX / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * k));
      canvas.height = Math.max(1, Math.round(sh * k));
      const g = canvas.getContext('2d');
      if (!g) throw new Error('This browser cannot prepare the picture.');
      g.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.78));
      if (!blob) throw new Error('Could not prepare the picture.');
      onDone(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that picture.');
    }
  };

  return (
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="Crop photo" data-testid="crop-window">
      <div className="crop-card">
        <h2>Set the photo</h2>
        <p className="muted small">Drag the picture and zoom so the part you want is inside the frame.</p>
        <div className="crop-aspects" role="group" aria-label="Shape">
          {ASPECTS.map((a) => (
            <button key={a.id} type="button" className={aspect.id === a.id ? 'on' : ''} onClick={() => setAspect(a)} data-testid={`crop-aspect-${a.id}`}>{a.label}</button>
          ))}
        </div>
        <div
          className="crop-frame"
          style={{ width: fw, height: fh }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => setZoom((z) => Math.max(1, Math.min(MAX_ZOOM, z * (e.deltaY < 0 ? 1.08 : 0.93))))}
          data-testid="crop-frame"
        >
          {url && <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ width: dw, height: dh, left: fw / 2 + pos.x - dw / 2, top: fh / 2 + pos.y - dh / 2, transition: busy ? 'none' : 'left 0.12s, top 0.12s, width 0.12s, height 0.12s' }}
            data-testid="crop-img"
          />}
        </div>
        <label className="crop-zoom">
          <span>Zoom</span>
          <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} data-testid="crop-zoom" />
        </label>
        {error && <p className="err small" role="alert" data-testid="crop-error">{error}</p>}
        <div className="crop-actions">
          <button type="button" className="btn btn-plain" onClick={onCancel} data-testid="crop-cancel">Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!size} data-testid="crop-done">Use photo</button>
        </div>
      </div>
    </div>
  );
}
