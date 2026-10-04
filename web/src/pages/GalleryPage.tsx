import { useMemo, useRef, useState } from 'react';
import { fmtWeight, type StockEntry } from '@shared';
import { Icon } from '../components/Icon';
import { useBackLayer } from '../lib/backStack';
import { usePhotoUrl } from '../lib/photos';
import { addPick, customersOf, loadPicks, picksOf, type Pick } from '../lib/picks';
import type { AppStore } from '../lib/store';

function Card({ entry, index, liked, onOpen, onLike }: { entry: StockEntry; index: number; liked: boolean; onOpen: () => void; onLike?: () => void }) {
  const url = usePhotoUrl(entry.photoId);
  return (
    <div className="gx-card" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <button type="button" className="gx-open" onClick={onOpen} data-testid="gallery-photo" aria-label={`${entry.item} ${fmtWeight(entry.weight)} g`}>
        {url ? <img src={url} alt="" loading="lazy" /> : <span className="gx-blank" />}
        <span className="gx-label">
          <span className="gx-name">{entry.item}</span>
          <span className="gx-wt">{fmtWeight(entry.weight)} g</span>
        </span>
      </button>
      {onLike && <button type="button" className={`gx-plus${liked ? ' liked' : ''}`} onClick={onLike} aria-label="A customer likes this" data-testid="gallery-plus">{liked ? '✓' : '+'}</button>}
    </div>
  );
}

/** Asks which customer likes the piece, then records the pick. */
function LikeWindow({ entry, picks, onSave, onClose }: { entry: StockEntry; picks: Pick[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  useBackLayer(true, onClose);
  const known = customersOf(picks);
  const save = () => { if (name.trim()) onSave(name.trim()); };
  return (
    <div className="gx-modal" role="dialog" aria-modal="true" aria-label="Customer likes this" onClick={onClose} data-testid="like-window">
      <form className="gx-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2>Customer likes this</h2>
        <p className="gx-modal-sub">{entry.item} · {fmtWeight(entry.weight)} g</p>
        <label className="gx-field">
          <span>Customer name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus data-testid="like-name" />
        </label>
        {known.length > 0 && (
          <div className="gx-known" aria-label="Earlier customers">
            {known.slice(0, 8).map((c) => <button type="button" key={c.key} className="gx-pill" onClick={() => setName(c.name)} data-testid="like-known">{c.name}</button>)}
          </div>
        )}
        <div className="gx-modal-actions">
          <button type="button" className="gx-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="gx-btn primary" disabled={!name.trim()} data-testid="like-save">Add</button>
        </div>
      </form>
    </div>
  );
}

/** A photo on its own page: big and clear, with previous / next through the current list. */
function Empty({ text, hint = 'Photos added with Stock IN appear here.' }: { text: string; hint?: string }) {
  return (
    <div className="gx-empty">
      <Icon name="gallery" size={44} />
      <p>{text}</p>
      <small>{hint}</small>
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

function Detail({ list, index, liked, onIndex, onLike, onClose }: { list: StockEntry[]; index: number; liked: (id: string) => boolean; onIndex: (i: number) => void; onLike?: (e: StockEntry) => void; onClose: () => void }) {
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
      {onLike && <button type="button" className={`gx-like-big${liked(entry.id) ? ' liked' : ''}`} onClick={() => onLike(entry)} data-testid="gallery-detail-plus">{liked(entry.id) ? '✓ Liked' : '+ Customer likes this'}</button>}
    </div>
  );
}

type GalleryTab = 'fav' | 'all' | 'albums';
const TABS: Array<[GalleryTab, string]> = [['fav', '♥ Fav'], ['all', 'All'], ['albums', 'Albums']];

/**
 * Full-screen gallery of every jewellery photo from the stock register. A dark, immersive
 * layout: cards show only the item and its weight; the bottom bar switches between All and each category.
 */
export function GalleryPage({ store, onBack }: { store: AppStore; onBack: () => void }) {
  const [metal, setMetal] = useState<'gold' | 'silver' | null>(null); // null until the first look at what exists
  const [tab, setTab] = useState<GalleryTab>('all'); // opens on All; Fav and Albums sit either side of it in the bottom bar
  const [album, setAlbum] = useState<string | null>(null);
  // Scrolling down hides the header and the bottom bar; scrolling back up brings them back.
  const [hideBars, setHideBars] = useState(false);
  const lastTop = useRef(0);
  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const top = e.currentTarget.scrollTop;
    const d = top - lastTop.current;
    if (top < 40) setHideBars(false);
    else if (d > 8) setHideBars(true);
    else if (d < -8) setHideBars(false);
    lastTop.current = top;
  };
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Customer picks (the "+" on a photo) and the Fav view that lists them per customer.
  const [picks, setPicks] = useState<Pick[]>(loadPicks);
  const [likeFor, setLikeFor] = useState<StockEntry | null>(null);
  const [favCustomer, setFavCustomer] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const likedIds = useMemo(() => new Set(picks.map((p) => p.entryId)), [picks]);
  const customers = useMemo(() => customersOf(picks), [picks]);

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

  const shown = tab === 'all' ? ofMetal
    : tab === 'fav' ? (favCustomer ? picksOf(picks, favCustomer).map((p) => all.find((e) => e.id === p.entryId)).filter((e): e is StockEntry => !!e) : [])
    : album ? ofMetal.filter((e) => keyOf(e) === album) : [];
  const albums = cats.map((c) => ({ ...c, photos: ofMetal.filter((e) => keyOf(e) === c.key) })).filter((a) => a.photos.length);
  const inAlbumList = tab === 'albums' && !album;
  const inCustomerList = tab === 'fav' && !favCustomer;
  const favName = customers.find((c) => c.key === favCustomer)?.name ?? '';

  return (
    <div className={`gx${hideBars ? ' hide-bars' : ''}`} data-theme={active} data-testid="gallery-page">
      <div className="gx-head" data-testid="gallery-head">
      <header className="gx-top">
        <button className="gx-round" onClick={onBack} aria-label="Back" data-testid="gallery-back"><Icon name="back" size={22} /></button>
        <div className="gx-title"><span>Gallery</span><small>{inCustomerList ? `${customers.length} customer${customers.length === 1 ? '' : 's'}` : tab === 'fav' ? favName : inAlbumList ? `${albums.length} album${albums.length === 1 ? '' : 's'}` : album ? albums.find((a) => a.key === album)?.item ?? '' : `${shown.length} piece${shown.length === 1 ? '' : 's'}`}</small></div>
        <span className="gx-round gx-ghost" aria-hidden="true" />
      </header>
      <div className="gx-switch" role="group" aria-label="Metal" data-testid="gallery-switch">
        {(['silver', 'gold'] as const).map((m) => (
          <button key={m} className={active === m ? 'on' : ''} aria-pressed={active === m} onClick={() => { setMetal(m); setAlbum(null); setHideBars(false); }} data-testid={`gallery-${m}`}>{m === 'gold' ? 'Gold' : 'Silver'}</button>
        ))}
      </div>
      </div>

      <main className="gx-body" onScroll={onScroll} data-testid="gallery-body">
        {inCustomerList ? (
          customers.length === 0 ? <Empty text="No customer has picked anything yet" hint="Tap + on a photo when a customer likes it." /> : (
            <div className="gx-customers" data-testid="gallery-customers">
              {customers.map((c) => (
                <button key={c.key} className="gx-cust" onClick={() => setFavCustomer(c.key)} data-testid="gallery-customer">
                  <span className="gx-avatar">{c.name.charAt(0).toUpperCase()}</span>
                  <span className="gx-cust-name">{c.name}</span>
                  <span className="gx-count static">{c.count}</span>
                </button>
              ))}
            </div>
          )
        ) : inAlbumList ? (
          albums.length === 0 ? <Empty text={`No ${active} albums yet`} /> : (
            <div className="gx-grid" key={`albums-${active}`}>
              {albums.map((a, i) => <AlbumCard key={a.key} album={a} index={i} onOpen={() => setAlbum(a.key)} />)}
            </div>
          )
        ) : shown.length === 0 ? (
          <Empty text={tab === 'fav' ? 'Nothing picked yet' : `No ${active} photos yet`} />
        ) : (
          <>
            {album && <button className="gx-crumb" onClick={() => setAlbum(null)} data-testid="gallery-albums-back"><Icon name="back" size={16} /> Albums</button>}
            {tab === 'fav' && favCustomer && <button className="gx-crumb" onClick={() => setFavCustomer(null)} data-testid="gallery-customers-back"><Icon name="back" size={16} /> Customers</button>}
            <div className="gx-grid" key={`${tab}-${album}-${active}`}>
              {shown.map((e, i) => <Card key={e.id} entry={e} index={i} liked={likedIds.has(e.id)} onOpen={() => setOpenIdx(i)} onLike={tab === 'fav' ? undefined : () => setLikeFor(e)} />)}
            </div>
          </>
        )}
      </main>

      <nav className="gx-nav" aria-label="Gallery sections" data-testid="gallery-nav">
        {TABS.map(([id, label]) => (
          <button key={id} className={`gx-chip${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setAlbum(null); setFavCustomer(null); setHideBars(false); }} data-testid={`gallery-tab-${id}`}>{label}</button>
        ))}
      </nav>
      {openIdx !== null && shown[openIdx] && <Detail list={shown} index={openIdx} liked={(id) => likedIds.has(id)} onIndex={setOpenIdx} onLike={tab === 'fav' ? undefined : setLikeFor} onClose={() => setOpenIdx(null)} />}
      {likeFor && (
        <LikeWindow
          entry={likeFor}
          picks={picks}
          onClose={() => setLikeFor(null)}
          onSave={(name) => {
            setPicks(addPick(picks, name, likeFor.id));
            setLikeFor(null);
            setNote(`Added for ${name}`);
            window.setTimeout(() => setNote(''), 2200);
          }}
        />
      )}
      {note && <div className="gx-note" role="status" data-testid="gallery-note">{note}</div>}
    </div>
  );
}
