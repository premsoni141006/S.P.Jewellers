// The only bridge between the page and the system. Exposes a fixed list of calls; the page
// never gets ipcRenderer, Node or Electron objects.

import { contextBridge, ipcRenderer } from 'electron';
import type { SpjApi } from './api';

const call = (channel: string, arg?: unknown) => ipcRenderer.invoke(channel, arg);

const api: SpjApi = {
  app: {
    info: () => call('app:info'),
    openBluetoothSettings: () => call('app:openBluetoothSettings'),
    openPrintersSettings: () => call('app:openPrintersSettings'),
  },
  settings: {
    get: () => call('settings:get'),
    save: (s) => call('settings:save', s),
  },
  products: {
    list: () => call('products:list'),
    save: (list) => call('products:save', list),
  },
  draft: {
    get: () => call('draft:get'),
    save: (est) => call('draft:save', est),
    saveNow: (est) => ipcRenderer.send('draft:saveNow', est),
  },
  estimates: {
    list: () => call('estimates:list'),
    get: (id) => call('estimates:get', id),
    save: (est) => call('estimates:save', est),
    delete: (id) => call('estimates:delete', id),
  },
  printers: {
    list: () => call('printers:list'),
    getConfig: () => call('printers:getConfig'),
    saveConfig: (c) => call('printers:saveConfig', c),
    check: (id) => call('printers:check', id),
  },
  print: {
    estimate: (id, force) => call('print:estimate', { id, force }),
    test: (force) => call('print:test', { force }),
    testEstimate: (force) => call('print:testEstimate', { force }),
  },
  preview: {
    pdf: (est) => call('preview:pdf', est),
    savePdf: (est) => call('preview:savePdf', est),
  },
};

contextBridge.exposeInMainWorld('spj', api);
