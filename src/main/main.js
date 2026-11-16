'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const store = require('./store');
const { loadProducts, refreshProducts } = require('./products-store');
const { register } = require('./ipc');
const { printHtml, openDrawerRaw } = require('./print');
const { runTyper } = require('./typer');
const { createController } = require('./printserver');
const { buildReceipt, renderReceiptHtml, buildTestSlip } = require('../shared/receipt');
const { screen } = require('electron');
const { setupAutoUpdate } = require('./updater');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const dir = app.getPath('userData');
  const state = { products: null, update: { state: 'idle' } };
  let win = null;

  // Small always-on-top window for comparing totals with the main POS (spec 6.7). Shown without taking focus
  // so the cashier can keep working in Sea & Hill; it sits in the top-right corner (draggable).
  let reconcileWin = null;
  function openReconcile(date, seq) {
    if (reconcileWin && !reconcileWin.isDestroyed()) reconcileWin.close();
    const wa = screen.getPrimaryDisplay().workArea;
    const w = 380; const h = 720;
    reconcileWin = new BrowserWindow({
      width: w, height: h, x: wa.x + wa.width - w - 12, y: wa.y + 12,
      show: false, alwaysOnTop: true, autoHideMenuBar: true, minimizable: false, maximizable: false, title: 'เทียบยอด',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    reconcileWin.setAlwaysOnTop(true, 'floating');
    reconcileWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    reconcileWin.webContents.on('will-navigate', (e) => e.preventDefault());
    reconcileWin.loadFile(path.join(__dirname, '../renderer/reconcile.html'), { query: { date, seq: String(seq) } });
    reconcileWin.once('ready-to-show', () => reconcileWin.showInactive());
  }

  const reloadProducts = () => { state.products = loadProducts(dir); };

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // the default menu would grab F11 (fullscreen); F11 is "รับเงิน"
    try { store.recoverSending(dir); } catch (e) { console.error('recoverSending failed', e); } // must never stop the window opening
    reloadProducts();

    // Print relay for phones on the shop network (design 5.3). Off until switched on in Settings.
    const lanAddresses = () => Object.values(require('node:os').networkInterfaces()).flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    // The hidden print window can pull OS focus away from the main window; hand it back so scans keep landing.
    const focusSafePrint = async (...a) => {
      const had = win && !win.isDestroyed() && win.isFocused();
      try { return await printHtml(...a); } finally {
        if (had && win && !win.isDestroyed()) { win.focus(); win.webContents.focus(); }
      }
    };
    const relayPrint = async (bill) => {
      const st = store.loadSettings(dir);
      await focusSafePrint(renderReceiptHtml(buildReceipt(bill, { shopName: st.shopName })), st.printer);
    };
    const printServer = createController({
      loadSettings: () => store.loadSettings(dir), saveSettings: (s) => store.saveSettings(dir, s),
      print: relayPrint,
      printTest: () => focusSafePrint(renderReceiptHtml(buildTestSlip('จากมือถือ')), store.loadSettings(dir).printer),
      addresses: lanAddresses,
      qr: (text) => { const q = require('qrcode-generator')(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); },
    });
    printServer.init().catch((e) => console.error('print server init failed', e));

    register(ipcMain, {
      dir,
      printServer,
      state,
      reloadProducts,
      getPrinters: () => win.webContents.getPrintersAsync(),
      openFolder: () => shell.openPath(dir),
      printHtml: focusSafePrint,
      openDrawerRaw,
      // Typer script is not inside the asar (powershell cannot run from it): see extraResources in package.json.
      typerScript: app.isPackaged ? path.join(process.resourcesPath, 'resources', 'pos-type.ps1') : path.join(__dirname, '../../resources/pos-type.ps1'),
      runTyper,
      chooseExportFile: async () => {
        const stamp = new Date().toISOString().slice(0, 10);
        const r = await dialog.showSaveDialog(win, { title: 'ส่งออกบิลค้างส่ง', defaultPath: `bills-${store.loadSettings(dir).machineId}-${stamp}.json`, filters: [{ name: 'ไฟล์บิล', extensions: ['json'] }] });
        return r.canceled ? null : r.filePath;
      },
      chooseImportFile: async () => {
        const r = await dialog.showOpenDialog(win, { title: 'นำเข้าบิลจากอีกเครื่อง', properties: ['openFile'], filters: [{ name: 'ไฟล์บิล', extensions: ['json'] }] });
        return r.canceled ? null : r.filePaths[0];
      },
      openReconcile: (date, seq) => openReconcile(date, seq),
      onTyped: (date, seq) => openReconcile(date, seq),
      notify: (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); },
      version: app.getVersion(),
      installUpdate: () => require('electron-updater').autoUpdater.quitAndInstall(false, true),
      checkUpdate: async () => {
        if (!app.isPackaged) throw new Error('ตรวจเวอร์ชันได้เฉพาะโปรแกรมที่ติดตั้งแล้ว');
        await require('electron-updater').autoUpdater.checkForUpdates();
      },
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
    win.on('focus', () => { if (!win.isDestroyed()) win.webContents.send('window:focus'); });
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
    const push = (s) => { state.update = s; if (win && !win.isDestroyed()) win.webContents.send('update:status', { ...s, current: app.getVersion() }); };
    setTimeout(() => setupAutoUpdate({
      autoUpdater, isPackaged: app.isPackaged, log: (x) => console.error(x),
      onAvailable: (v) => push({ state: 'downloading', version: v }),
      onReady: (v) => push({ state: 'ready', version: v }),
    }), 15000);
    setInterval(() => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 3600 * 1000);

    setInterval(() => { try { store.makeBackup(dir, new Date()); } catch { /* keep selling */ } }, 30 * 60 * 1000);
  });

  app.on('before-quit', () => {    try { store.makeBackup(dir, new Date()); } catch { /* ignore */ }
  });
  app.on('window-all-closed', () => app.quit());
}
