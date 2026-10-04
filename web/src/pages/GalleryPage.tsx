import { useMemo, useState } from 'react';
import { fmtWeight, type StockEntry } from '@shared';
import { Icon } from '../components/Icon';
import { useBackLayer } from '../lib/backStack';
import { usePhotoUrl } from '../lib/photos';
import type { AppStore } from '../lib/store';

function Card({ entry, index, onOpen }: { entry: StockEntry; index: number; onOpen: () => void }) {
  const url = usePhotoUrl(entry.photoId);
  return (
    <button type="button" className="gx-card" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }} onClick={onOpen} data-testid="gallery-photo" aria-label={`${entry.item} ${fmtWeight(entry.weight)} g`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="gx-blank" />}
      <span className="gx-label">
        <span className="gx-name">{entry.item}</span>
        <span className="gx-wt">{fmtWeight(entry.weight)} g</span>
      </span>
    </button>
  );
}

function Viewer({ entry, onClose }: { entry: StockEntry; onClose: () => void }) {
  const url = usePhotoUrl(entry.photoId);
  useBackLayer(true, onClose);
  return (
    <div className="gx-viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose} data-testid="gallery-viewer">
      <button className="gx-round gx-viewer-close" onClick={onClose} aria-label="Close">✕</button>
      {url && <img src={url} alt="" />}
      <div className="gx-caption"><span className="gx-name">{entry.item}</span><span className="gx-wt">{fmtWeight(entry.weight)} g</span></div>
    </div>
  );
}

/**
 * Full-screen gallery of every jewellery photo from the stock register. A dark, immersive
 * layout: cards show only the item and its weight; the bottom bar switches between All and each category.
 */
export function GalleryPage({ store, onBack }: { store: AppStore; onBack: () => void }) {
  const [metal, setMetal] = useState<'gold' | 'silver' | null>(null); // null until the first look at what exists
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState<StockEntry | null>(null);

  const { categories, all } = useMemo(() => {
    const withPhoto = store.stock.filter((e) => e.photoId && e.type === 'in');
    const map = new Map<string, { key: string; metal: string; item: string }>();
    for (const e of withPhoto) {
      const key = `${e.metal}|${e.item.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, metal: e.metal, item: e.item.trim() || 'Unnamed' });
    }
    const categories = [...map.values()].sort((a, b) => (a.metal === b.metal ? a.item.localeCompare(b.item) : a.metal === 'gold' ? -1 : 1));
    const order = new Map(categories.map((c, i) => [c.key, i]));
    const keyOf = (e: StockEntry) => `${e.metal}|${e.item.trim().toLowerCase()}`;
    const all = [...withPhoto].sort((a, b) => (order.get(keyOf(a)) ?? 0) - (order.get(keyOf(b)) ?? 0) || a.weight - b.weight);
    return { categories, all };
  }, [store.stock]);

  // The switch at the top picks the metal; the page takes that metal's look (gold or silver).
  const hasGold = all.some((e) => e.metal === 'gold');
  const active: 'gold' | 'silver' = metal ?? (hasGold || all.length === 0 ? 'gold' : 'silver');
  const ofMetal = all.filter((e) => e.metal === active);
  const cats = categories.filter((c) => c.metal === active);
  const shown = cat === 'all' ? ofMetal : ofMetal.filter((e) => `${e.metal}|${e.item.trim().toLowerCase()}` === cat);

  return (
    <div className="gx" data-theme={active} data-testid="gallery-page">
      <header className="gx-top">
        <button className="gx-round" onClick={onBack} aria-label="Back" data-testid="gallery-back"><Icon name="back" size={22} /></button>
        <div className="gx-title"><span>Gallery</span><small>{shown.length} piece{shown.length === 1 ? '' : 's'}</small></div>
        <span className="gx-round gx-ghost" aria-hidden="true" />
      </header>
      <div className="gx-switch" role="group" aria-label="Metal" data-testid="gallery-switch">
        {(['silver', 'gold'] as const).map((m) => (
          <button key={m} className={active === m ? 'on' : ''} aria-pressed={active === m} onClick={() => { setMetal(m); setCat('all'); }} data-testid={`gallery-${m}`}>{m === 'gold' ? 'Gold' : 'Silver'}</button>
        ))}
      </div>

      <main className="gx-body">
        {ofMetal.length === 0 ? (
          <div className="gx-empty">
            <Icon name="gallery" size={44} />
            <p>No {active} photos yet</p>
            <small>Photos added with Stock IN appear here.</small>
          </div>
        ) : (
          <div className="gx-grid" key={cat}>
            {shown.map((e, i) => <Card key={e.id} entry={e} index={i} onOpen={() => setOpen(e)} />)}
          </div>
        )}
      </main>

      <nav className="gx-nav" aria-label="Categories" data-testid="gallery-nav">
        <button className={`gx-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')} data-testid="gallery-cat-all">All</button>
        {cats.map((c) => (
          <button key={c.key} className={`gx-chip${cat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)} data-testid="gallery-cat">{c.item}</button>
        ))}
      </nav>
      {open && <Viewer entry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
