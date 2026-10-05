// S.P. Jewellers cloud: a small Worker in front of one R2 bucket.
//
//   GET  /v1/ping                 -> { ok: true }
//   GET  /v1/c/<collection>       -> the stored JSON document (200, X-Etag) or { "empty": true } (X-Etag: none)
//   PUT  /v1/c/<collection>       -> store the JSON document. Needs  If-Match: <X-Etag from the GET>  (or "none"
//                                    for the first write). 412 when somebody else wrote in between.
//   PUT  /v1/p/<id>               -> store one photo (image bytes)
//   GET  /v1/p/<id>  /  HEAD      -> the photo (404 when it is not there)
//   DELETE /v1/p/<id>             -> remove the photo for good
//
// An optional  X-Shop: <id>  header (e.g. kj) keeps another shop's data in its own folder.
// Every request needs  Authorization: Bearer <SYNC_TOKEN>.  The token is a Worker secret, never in the code.

export interface Env {
  BUCKET: R2Bucket;
  SYNC_TOKEN: string;
}

const COLLECTIONS = new Set(['history', 'stock', 'cash', 'picks', 'products', 'settings']);
const ID = /^[A-Za-z0-9_-]{4,80}$/;
const SHOP = /^[a-z0-9]{2,12}$/;
const MAX_DOC = 8 * 1024 * 1024;
const MAX_PHOTO = 4 * 1024 * 1024;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, HEAD, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-Shop',
  'Access-Control-Expose-Headers': 'X-Etag',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

/** Compares two strings without stopping at the first difference. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!env.SYNC_TOKEN || !token || !sameSecret(token, env.SYNC_TOKEN)) return json({ error: 'Not allowed.' }, 401);

    // Each shop keeps its own folder. S.P. Jewellers (no X-Shop header) uses the bucket root, as before.
    const shop = (req.headers.get('X-Shop') ?? '').toLowerCase();
    if (shop && !SHOP.test(shop)) return json({ error: 'Bad shop.' }, 400);
    const root = shop && shop !== 'spj' ? `${shop}/` : '';

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['v1', 'c', 'stock']
    if (parts[0] !== 'v1') return json({ error: 'Not found.' }, 404);

    if (parts[1] === 'ping' && req.method === 'GET') return json({ ok: true });

    // ---- JSON documents (one per collection)
    if (parts[1] === 'c' && parts[2] && COLLECTIONS.has(parts[2])) {
      const key = `${root}c/${parts[2]}.json`;
      if (req.method === 'GET') {
        const obj = await env.BUCKET.get(key);
        if (!obj) return json({ empty: true }, 200, { 'X-Etag': 'none' });
        return new Response(obj.body, { headers: { 'Content-Type': 'application/json', 'X-Etag': obj.etag, ...CORS } });
      }
      if (req.method === 'PUT') {
        const text = await req.text();
        if (text.length > MAX_DOC) return json({ error: 'Too large.' }, 413);
        try { JSON.parse(text); } catch { return json({ error: 'Not JSON.' }, 400); }
        const match = req.headers.get('If-Match');
        if (!match) return json({ error: 'If-Match is required.' }, 428);
        const onlyIf = match === 'none' ? { etagDoesNotMatch: '*' } : { etagMatches: match };
        const put = await env.BUCKET.put(key, text, { httpMetadata: { contentType: 'application/json' }, onlyIf });
        if (!put) return json({ error: 'Changed by another device.' }, 412);
        return json({ ok: true }, 200, { 'X-Etag': put.etag });
      }
    }

    // ---- photos (immutable: one id, one picture)
    if (parts[1] === 'p' && parts[2] && ID.test(parts[2])) {
      const key = `${root}p/${parts[2]}`;
      if (req.method === 'PUT') {
        const bytes = await req.arrayBuffer();
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO) return json({ error: 'Bad size.' }, 413);
        await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: req.headers.get('Content-Type') || 'image/jpeg' } });
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        await env.BUCKET.delete(key); // gone for good
        return json({ ok: true });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const obj = req.method === 'HEAD' ? await env.BUCKET.head(key) : await env.BUCKET.get(key);
        if (!obj) return json({ error: 'No such photo.' }, 404);
        const headers = { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', ...CORS };
        return new Response(req.method === 'HEAD' ? null : (obj as R2ObjectBody).body, { headers });
      }
    }

    return json({ error: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;
