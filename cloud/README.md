# S.P. Jewellers cloud (Cloudflare Worker + R2)

Keeps a copy of the shop's data in the cloud and shares it between devices (phone app, website, other phones):
bills, stock and cash entries, products, settings, customer picks and the stock photos.
Everything also stays on each device, so the app still works with no internet.

## One-time setup (you do this once, in your own Cloudflare account)

1. Sign up at <https://dash.cloudflare.com> (email + password, verify the email), then open **R2 Object Storage**
   and enable R2 (Cloudflare asks for a payment method; the free allowance of 10 GB is plenty for this).
2. In a terminal:

   ```sh
   cd cloud
   npm install
   npx wrangler login                      # opens the browser, log in to Cloudflare
   npx wrangler r2 bucket create spj-data  # the bucket that holds the data
   npx wrangler secret put SYNC_TOKEN      # type a long secret key when asked; this is the "cloud key"
   npx wrangler deploy                     # prints the address, e.g. https://spj-cloud.<account>.workers.dev
   ```

3. In the app: **Settings → Cloud backup**, enter that address and the cloud key, press **Connect**.
   Do the same on every device that should share the data.

## Behaviour

- Sync runs when the app opens, when it comes back to the screen, when the internet returns, and a few seconds
  after any change. **Settings → Cloud backup** shows the state.
- Records are merged by id, so nothing is overwritten. Two bills that got the same number on two devices are
  renumbered (the older keeps its number). Products and settings: the copy edited last wins.
- Data is never deleted from the cloud by the app. Turning the cloud off keeps everything on the device.

## Test it on your computer (no Cloudflare account needed)

```sh
npx wrangler dev --local --var SYNC_TOKEN:testkey --persist-to /tmp/spj-r2
```

then use `http://localhost:8787` and `testkey` in Settings → Cloud backup. `web/e2e/cloud.e2e.mjs` does this
automatically with two simulated devices.

## API (all calls need `Authorization: Bearer <key>`)

| Call | Meaning |
| --- | --- |
| `GET /v1/ping` | check address and key |
| `GET /v1/c/<history\|stock\|cash\|picks\|products\|settings>` | the stored document (`X-Etag` header) |
| `PUT /v1/c/<name>` + `If-Match: <etag>` (`none` for the first write) | store it; 412 if another device wrote first |
| `PUT /v1/p/<id>`, `GET /v1/p/<id>` | one photo |
