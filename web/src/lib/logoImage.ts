// The shop logo is a small picture kept inside the settings (as a data URI), so it travels with them to the cloud.

/** Shrinks a picture to at most `max` px on its long side and returns it as a data URI (PNG, or JPEG when that is much smaller). */
export async function logoFromFile(file: Blob, max = 320): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('This browser cannot prepare the picture.');
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const png = canvas.toDataURL('image/png');
  if (png.length <= 180_000) return png;
  // A photo-like logo: JPEG on white is far smaller than PNG.
  const flat = document.createElement('canvas');
  flat.width = w;
  flat.height = h;
  const fg = flat.getContext('2d') as CanvasRenderingContext2D;
  fg.fillStyle = '#fff';
  fg.fillRect(0, 0, w, h);
  fg.drawImage(canvas, 0, 0);
  return flat.toDataURL('image/jpeg', 0.85);
}
