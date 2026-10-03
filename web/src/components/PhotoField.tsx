import { useRef, useState } from 'react';
import { shrinkImage, usePhotoUrl } from '../lib/photos';
import { Icon } from './Icon';

/**
 * Take a photo of the product (camera) or pick one from the gallery.
 * `pending`: undefined = keep the saved photo, a Blob = a new picture, null = removed.
 */
export function PhotoField({ photoId, pending, onChange }: { photoId?: string; pending: Blob | null | undefined; onChange: (b: Blob | null) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const url = usePhotoUrl(photoId, pending);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      onChange(await shrinkImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that picture.');
    }
  };

  return (
    <div className="photo-field" data-testid="photo-field">
      <span className="field-label">Product photo</span>
      <div className="photo-row">
        <div className="photo-box">
          {url ? <img src={url} alt="Product" data-testid="photo-preview" /> : <span className="muted small">No photo</span>}
        </div>
        <div className="photo-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => cam.current?.click()} data-testid="photo-camera"><Icon name="camera" size={18} /> Take photo</button>
          <button type="button" className="btn btn-plain btn-sm" onClick={() => gal.current?.click()} data-testid="photo-gallery">From gallery</button>
          {url && <button type="button" className="btn btn-plain btn-sm danger-text" onClick={() => onChange(null)} data-testid="photo-remove">Remove</button>}
        </div>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="photo-input-camera" />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="photo-input-gallery" />
      {error && <p className="err small" role="alert">{error}</p>}
    </div>
  );
}
