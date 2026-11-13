const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setupAutoUpdate } = require('../src/main/updater');
const { refreshProducts } = require('../src/main/products-store');
const store = require('../src/main/store');

function fakeUpdater(checkImpl) {
  const handlers = {};
  return {
    autoDownload: undefined, autoInstallOnAppQuit: undefined, checks: 0,
    on(ev, fn) { handlers[ev] = fn; },
    emit(ev, ...a) { handlers[ev] && handlers[ev](...a); },
    async checkForUpdates() { this.checks++; return checkImpl ? checkImpl() : null; },
  };
}

test('not packaged (dev/test): never checks for updates', async () => {
  const u = fakeUpdater();
  await setupAutoUpdate({ autoUpdater: u, isPackaged: false });
  assert.equal(u.checks, 0);
});

test('packaged: downloads in background and installs only when the app quits (never mid-sale)', async () => {
  const u = fakeUpdater();
  await setupAutoUpdate({ autoUpdater: u, isPackaged: true });
  assert.equal(u.autoDownload, true);
  assert.equal(u.autoInstallOnAppQuit, true);
  assert.equal(u.checks, 1);
});

test('offline / update server error never throws or blocks selling', async () => {
  const logs = [];
  const u = fakeUpdater(() => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); });
  await assert.doesNotReject(setupAutoUpdate({ autoUpdater: u, isPackaged: true, log: (m) => logs.push(m) }));
  u.emit('error', new Error('boom')); // the event form must be swallowed too
  assert.ok(logs.length >= 1);
});

test('reports a downloaded update through onReady so the UI can say "restart to update"', async () => {
  let ready = null;
  const u = fakeUpdater();
  await setupAutoUpdate({ autoUpdater: u, isPackaged: true, onReady: (v) => { ready = v; } });
  u.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(ready, '0.2.0');
});

test('default settings carry no products URL (repo is public; URL is entered in Settings)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-'));
  assert.equal(store.loadSettings(dir).productsUrl, '');
});

test('refreshProducts with no URL fails politely without fetching', async () => {
  let called = false;
  const r = await refreshProducts({ url: '', dir: os.tmpdir(), columnMap: null, fetchText: async () => { called = true; return ''; } });
  assert.equal(r.ok, false);
  assert.match(r.error, /URL/);
  assert.equal(called, false);
});

test('update-available is reported so the UI can say "downloading new version"', async () => {
  let avail = null;
  const u = fakeUpdater();
  await setupAutoUpdate({ autoUpdater: u, isPackaged: true, onAvailable: (v) => { avail = v; } });
  u.emit('update-available', { version: '0.3.0' });
  assert.equal(avail, '0.3.0');
});

// ---- IPC: install / check / status ----
const { CHANNELS, register } = require('../src/main/ipc');
function fakeIpc() {
  const handlers = new Map();
  return { handle: (ch, fn) => handlers.set(ch, fn), handlers };
}
function ctx(extra = {}) {
  return {
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'epos-')), state: { products: null, update: { state: 'idle' } },
    reloadProducts() {}, getPrinters: async () => [], openFolder() {}, printHtml: async () => {}, openDrawerRaw: async () => {},
    version: '0.3.0', installUpdate: () => {}, checkUpdate: async () => {}, ...extra,
  };
}

test('IPC installUpdate restarts into the new version only when one is downloaded', async () => {
  let installed = 0;
  const ipc = fakeIpc();
  const c = ctx({ installUpdate: () => { installed++; } });
  register(ipc, c);
  const h = ipc.handlers.get(CHANNELS.installUpdate);
  assert.deepEqual(await h({}), { ok: false, error: 'ยังไม่มีเวอร์ชันใหม่ที่ดาวน์โหลดเสร็จ' });
  assert.equal(installed, 0);
  c.state.update = { state: 'ready', version: '0.3.0' };
  assert.deepEqual(await h({}), { ok: true });
  assert.equal(installed, 1);
});

test('IPC getUpdateStatus returns the current state and app version', async () => {
  const ipc = fakeIpc();
  const c = ctx();
  c.state.update = { state: 'downloading', version: '0.3.0' };
  register(ipc, c);
  assert.deepEqual(await ipc.handlers.get(CHANNELS.getUpdateStatus)({}), { state: 'downloading', version: '0.3.0', current: '0.3.0' });
});

test('IPC checkUpdate never throws when offline', async () => {
  const ipc = fakeIpc();
  register(ipc, ctx({ checkUpdate: async () => { throw new Error('ERR_INTERNET_DISCONNECTED'); } }));
  const r = await ipc.handlers.get(CHANNELS.checkUpdate)({});
  assert.equal(r.ok, false);
  assert.match(r.error, /DISCONNECTED/);
});
