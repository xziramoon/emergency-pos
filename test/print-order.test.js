const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { confirmAndPrint } = require('../src/main/print');
const { CHANNELS, register } = require('../src/main/ipc');
const store = require('../src/main/store');
const Cart = require('../src/shared/cart');

const fish = { barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', unit: 'ชิ้น', price: 58 };
const newBill = () => Cart.toBill(Cart.addProduct([], fish), {
  machine: 'POS02', cashier: 'ตั้น', now: new Date(2026, 10, 12, 16, 20),
  payments: [{ method: 'cash', amount: 500 }], change: 442,
});

test('saves before printing', async () => {
  const calls = [];
  const r = await confirmAndPrint({
    bill: newBill(),
    saveBill: async (b) => { calls.push('save'); return { ...b, seq: 1001 }; },
    printReceipt: async () => { calls.push('print'); },
  });
  assert.deepEqual(calls, ['save', 'print']);
  assert.equal(r.printed, true);
  assert.equal(r.saved.seq, 1001);
});

test('print receives the saved bill (with seq), not the unsaved one', async () => {
  let printed;
  await confirmAndPrint({
    bill: newBill(),
    saveBill: async (b) => ({ ...b, seq: 7 }),
    printReceipt: async (b) => { printed = b; },
  });
  assert.equal(printed.seq, 7);
});

test('saveBill failure: print is never called and the error surfaces', async () => {
  let printCalled = false;
  await assert.rejects(
    confirmAndPrint({
      bill: newBill(),
      saveBill: async () => { throw new Error('disk full'); },
      printReceipt: async () => { printCalled = true; },
    }),
    /disk full/
  );
  assert.equal(printCalled, false);
});

test('print failure: bill stays saved, printed=false, error text returned', async () => {
  const r = await confirmAndPrint({
    bill: newBill(),
    saveBill: async (b) => ({ ...b, seq: 3 }),
    printReceipt: async () => { throw new Error('printer offline'); },
  });
  assert.equal(r.printed, false);
  assert.equal(r.saved.seq, 3);
  assert.match(r.error, /printer offline/);
});

// ---- through the IPC layer, with a real store on disk ----
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-'));
function fakeIpc() {
  const handlers = new Map();
  return { handle: (ch, fn) => handlers.set(ch, fn), handlers };
}
function ctx(dir, printHtml) {
  return { dir, state: { products: null }, reloadProducts() {}, getPrinters: async () => [], openFolder() {}, printHtml, openDrawerRaw: async () => {} };
}

test('IPC confirmBill: bill is on disk even when the printer throws', async () => {
  const dir = tmp();
  const ipc = fakeIpc();
  register(ipc, ctx(dir, async () => { throw new Error('no printer'); }));
  const r = await ipc.handlers.get(CHANNELS.confirmBill)({}, newBill());
  assert.equal(r.printed, false);
  assert.equal(store.listPending(dir).length, 1);
});

test('IPC confirmBill: prints HTML built from settings shop name to the chosen printer', async () => {
  const dir = tmp();
  store.saveSettings(dir, { ...store.loadSettings(dir), shopName: 'ร้านทดสอบ', printer: 'EPSON TM-T82III' });
  const seen = [];
  const ipc = fakeIpc();
  register(ipc, ctx(dir, async (html, device) => { seen.push({ html, device }); }));
  const r = await ipc.handlers.get(CHANNELS.confirmBill)({}, newBill());
  assert.equal(r.printed, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].device, 'EPSON TM-T82III');
  assert.ok(seen[0].html.includes('ร้านทดสอบ'));
  assert.ok(seen[0].html.includes('ใบเสร็จรับเงิน'));
});

test('IPC printReceipt (reprint) rejects with a Thai-readable error when the printer fails', async () => {
  const ipc = fakeIpc();
  register(ipc, ctx(tmp(), async () => { throw new Error('offline'); }));
  const r = await ipc.handlers.get(CHANNELS.printReceipt)({}, { ...newBill(), seq: 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /offline/);
});

test('IPC printTest prints a short test page', async () => {
  const seen = [];
  const ipc = fakeIpc();
  register(ipc, ctx(tmp(), async (html, device) => { seen.push({ html, device }); }));
  const r = await ipc.handlers.get(CHANNELS.printTest)({});
  assert.equal(r.ok, true);
  assert.ok(seen[0].html.includes('ทดสอบ'));
});
