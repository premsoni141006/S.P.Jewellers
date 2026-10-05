// Product photos for the stock register. They are kept in the phone's IndexedDB (not in the small
// text storage), each shrunk to a small JPEG so many photos stay well within the phone's limits.

import { useEffect, useState } from 'react';
import { shopPrefix } from './shop';

const dbName = (): string => `${shopPrefix()}-photos`;
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(), 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(r.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

export const putPhoto = (id: string, blob: Blob): Promise<unknown> => tx('readwrite', (s) => s.put(blob, id));
export const getPhoto = (id: string): Promise<Blob | undefined> => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deletePhoto = (id: string): Promise<unknown> => tx('readwrite', (s) => s.delete(id)).catch(() => undefined);

/** Resize a camera / gallery picture to at most `max` px on its long side, as a JPEG. */
export async function shrinkImage(file: Blob, max = 800, quality = 0.72): Promise<Blob> {
  const bmp = await createImageBitmap(file); // applies the camera's rotation
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the picture.');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the picture.'))), 'image/jpeg', quality));
}

/** An object URL for a stored photo (or a not-yet-saved one); revoked automatically. */
export function usePhotoUrl(photoId: string | undefined, pending?: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let cancelled = false;
    if (pending) {
      made = URL.createObjectURL(pending);
      setUrl(made);
    } else if (pending === null || !photoId) {
      setUrl(null);
    } else {
      getPhoto(photoId)
        .then((b) => {
          if (cancelled || !b) return;
          made = URL.createObjectURL(b);
          setUrl(made);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photoId, pending]);
  return url;
}
