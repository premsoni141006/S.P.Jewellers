// Development only: open http://localhost:3000/?demo=stock to load sample stock (with photos) for
// trying Stock OUT. Never included in the production build (see main.tsx).

import { KEYS, load, save } from './storage';
import { putPhoto } from './photos';
import { today, type StockEntry } from '@shared';

function metalGradient(g: CanvasRenderingContext2D, metal: string, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  const stops = metal === 'gold' ? ['#fff3c4', '#e7b84a', '#9a6a12', '#f6d878', '#b8861a'] : ['#ffffff', '#c9ced6', '#7d8794', '#eef1f5', '#a5adb9'];
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}

/** A soft studio-style picture (silk backdrop, bokeh, polished metal piece) so the gallery can be tried without real photos. */
async function pic(item: string, metal: string): Promise<Blob> {
  const W = 480, H = 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const bg = g.createLinearGradient(0, 0, W, H);
  if (metal === 'gold') { bg.addColorStop(0, '#f7ead0'); bg.addColorStop(1, '#d9c39a'); } else { bg.addColorStop(0, '#eceaf3'); bg.addColorStop(1, '#bfc1cf'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // silk folds
  for (let i = 0; i < 4; i++) {
    const f = g.createLinearGradient(0, H * 0.4 + i * 30, W, H * 0.7 + i * 40);
    f.addColorStop(0, 'rgba(255,255,255,0)'); f.addColorStop(0.5, 'rgba(255,255,255,0.45)'); f.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = f; g.fillRect(0, H * 0.35 + i * 38, W, 46);
  }
  // bokeh
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(255,255,255,${0.12 + (i % 3) * 0.08})`;
    g.beginPath(); g.arc((i * 97) % W, 30 + ((i * 53) % 150), 14 + (i % 4) * 9, 0, Math.PI * 2); g.fill();
  }
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 10;
  const ring = (cx: number, cy: number, rx: number, ry: number, w: number) => {
    g.strokeStyle = metalGradient(g, metal, cx - rx, cy - ry, cx + rx, cy + ry); g.lineWidth = w;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  };
  const gem = (cx: number, cy: number, r: number) => {
    g.shadowBlur = 8; g.fillStyle = '#f4fbff';
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,160,200,0.7)'; g.lineWidth = 1.5; g.stroke();
  };
  const t = item.toLowerCase();
  if (/chain|necklace|haar/.test(t)) {
    g.lineWidth = 9; g.strokeStyle = metalGradient(g, metal, 60, 60, 420, 340);
    for (let i = 0; i <= 22; i++) { const a = Math.PI * (0.08 + (i / 22) * 0.84); const x = W / 2 + Math.cos(a) * 170, y = 70 + Math.sin(a) * 230; g.beginPath(); g.ellipse(x, y, 12, 8, a + Math.PI / 2, 0, Math.PI * 2); g.stroke(); }
    gem(W / 2, 318, 17);
  } else if (/ear/.test(t)) {
    [150, 330].forEach((x) => { g.strokeStyle = metalGradient(g, metal, x - 40, 90, x + 40, 300); g.lineWidth = 7; g.beginPath(); g.moveTo(x, 80); g.lineTo(x, 130); g.stroke(); for (let k = 0; k < 6; k++) { g.save(); g.translate(x, 190); g.rotate((k * Math.PI) / 3); g.beginPath(); g.ellipse(0, -42, 17, 36, 0, 0, Math.PI * 2); g.fillStyle = metalGradient(g, metal, -20, -80, 20, 0); g.fill(); g.restore(); } gem(x, 190, 15); });
  } else if (/bracelet|bangle|kada/.test(t)) {
    ring(W / 2, 205, 150, 95, 26); gem(W / 2, 110, 16); gem(W / 2 - 70, 116, 11); gem(W / 2 + 70, 116, 11);
  } else if (/anklet/.test(t)) {
    ring(W / 2, 205, 160, 100, 14); for (let k = 0; k < 9; k++) { const a = Math.PI * (0.15 + k * 0.088); g.fillStyle = metalGradient(g, metal, 0, 0, 30, 30); g.beginPath(); g.arc(W / 2 + Math.cos(a) * 160, 205 + Math.sin(a) * 100, 8, 0, Math.PI * 2); g.fill(); }
  } else if (/pendant|locket/.test(t)) {
    g.strokeStyle = metalGradient(g, metal, 100, 0, 380, 200); g.lineWidth = 4; g.beginPath(); g.moveTo(130, 0); g.quadraticCurveTo(W / 2, 220, 350, 0); g.stroke();
    g.fillStyle = metalGradient(g, metal, 190, 170, 290, 330); g.beginPath(); g.moveTo(W / 2, 160); g.bezierCurveTo(W / 2 + 90, 240, W / 2 + 60, 340, W / 2, 340); g.bezierCurveTo(W / 2 - 60, 340, W / 2 - 90, 240, W / 2, 160); g.fill(); gem(W / 2, 255, 20);
  } else {
    ring(W / 2, 235, 78, 78, 28); g.shadowBlur = 6; gem(W / 2, 150, 24);
  }
  return new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.85));
}

const DEMO: Array<[string, 'gold' | 'silver', string, number, number]> = [
  // id, metal, category, weight, tunch
  ['demo-1', 'gold', 'Gold Ring – Classic', 5.5, 92],
  ['demo-2', 'gold', 'Gold Ring – Classic', 5.5, 92],
  ['demo-3', 'gold', 'Gold Ring – Classic', 6, 92],
  ['demo-4', 'gold', 'Gold Chain – Daily Wear', 12.8, 92],
  ['demo-5', 'gold', 'Gold Chain – Daily Wear', 12.8, 92],
  ['demo-6', 'gold', 'Gold Earrings – Floral', 4.4, 92],
  ['demo-7', 'gold', 'Gold Bracelet – Designer', 8.35, 92],
  ['demo-8', 'silver', 'Silver Anklet – Traditional', 38.5, 100],
  ['demo-9', 'silver', 'Silver Anklet – Traditional', 38.5, 100],
  ['demo-10', 'silver', 'Silver Anklet – Traditional', 40, 100],
  ['demo-11', 'silver', 'Silver Ring – Plain', 7.8, 100],
  ['demo-12', 'silver', 'Silver Ring – Plain', 7.8, 100],
];

export async function loadDemoStock(): Promise<void> {
  const cur = load<StockEntry[]>(KEYS.stock, []).filter((e) => !e.id.startsWith('demo-'));
  const day = today();
  const demo: StockEntry[] = [];
  for (const [id, metal, item, weight, tunch] of DEMO) {
    await putPhoto(id, await pic(item, metal));
    demo.push({ id, date: day, type: 'in', metal, item, tunch, weight, pcs: 1, note: 'Demo', photoId: id, createdAt: `${day}T10:00:${id.slice(5).padStart(2, '0')}Z` });
  }
  save(KEYS.stock, [...demo, ...cur]);
}
