// A minimal PDF writer: each page is one full-page JPEG on A4. Used to save the final bill as a
// PDF that looks exactly like the printed page (it is drawn from the same bill layout).

export interface PdfPage {
  jpeg: Uint8Array;
  /** Pixel size of the JPEG (the image is stretched to fill the A4 page). */
  width: number;
  height: number;
}

/** A4 in PDF points (1/72 inch). */
export const A4_PT = { width: 595.28, height: 841.89 };

const enc = new TextEncoder();

export function buildPdfFromJpegs(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string | Array<Uint8Array | string>) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) push(part);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const firstPage = 3;
  const kids = pages.map((_, i) => `${firstPage + i * 3} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((p, i) => {
    const page = firstPage + i * 3;
    const contents = page + 1;
    const image = page + 2;
    object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT.width} ${A4_PT.height}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contents} 0 R >>`);
    const draw = `q ${A4_PT.width} 0 0 ${A4_PT.height} 0 0 cm /Im0 Do Q`;
    object(contents, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    object(image, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });

  const count = firstPage + pages.length * 3; // objects 1..count-1 exist, plus the free entry 0
  const xrefAt = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
