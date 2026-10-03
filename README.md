# S.P. Jewellers – estimates, stock and cash

Mobile-first app for a jewellery shop: make bills, print or save them as an image / PDF, keep a Silver/Gold stock
register and a cash register. Works offline.

| Folder | What it is |
| --- | --- |
| `web/` | The app (Vite + React + TypeScript). This is the website **and** what runs inside the Android app. |
| `shared/` | Pure TypeScript used by every part: bill maths, the printed bill layout, search, stock, PDF writer. |
| `mobile/` | Android app (Capacitor) that wraps `web/` and adds native printing, Bluetooth printers and saving files. |
| `desktop/` | Windows desktop app (Electron). |

## Run the website

```
cd web
npm ci
npm run dev        # http://localhost:5173
npm run build      # production build in web/dist
```

## Deploy the website on Vercel

1. Import this repository in Vercel.
2. **Root Directory:** `web`.
3. Keep **Include source files outside of the Root Directory** switched on (the app imports `../shared`).
4. Framework preset: Vite. Build command `npm run build`, output `dist` (already set in `web/vercel.json`).

## Build the Android app

```
cd web && npm ci && npm run build
cd ../mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleDebug      # needs JDK 21 and the Android SDK
```
