'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getSettings: call('settings:get'),
  saveSettings: call('settings:save'),
  getProductsStatus: call('products:status'),
  refreshProducts: call('products:refresh'),
  findByBarcode: call('products:find'),
  searchByName: call('products:search'),
  saveBill: call('bills:save'),
  listPending: call('bills:pending'),
  listPrinters: call('system:printers'),
  openDataFolder: call('system:openDataFolder'),
  getWarnings: call('system:warnings'),
  confirmBill: call('bills:confirm'),
  printReceipt: call('print:receipt'),
  printTest: call('print:test'),
  openDrawer: call('print:drawer'),
  installUpdate: call('update:install'),
  getUpdateStatus: call('update:get'),
  checkUpdate: call('update:check'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  onWindowFocus: (cb) => ipcRenderer.on('window:focus', () => cb()),
});
