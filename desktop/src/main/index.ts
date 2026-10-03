import { BrowserWindow, Menu, app, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './db';
import { registerIpc } from './ipc';
import { PrintService } from './printing/service';

const DEV_URL = process.env.ELECTRON_RENDERER_URL;
let mainWindow: BrowserWindow | null = null;

function isTrustedUrl(url: string): boolean {
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'file:' && path.normalize(decodeURIComponent(u.pathname)).replace(/^\\/, '').endsWith(path.join('renderer', 'index.html'));
  } catch {
    return false;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f2ef',
    title: 'S.P. Jewellers — Estimates',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Built-in PDF viewer, used by Print Preview to show the exact PDF that is printed.
      plugins: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await app.whenReady();
  if (!DEV_URL) Menu.setApplicationMenu(null);

  // No camera, microphone, notifications, etc. for any page.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const dataDir = process.env.SPJ_DATA_DIR || app.getPath('userData');
  const wasm = fs.readFileSync(path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
  const store = await Store.open(dataDir, wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  const printer = new PrintService(store, () => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is closed');
    return mainWindow.webContents;
  });
  registerIpc({ store, printer, isTrustedUrl, version: app.getVersion() });

  mainWindow = createWindow();
  mainWindow.on('closed', () => (mainWindow = null));

  app.on('window-all-closed', () => {
    store.close();
    app.quit();
  });
}

void main();
