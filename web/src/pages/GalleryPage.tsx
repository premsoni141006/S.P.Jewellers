import { useEffect, useMemo, useRef, useState } from 'react';
import { type StockEntry } from '@shared';
import { Icon } from '../components/Icon';
import { useBackLayer } from '../lib/backStack';
import { usePhotoUrl } from '../lib/photos';
import { GALLERY_BARS, restoreBarColors, setBarColors } from '../lib/barColors';
import { KEYS, load, save } from '../lib/storage';
import { addPick, customersOf, removeSessionPick, loadPicks, picksOf, type Pick } from '../lib/picks';
import type { AppStore } from '../lib/store';

const wt = (w: number): string => `${Math.round(w * 1000) / 1000} g`;

/** Kind of jewellery from the item name, for the round filter buttons. */
const TYPES: Array<{ id: string; label: string; icon: string; words: RegExp }> = [
  { id: 'necklace', label: 'Necklaces', icon: 'necklace', words: /necklace|chain|haar|mala|mangalsutra/i },
  { id: 'earrings', label: 'Earrings', icon: 'earrings', words: /ear ?ring|jhumk|stud|bali|tops/i },
  { id: 'bracelet', label: 'Bracelets', icon: 'bracelet', words: /bracelet|bangle|kada|kangan/i },
  { id: 'ring', label: 'Rings', icon: 'ring', words: /\bring/i },
  { id: 'pendant', label: 'Pendants', icon: 'pendant', words: /pendant|locket/i },
  { id: 'anklet', label: 'Anklets', icon: 'bracelet', words: /anklet|payal/i },
];
const typeOf = (item: string): string => TYPES.find((t) => t.words.test(item))?.id ?? 'other';

function Card({ entry, index, liked, onOpen, onLike }: { entry: StockEntry; index: number; liked: boolean; onOpen: () => void; onLike?: () => void }) {
  const url = usePhotoUrl(entry.photoId);
  return (
    <div className="gx-pcard" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }} data-testid="gallery-card">
      <div className="gx-pphoto">
        <button type="button" className="gx-open" onClick={onOpen} data-testid="gallery-photo" aria-label={`${entry.item} ${wt(entry.weight)}`}>
          {url ? <img src={url} alt="" loading="lazy" /> : <span className="gx-blank" />}
        </button>
        {onLike && <button type="button" className={`gx-heart${liked ? ' liked' : ''}`} onClick={onLike} aria-label="A customer likes this" data-testid="gallery-heart"><Icon name="heart" size={18} fill={liked ? 'currentColor' : 'none'} /></button>}
      </div>
      <div className="gx-pinfo">
        <span className="gx-pname">{entry.item}</span>
        <span className="gx-pwt">{wt(entry.weight)}</span>
      </div>
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
        <p className="gx-modal-sub">{entry.item} · {wt(entry.weight)}</p>
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
      <div className="gx-caption"><span className="gx-name">{entry.item}</span><span className="gx-wt">{wt(entry.weight)}</span></div>
      {onLike && <button type="button" className={`gx-like-heart${liked(entry.id) ? ' liked' : ''}`} onClick={() => onLike(entry)} aria-label="A customer likes this" data-testid="gallery-detail-plus"><Icon name="heart" size={26} fill={liked(entry.id) ? 'currentColor' : 'none'} /></button>}
    </div>
  );
}

type GalleryTab = 'fav' | 'all' | 'albums';
const TABS: Array<[GalleryTab, string, string]> = [['fav', 'Fav', 'heart'], ['all', 'All', 'grid'], ['albums', 'Albums', 'gallery']];

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
  const [type, setType] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  // Hearts show the picks of the customer being served now. The refresh button starts a new customer:
  // the hearts clear, while every customer's list stays in Fav.
  const [sessionStart, setSessionStart] = useState<string>(() => load<string>(KEYS.picksSession, ''));
  // Once a name has been asked for, every further heart goes to the same customer until refresh is pressed.
  const [customer, setCustomer] = useState<string>(() => load<string>(KEYS.picksCustomer, ''));
  const likedIds = useMemo(() => new Set(picks.filter((p) => p.at >= sessionStart).map((p) => p.entryId)), [picks, sessionStart]);
  const customers = useMemo(() => customersOf(picks), [picks]);
  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(''), 2200); };
  const addFor = (name: string, entry: StockEntry) => {
    setPicks(addPick(picks, name, entry.id));
    flash(`Added for ${name}`);
  };
  // Heart tapped: a chosen piece is un-chosen; otherwise ask for the name the first time and after that
  // save straight to the same customer.
  const onHeart = (entry: StockEntry) => {
    if (likedIds.has(entry.id)) {
      setPicks(removeSessionPick(picks, entry.id, sessionStart));
      flash('Removed from the choice');
      return;
    }
    if (!customer) { setLikeFor(entry); return; }
    addFor(customer, entry);
  };

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
  // The phone's status bar and bottom bar take the page's colour (gold / silver) while the Gallery is open.
  useEffect(() => { setBarColors(GALLERY_BARS[active]); }, [active]);
  useEffect(() => restoreBarColors, []);
  const ofMetal = all.filter((e) => e.metal === active);
  const cats = categories.filter((c) => c.metal === active);
  const keyOf = (e: StockEntry) => `${e.metal}|${e.item.trim().toLowerCase()}`;

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const textOf = (e: StockEntry) => `${e.item} ${wt(e.weight)} ${e.weight} ${e.tunch}`.toLowerCase();
  const typesHere = TYPES.filter((t) => ofMetal.some((e) => typeOf(e.item) === t.id));
  const hasOther = ofMetal.some((e) => typeOf(e.item) === 'other');
  const base = tab === 'all' ? ofMetal.filter((e) => type === 'all' || typeOf(e.item) === type) : ofMetal;
  const shown0 = tab === 'all' ? base
    : tab === 'fav' ? (favCustomer ? picksOf(picks, favCustomer).map((p) => all.find((e) => e.id === p.entryId)).filter((e): e is StockEntry => !!e) : [])
    : album ? ofMetal.filter((e) => keyOf(e) === album) : [];
  const shown = words.length ? shown0.filter((e) => words.every((w) => textOf(e).includes(w))) : shown0;
  const albums = cats.map((c) => ({ ...c, photos: ofMetal.filter((e) => keyOf(e) === c.key) })).filter((a) => a.photos.length);
  const inAlbumList = tab === 'albums' && !album;
  const inCustomerList = tab === 'fav' && !favCustomer;
  const favName = customers.find((c) => c.key === favCustomer)?.name ?? '';

  return (
    <div className={`gx${hideBars ? ' hide-bars' : ''}`} data-theme={active} data-testid="gallery-page">
      <main className="gx-body" onScroll={onScroll} data-testid="gallery-body">
      <div className="gx-head" data-testid="gallery-head">
      <header className="gx-top">
        <button className="gx-round" onClick={onBack} aria-label="Back" data-testid="gallery-back"><Icon name="back" size={22} /></button>
        <div className="gx-title"><span>Gallery</span><small>{inCustomerList ? `${customers.length} customer${customers.length === 1 ? '' : 's'}` : tab === 'fav' ? favName : inAlbumList ? `${albums.length} album${albums.length === 1 ? '' : 's'}` : album ? albums.find((a) => a.key === album)?.item ?? '' : `${shown.length} piece${shown.length === 1 ? '' : 's'}`}</small></div>
        <div className="gx-actions">
          <button className={`gx-round${searchOpen ? ' on' : ''}`} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQ(''); }} aria-label="Search" data-testid="gallery-search-btn"><Icon name="search" size={20} /></button>
          <button className="gx-round" onClick={() => { const now = new Date().toISOString(); setSessionStart(now); save(KEYS.picksSession, now); setCustomer(''); save(KEYS.picksCustomer, ''); flash('Ready for a new customer'); }} aria-label="New customer: clear the hearts" data-testid="gallery-refresh"><Icon name="refresh" size={20} /></button>
        </div>
      </header>
      <div className="gx-switch" role="group" aria-label="Metal" data-testid="gallery-switch">
        {(['silver', 'gold'] as const).map((m) => (
          <button key={m} className={active === m ? 'on' : ''} aria-pressed={active === m} onClick={() => { setMetal(m); setAlbum(null); setType('all'); setHideBars(false); }} data-testid={`gallery-${m}`}>{m === 'gold' ? 'Gold' : 'Silver'}</button>
        ))}
      </div>
      {customer && <div className="gx-cur" data-testid="gallery-current">Choosing for <b>{customer}</b></div>}
      {searchOpen && (
        <div className="gx-search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or weight" autoFocus autoComplete="off" data-testid="gallery-search" />
        </div>
      )}
      {tab === 'all' && (
        <div className="gx-types" role="group" aria-label="Type" data-testid="gallery-types">
          <button className={`gx-type${type === 'all' ? ' on' : ''}`} onClick={() => setType('all')} data-testid="gallery-type-all"><span className="gx-type-ic"><Icon name="grid" size={22} /></span><span>All</span></button>
          {typesHere.map((t) => (
            <button key={t.id} className={`gx-type${type === t.id ? ' on' : ''}`} onClick={() => setType(t.id)} data-testid="gallery-type"><span className="gx-type-ic"><Icon name={t.icon} size={22} /></span><span>{t.label}</span></button>
          ))}
          {hasOther && <button className={`gx-type${type === 'other' ? ' on' : ''}`} onClick={() => setType('other')} data-testid="gallery-type"><span className="gx-type-ic"><Icon name="gem" size={22} /></span><span>Others</span></button>}
        </div>
      )}
      </div>

      <div className="gx-content">
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
              {shown.map((e, i) => <Card key={e.id} entry={e} index={i} liked={likedIds.has(e.id)} onOpen={() => setOpenIdx(i)} onLike={tab === 'fav' ? undefined : () => onHeart(e)} />)}
            </div>
          </>
        )}
      </div>
      </main>

      <nav className="gx-nav" aria-label="Gallery sections" data-testid="gallery-nav">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={`gx-chip${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setAlbum(null); setFavCustomer(null); setHideBars(false); }} data-testid={`gallery-tab-${id}`}><Icon name={icon} size={19} fill={id === 'fav' ? 'currentColor' : 'none'} /><span>{label}</span></button>
        ))}
      </nav>
      {openIdx !== null && shown[openIdx] && <Detail list={shown} index={openIdx} liked={(id) => likedIds.has(id)} onIndex={setOpenIdx} onLike={tab === 'fav' ? undefined : onHeart} onClose={() => setOpenIdx(null)} />}
      {likeFor && (
        <LikeWindow
          entry={likeFor}
          picks={picks}
          onClose={() => setLikeFor(null)}
          onSave={(name) => {
            const clean = name.trim().replace(/\s+/g, ' ');
            const known = customersOf(picks).find((c) => c.name.toLowerCase() === clean.toLowerCase())?.name ?? clean;
            setCustomer(known);
            save(KEYS.picksCustomer, known);
            addFor(known, likeFor);
            setLikeFor(null);
          }}
        />
      )}
      {note && <div className="gx-note" role="status" data-testid="gallery-note">{note}</div>}
    </div>
  );
}
