# S.P. Jewellers — website (mobile-first PWA)

The phone version of the S.P. Jewellers estimate app. It does the same work as the Windows
desktop app (estimates, ten-column print, history, printer test, settings) and uses the same
calculations and the same A4 print template from `../shared/src`.

Everything runs in the browser and is stored on the device (`localStorage`). There is no
server and no login. After the first visit it also works offline.

## Commands

```bash
cd web
npm install
npm run dev        # http://localhost:5173 (open on a phone via your LAN IP: npm run dev -- --host)
npm run build      # type-check + production build into web/dist
npm run preview    # serve the production build at http://localhost:4173
```

If `npm install` says esbuild's install script was blocked (npm 11):
`npm approve-scripts esbuild && npm rebuild esbuild`.

## Deploying

`web/dist` is a plain static site. You can host it on any static host (Vercel, Netlify,
Cloudflare Pages, nginx). It must be served over **https**: browsers allow service workers
and Web Bluetooth only on https (and on `localhost`).

- Build command: `npm run build`
- Output folder: `dist`
- The app has a single page, so no rewrites are needed.

After a release that changes `public/sw.js`, bump `VERSION` in it so old caches are dropped.
Hashed JS/CSS files update by themselves.

## Install on a phone

- Android (Chrome): open the site, then use the menu → **Install app** / **Add to Home screen**.
- iPhone (Safari): Share → **Add to Home Screen**.

The installed app opens full-screen like a normal app and works without internet.

## Printing from a phone

The Printer tab has two modes.

### 1. System printer (A4) — default

Print opens the phone's or computer's **print dialog**, with the same A4 estimate that Preview shows.

1. First pair the printer with the phone in **Settings → Bluetooth**, or connect it by Wi-Fi or USB.
   For a printer that supports it, Android needs the maker's print service plugin (e.g. HP, Canon, Epson).
   iPhone needs an AirPrint printer.
2. Tap **Print** and choose the printer in the dialog.
3. Set paper to **A4** and scale to **100% / Actual size**. Turn off "headers and footers".

A website cannot choose a printer by itself or print without showing the dialog. For one-tap
printing to a remembered printer, use the Windows desktop app. After the dialog closes, the
app marks the estimate as printed ("Sent to the print dialog"). The browser does not tell a
website whether the paper actually came out.

### 2. Bluetooth thermal printer (ESC/POS)

This mode talks directly to 58 mm and 80 mm Bluetooth receipt printers through **Web Bluetooth**.

| Browser | Works? |
|---|---|
| Chrome / Edge on Android | Yes |
| Chrome / Edge on Windows, macOS, ChromeOS | Yes |
| Any browser on iPhone / iPad | **No** (Apple does not allow Web Bluetooth) — use System printer |
| Firefox, Safari | **No** |

- Web Bluetooth only sees **Bluetooth Low Energy (BLE)** printers. Many cheap thermal printers
  have BLE. Printers that use only classic Bluetooth (SPP) do not show up in the list. Use System
  printer or the Windows desktop app for those.
- **Choose printer** opens the browser's device list. After a reload, Chrome can reconnect to the
  same printer without the list when `getDevices()` is available. Otherwise you are asked to choose again.
- The thermal printout uses the same header and the same ten fields per item, laid out for narrow paper.
- If printing fails, the real reason is shown (not switched on, out of range, not an ESC/POS
  printer, and so on) with a **Retry** button.

**Test Print** prints the shop name, "Printer Test Successful", and the date and time.
**Print Test Estimate** prints a sample estimate without saving it.

## Data

| Key | Contents |
|---|---|
| `spj.draft.v1` | The estimate being edited. It is saved automatically about 0.4 s after each change and when the tab is hidden. |
| `spj.history.v1` | Saved and printed estimates |
| `spj.nextNo.v1` | Next estimate number (E-0001, E-0002 …) |
| `spj.settings.v1` | Shop settings and default rates |
| `spj.products.v1` | Product list (Description suggestions) |
| `spj.printer.v1` | Print mode, paper width, last Bluetooth printer |

Clearing the browser's site data deletes all of this. Data does not sync between devices.
