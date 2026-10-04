// Development only: open http://localhost:3000/?demo=stock to load sample stock (with photos) for
// trying Stock OUT. Never included in the production build (see main.tsx).

import { KEYS, load, save } from './storage';
import { putPhoto } from './photos';
import { today, type StockEntry } from '@shared';

const COLORS: Record<string, string> = { gold: '#d9a93a', silver: '#b9bfc7' };

async function pic(label: string, metal: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 300;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#f6efe3'; g.fillRect(0, 0, 400, 300);
  g.fillStyle = COLORS[metal]; g.beginPath(); g.arc(200, 120, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6efe3'; g.beginPath(); g.arc(200, 120, 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5e0a10'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText(label, 200, 250);
  return new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.8));
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
    await putPhoto(id, await pic(`${weight} g`, metal));
    demo.push({ id, date: day, type: 'in', metal, item, tunch, weight, pcs: 1, note: 'Demo', photoId: id, createdAt: `${day}T10:00:${id.slice(5).padStart(2, '0')}Z` });
  }
  save(KEYS.stock, [...demo, ...cur]);
}
