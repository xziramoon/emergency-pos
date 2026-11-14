'use strict';
// IPC contract. Keep this file free of `electron` imports so it can be unit-tested.
const store = require('./store');
const { refreshProducts } = require('./products-store');
const { findByBarcode, searchByName } = require('../shared/products');
const { confirmAndPrint } = require('./print');
const { buildReceipt, renderReceiptHtml } = require('../shared/receipt');
const billops = require('./billops');

const CHANNELS = {
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  productsStatus: 'products:status',
  refreshProducts: 'products:refresh',
  findByBarcode: 'products:find',
  searchByName: 'products:search',
  saveBill: 'bills:save',
  listPending: 'bills:pending',
  listPrinters: 'system:printers',
  openDataFolder: 'system:openDataFolder',
  getWarnings: 'system:warnings',
  confirmBill: 'bills:confirm',
  printReceipt: 'print:receipt',
  printTest: 'print:test',
  openDrawer: 'print:drawer',
  installUpdate: 'update:install',
  getUpdateStatus: 'update:get',
  checkUpdate: 'update:check',
  listBills: 'bills:list',
  sendBill: 'bills:send',
  resumeBill: 'bills:resume',
};

// Main -> renderer push (not an invoke channel): { state: 'idle'|'downloading'|'ready', version }
const UPDATE_EVENT = 'update:status';
// Main -> renderer push while the typer runs: { date, seq, typed, total }
const SEND_PROGRESS_EVENT = 'send:progress';

// ctx: { dir, state:{products}, reloadProducts(), getPrinters(), openFolder(), printHtml(html, device), openDrawerRaw(device) }
function register(ipc, ctx) {
  const status = () => {
    const p = ctx.state.products;
    return p
      ? { count: p.index.count, updatedAt: p.updatedAt, stale: p.stale }
      : { count: 0, updatedAt: null, stale: true };
  };

  ipc.handle(CHANNELS.getSettings, () => store.loadSettings(ctx.dir));
  ipc.handle(CHANNELS.saveSettings, (_e, s) => { store.saveSettings(ctx.dir, s); return s; });
  ipc.handle(CHANNELS.productsStatus, () => status());
  ipc.handle(CHANNELS.refreshProducts, async () => {
    const s = store.loadSettings(ctx.dir);
    const r = await refreshProducts({ url: s.productsUrl, dir: ctx.dir, columnMap: s.columnMap });
    if (r.ok) ctx.reloadProducts();
    return { ...status(), ok: r.ok, error: r.error };
  });
  ipc.handle(CHANNELS.findByBarcode, (_e, code) =>
    ctx.state.products ? findByBarcode(ctx.state.products.index, code) : null);
  ipc.handle(CHANNELS.searchByName, (_e, q) =>
    ctx.state.products ? searchByName(ctx.state.products.index, q, 30) : []);
  ipc.handle(CHANNELS.saveBill, (_e, bill) => store.saveBill(ctx.dir, bill));
  ipc.handle(CHANNELS.listPending, () => store.listPending(ctx.dir));
  ipc.handle(CHANNELS.listPrinters, () => ctx.getPrinters());
  ipc.handle(CHANNELS.getWarnings, () => store.getWarnings());
  const receiptHtml = (bill) => renderReceiptHtml(buildReceipt(bill, { shopName: store.loadSettings(ctx.dir).shopName }));
  const printReceipt = (bill) => ctx.printHtml(receiptHtml(bill), store.loadSettings(ctx.dir).printer);
  const asResult = async (fn) => { try { await fn(); return { ok: true }; } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; } };

  // Save first, then print (spec 6.3). A save failure rejects; a print failure comes back as printed:false.
  ipc.handle(CHANNELS.confirmBill, (_e, bill) => confirmAndPrint({
    bill, saveBill: (b) => store.saveBill(ctx.dir, b), printReceipt,
  }));
  ipc.handle(CHANNELS.printReceipt, (_e, bill) => asResult(() => printReceipt(bill)));
  ipc.handle(CHANNELS.printTest, () => asResult(() => ctx.printHtml(
    '<!doctype html><meta charset="utf-8"><body style="font:14pt Tahoma;width:72mm;margin:0 4mm"><p>ทดสอบเครื่องพิมพ์</p><p>POS ฉุกเฉิน</p></body>',
    store.loadSettings(ctx.dir).printer)));
  ipc.handle(CHANNELS.openDrawer, () => asResult(() => ctx.openDrawerRaw(store.loadSettings(ctx.dir).printer)));
  // Update flow: the renderer shows a banner; installing restarts the app, so only when a download is complete.
  ipc.handle(CHANNELS.getUpdateStatus, () => ({ ...ctx.state.update, current: ctx.version }));
  ipc.handle(CHANNELS.installUpdate, () => {
    if (!ctx.state.update || ctx.state.update.state !== 'ready') return { ok: false, error: 'ยังไม่มีเวอร์ชันใหม่ที่ดาวน์โหลดเสร็จ' };
    ctx.installUpdate();
    return { ok: true };
  });
  ipc.handle(CHANNELS.checkUpdate, () => asResult(() => ctx.checkUpdate()));
  ipc.handle(CHANNELS.openDataFolder, () => { ctx.openFolder(); });

  // Bills screen (spec 6.5). filter: 'open' (not confirmed/void), 'sent' (typed/confirmed), 'void', 'all'. Oldest first.
  ipc.handle(CHANNELS.listBills, (_e, filter = 'open') => {
    const keep = {
      open: (b) => b.status !== 'confirmed' && b.status !== 'void',
      sent: (b) => b.status === 'typed' || b.status === 'confirmed',
      void: (b) => b.status === 'void',
      all: () => true,
    }[filter] || (() => true);
    const out = [];
    for (const date of store.allDates(ctx.dir)) for (const b of store.listBills(ctx.dir, date)) if (keep(b)) out.push({ ...b, date });
    return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  });
  const sendOpts = (date, seq) => ({
    dir: ctx.dir, date, seq, settings: store.loadSettings(ctx.dir), script: ctx.typerScript, runTyper: ctx.runTyper,
    notify: (p) => { if (ctx.notify) ctx.notify(SEND_PROGRESS_EVENT, p); },
  });
  const afterSend = (r, date, seq) => { if (r.ok && r.done && ctx.onTyped) ctx.onTyped(date, seq, r.bill); return r; };
  ipc.handle(CHANNELS.sendBill, async (_e, date, seq) => afterSend(await billops.sendBill(sendOpts(date, seq)), date, seq));
  ipc.handle(CHANNELS.resumeBill, async (_e, date, seq) => afterSend(await billops.resumeBill(sendOpts(date, seq)), date, seq));
}

module.exports = { CHANNELS, UPDATE_EVENT, SEND_PROGRESS_EVENT, register };
