const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CHANNELS, register } = require('../src/main/ipc');
const { buildIndex } = require('../src/shared/products');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-'));

function fakeIpc() {
  const handlers = new Map();
  return { handle: (ch, fn) => handlers.set(ch, fn), handlers };
}

function ctxWith(dir) {
  const index = buildIndex(
    [['8850000000001', 'ปลากระป๋อง', 'ชิ้น', '58'], ['8850000000002', 'น้ำดื่ม', 'ขวด', '7']],
    { barcode: 0, name: 1, unit: 2, price: 3 }
  );
  return {
    dir,
    state: { products: { index, updatedAt: '2026-11-13T00:00:00.000Z', stale: false } },
    reloadProducts: () => {},
    getPrinters: async () => [{ name: 'EPSON TM-T82III' }],
    openFolder: () => {},
  };
}

test('every channel has a handler', () => {
  const ipc = fakeIpc();
  register(ipc, ctxWith(tmp()));
  for (const ch of Object.values(CHANNELS)) assert.ok(ipc.handlers.has(ch), 'missing handler ' + ch);
});

test('every channel is exposed by preload.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8');
  for (const ch of Object.values(CHANNELS)) assert.ok(src.includes("'" + ch + "'"), 'preload missing ' + ch);
});

test('findByBarcode returns the product or null', async () => {
  const ipc = fakeIpc();
  register(ipc, ctxWith(tmp()));
  const h = ipc.handlers.get(CHANNELS.findByBarcode);
  assert.equal((await h({}, '8850000000001')).name, 'ปลากระป๋อง');
  assert.equal(await h({}, '000'), null);
});

test('saveBill persists to disk before returning and listPending sees it', async () => {
  const d = tmp();
  const ipc = fakeIpc();
  register(ipc, ctxWith(d));
  const bill = {
    machine: 'POS02', createdAt: '2026-11-13T10:00:00+07:00', cashier: 'ตั้น', lines: [], total: 0,
    payments: [], change: 0, status: 'pending', sentCount: 0, sentAt: null, confirmedAt: null, void: null,
  };
  const saved = await ipc.handlers.get(CHANNELS.saveBill)({}, bill);
  assert.equal(saved.seq, 1);
  assert.equal((await ipc.handlers.get(CHANNELS.listPending)({})).length, 1);
});

test('warnings channel returns an array', async () => {
  const ipc = fakeIpc();
  register(ipc, ctxWith(tmp()));
  assert.ok(Array.isArray(await ipc.handlers.get(CHANNELS.getWarnings)({})));
});

test('products status reports count and staleness', async () => {
  const ipc = fakeIpc();
  register(ipc, ctxWith(tmp()));
  const s = await ipc.handlers.get(CHANNELS.productsStatus)({});
  assert.deepEqual(s, { count: 2, updatedAt: '2026-11-13T00:00:00.000Z', stale: false });
});

test('settings round trip through ipc', async () => {
  const ipc = fakeIpc();
  register(ipc, ctxWith(tmp()));
  const cur = await ipc.handlers.get(CHANNELS.getSettings)({});
  await ipc.handlers.get(CHANNELS.saveSettings)({}, { ...cur, staff: ['ตั้น', 'แอน'] });
  assert.deepEqual((await ipc.handlers.get(CHANNELS.getSettings)({})).staff, ['ตั้น', 'แอน']);
});
