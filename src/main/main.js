'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const store = require('./store');
const { loadProducts, refreshProducts } = require('./products-store');
const { register } = require('./ipc');
const { printHtml, openDrawerRaw } = require('./print');
const { setupAutoUpdate } = require('./updater');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const dir = app.getPath('userData');
  const state = { products: null };
  let win = null;

  const reloadProducts = () => { state.products = loadProducts(dir); };

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // the default menu would grab F11 (fullscreen); F11 is "รับเงิน"
    try { store.recoverSending(dir); } catch (e) { console.error('recoverSending failed', e); } // must never stop the window opening
    reloadProducts();

    register(ipcMain, {
      dir,
      state,
      reloadProducts,
      getPrinters: () => win.webContents.getPrintersAsync(),
      openFolder: () => shell.openPath(dir),
      printHtml,
      openDrawerRaw,
    });

    win = new BrowserWindow({
      width: 1280,
      height: 800,
      autoHideMenuBar: true,
      title: 'POS ฉุกเฉิน',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.maximize();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Refresh the product list in the background; never blocks selling.
    const s = store.loadSettings(dir);
    refreshProducts({ url: s.productsUrl, dir, columnMap: s.columnMap }).then((r) => {
      if (r.ok) reloadProducts();
    });

    // Check GitHub Releases shortly after start (and every 6 h); installs on next quit, never mid-sale.
    const { autoUpdater } = require('electron-updater');
    setTimeout(() => setupAutoUpdate({ autoUpdater, isPackaged: app.isPackaged, log: (x) => console.error(x) }), 15000);
    setInterval(() => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 3600 * 1000);

    setInterval(() => { try { store.makeBackup(dir, new Date()); } catch { /* keep selling */ } }, 30 * 60 * 1000);
  });

  app.on('before-quit', () => {
    try { store.makeBackup(dir, new Date()); } catch { /* ignore */ }
  });
  app.on('window-all-closed', () => app.quit());
}
