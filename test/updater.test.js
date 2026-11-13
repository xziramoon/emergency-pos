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
