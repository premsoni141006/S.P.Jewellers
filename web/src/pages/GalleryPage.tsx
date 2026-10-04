import { useMemo, useState } from 'react';
import { availableStock, fmtWeight, today, type StockEntry } from '@shared';
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

/** A photo on its own page: big and clear, with previous / next through the current list. */
function Empty({ text }: { text: string }) {
  return (
    <div className="gx-empty">
      <Icon name="gallery" size={44} />
      <p>{text}</p>
      <small>Photos added with Stock IN appear here.</small>
    </div>
  );
}

function AlbumCard({ album, index, onOpen }: { album: { item: string; photos: StockEntry[] }; index: number; onOpen: () => void }) {
  const url = usePhotoUrl(album.photos[0]?.photoId);
  return (
    <button type="button" className="gx-card gx-album" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }} onClick={onOpen} data-testid="gallery-album" aria-label={`${album.item}, ${album.photos.length} photos`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="gx-blank" />}
      <span className="gx-count">{album.photos.length}</span>
      <span className="gx-label"><span className="gx-name">{album.item}</span></span>
    </button>
  );
}

function Detail({ list, index, onIndex, onClose }: { list: StockEntry[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const entry = list[index];
  const url = usePhotoUrl(entry.photoId);
  useBackLayer(true, onClose);
  return (
    <div className="gx-detail" role="dialog" aria-modal="true" aria-label="Photo" data-testid="gallery-viewer">
      <header className="gx-top">
        <button className="gx-round" onClick={onClose} aria-label="Back to gallery" data-testid="gallery-viewer-back"><Icon name="back" size={22} /></button>
        <div className="gx-title"><span>{index + 1} / {list.length}</span></div>
        <span className="gx-round gx-ghost" aria-hidden="true" />
      </header>
      <div className="gx-stage">
        <button className="gx-round gx-prev" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous" data-testid="gallery-prev"><Icon name="back" size={22} /></button>
        {url && <img src={url} alt="" />}
        <button className="gx-round gx-next" onClick={() => onIndex(index + 1)} disabled={index === list.length - 1} aria-label="Next" data-testid="gallery-next"><Icon name="next" size={22} /></button>
      </div>
      <div className="gx-caption"><span className="gx-name">{entry.item}</span><span className="gx-wt">{fmtWeight(entry.weight)} g</span></div>
    </div>
  );
}

type GalleryTab = 'all' | 'albums' | 'new' | 'stock' | 'sold';
const TABS: Array<[GalleryTab, string]> = [['all', 'All'], ['albums', 'Albums'], ['new', 'New'], ['stock', 'In stock'], ['sold', 'Sold']];
const daysAgo = (n: number): string => { const d = new Date(); d.setDate(d.getDate() - n); return today(d); };

/**
 * Full-screen gallery of every jewellery photo from the stock register. A dark, immersive
 * layout: cards show only the item and its weight; the bottom bar switches between All and each category.
 */
export function GalleryPage({ store, onBack }: { store: AppStore; onBack: () => void }) {
  const [metal, setMetal] = useState<'gold' | 'silver' | null>(null); // null until the first look at what exists
  const [tab, setTab] = useState<GalleryTab>('all');
  const [album, setAlbum] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

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
  const keyOf = (e: StockEntry) => `${e.metal}|${e.item.trim().toLowerCase()}`;
  // Pieces that are still in the shop vs. ones that have gone out (an OUT of the same piece exists).
  const inStock = useMemo(() => new Set(availableStock(store.stock).map((x) => x.id)), [store.stock]);
  const recentFrom = daysAgo(14);

  const shown = tab === 'all' ? ofMetal
    : tab === 'new' ? ofMetal.filter((e) => e.date >= recentFrom).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : tab === 'stock' ? ofMetal.filter((e) => inStock.has(e.id))
    : tab === 'sold' ? ofMetal.filter((e) => !inStock.has(e.id))
    : album ? ofMetal.filter((e) => keyOf(e) === album) : [];
  const albums = cats.map((c) => ({ ...c, photos: ofMetal.filter((e) => keyOf(e) === c.key) })).filter((a) => a.photos.length);
  const inAlbumList = tab === 'albums' && !album;

  return (
    <div className="gx" data-theme={active} data-testid="gallery-page">
      <header className="gx-top">
        <button className="gx-round" onClick={onBack} aria-label="Back" data-testid="gallery-back"><Icon name="back" size={22} /></button>
        <div className="gx-title"><span>Gallery</span><small>{inAlbumList ? `${albums.length} album${albums.length === 1 ? '' : 's'}` : album ? albums.find((a) => a.key === album)?.item ?? '' : `${shown.length} piece${shown.length === 1 ? '' : 's'}`}</small></div>
        <span className="gx-round gx-ghost" aria-hidden="true" />
      </header>
      <div className="gx-switch" role="group" aria-label="Metal" data-testid="gallery-switch">
        {(['silver', 'gold'] as const).map((m) => (
          <button key={m} className={active === m ? 'on' : ''} aria-pressed={active === m} onClick={() => { setMetal(m); setAlbum(null); }} data-testid={`gallery-${m}`}>{m === 'gold' ? 'Gold' : 'Silver'}</button>
        ))}
      </div>

      <main className="gx-body">
        {inAlbumList ? (
          albums.length === 0 ? <Empty text={`No ${active} albums yet`} /> : (
            <div className="gx-grid" key={`albums-${active}`}>
              {albums.map((a, i) => <AlbumCard key={a.key} album={a} index={i} onOpen={() => setAlbum(a.key)} />)}
            </div>
          )
        ) : shown.length === 0 ? (
          <Empty text={tab === 'new' ? `Nothing new in ${active} lately` : tab === 'sold' ? `No ${active} piece has gone out yet` : tab === 'stock' ? `No ${active} piece in stock` : `No ${active} photos yet`} />
        ) : (
          <>
            {album && <button className="gx-crumb" onClick={() => setAlbum(null)} data-testid="gallery-albums-back"><Icon name="back" size={16} /> Albums</button>}
            <div className="gx-grid" key={`${tab}-${album}-${active}`}>
              {shown.map((e, i) => <Card key={e.id} entry={e} index={i} onOpen={() => setOpenIdx(i)} />)}
            </div>
          </>
        )}
      </main>

      <nav className="gx-nav" aria-label="Gallery sections" data-testid="gallery-nav">
        {TABS.map(([id, label]) => (
          <button key={id} className={`gx-chip${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setAlbum(null); }} data-testid={`gallery-tab-${id}`}>{label}</button>
        ))}
      </nav>
      {openIdx !== null && shown[openIdx] && <Detail list={shown} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)} />}
    </div>
  );
}
