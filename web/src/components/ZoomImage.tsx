import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '../lib/backStack';
import { Icon } from './Icon';

const MAX = 6;

/** Full-screen photo with zoom: pinch, double-tap, mouse wheel, + / - buttons; one finger drags when zoomed in. */
function Viewer({ src, onClose }: { src: string; onClose: () => void }) {
  useBackLayer(true, onClose);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const last = useRef(0);
  const dist = () => { const [a, b] = [...pts.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const zoomTo = (next: number) => { const z = Math.min(MAX, Math.max(1, next)); setZoom(z); if (z === 1) setPan({ x: 0, y: 0 }); };
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) pinch.current = { d0: Math.max(1, dist()), z0: zoom };
    else if (pts.current.size === 1) {
      const now = Date.now();
      if (now - last.current < 300) { zoomTo(zoom > 1.05 ? 1 : 2.5); last.current = 0; } else last.current = now;
    }
  };
  const move = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) zoomTo(pinch.current.z0 * (dist() / pinch.current.d0));
    else if (pts.current.size === 1 && zoom > 1) setPan((p) => ({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
  };
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null; };
  return (
    <div className="zv" role="dialog" aria-modal="true" aria-label="Photo" data-testid="zoom-viewer">
      <button className="zv-btn zv-close" onClick={onClose} aria-label="Close photo" data-testid="zoom-close"><Icon name="close" size={22} /></button>
      <div className="zv-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.12 : 0.89))}>
        <img src={src} alt="" draggable={false} data-testid="zoom-img" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
      </div>
      <div className="zv-ctl" role="group" aria-label="Zoom">
        <button className="zv-btn" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= 1} aria-label="Zoom out" data-testid="zoom-out"><Icon name="zoomout" size={20} /></button>
        <button className="zv-btn zv-level" onClick={() => zoomTo(1)} aria-label="Fit" data-testid="zoom-level">{Math.round(zoom * 10) / 10}×</button>
        <button className="zv-btn" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Zoom in" data-testid="zoom-in-btn"><Icon name="zoomin" size={20} /></button>
      </div>
    </div>
  );
}

/** A photo that opens full-screen with zoom when tapped. Use it wherever a picture is shown. */
export function ZoomImage({ src, alt = '', className, testId }: { src: string; alt?: string; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img src={src} alt={alt} className={className} data-testid={testId} onClick={(e) => { e.stopPropagation(); setOpen(true); }} style={{ cursor: 'zoom-in' }} />
      {open && createPortal(<Viewer src={src} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
