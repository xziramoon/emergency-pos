const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src/main/store');
const ops = require('../src/main/billops');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-ops-'));
const DATE = '2026-11-12';
const mk = (extra = {}) => ({
  machine: 'POS02', createdAt: DATE + 'T10:00:00+07:00', cashier: 'ตั้น',
  lines: [{ barcode: '111', qty: 2, manual: false, name: 'ก', price: 10, total: 20 }, { barcode: '', qty: 1, manual: true, name: 'คีย์เอง', price: 5, total: 5 }, { barcode: '222', qty: 1, manual: false, name: 'ข', price: 7, total: 7 }],
  total: 32, payments: [{ method: 'cash', amount: 50 }], change: 18,
  status: 'pending', sentCount: 0, sentAt: null, confirmedAt: null, void: null, ...extra,
});
const settings = { delayMs: 600, windowLike: '*Sea And Hill POS*' };
const seed = (extra) => { const d = tmp(); const b = store.saveBill(d, mk(extra)); return { d, seq: b.seq }; };
const get = (d, seq) => store.listBills(d, DATE).find((b) => b.seq === seq);

// Fake runTyper that "types" n items then finishes or stops.
const fakeTyper = ({ stopAfter, reason = 'foreground-changed' } = {}) => async ({ list, onProgress, onStop }) => {
  const n = stopAfter === undefined ? list.length : stopAfter;
  for (let i = 0; i < n; i++) onProgress(i + 1, list[i]);
  if (stopAfter !== undefined && stopAfter < list.length) { if (onStop) onStop(n, reason); return { done: false, typed: n, reason, lastBarcode: list[n - 1] }; }
  return { done: true, typed: n, lastBarcode: list[n - 1] };
};

test('sendBill: types every non-manual barcode, ends as typed with sentCount/sentAt', async () => {
  const { d, seq } = seed();
  const seenStatus = [];
  const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async (o) => { seenStatus.push(get(d, seq).status); return fakeTyper()(o); } });
  assert.deepEqual(seenStatus, ['sending']);
  assert.equal(r.ok, true); assert.equal(r.done, true);
  const b = get(d, seq);
  assert.equal(b.status, 'typed'); assert.equal(b.sentCount, 3); assert.ok(b.sentAt);
});

test('sendBill: progress is written to disk as it happens', async () => {
  const { d, seq } = seed();
  const counts = [];
  await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async (o) => fakeTyper()({ ...o, onProgress: (n, bc) => { o.onProgress(n, bc); counts.push(get(d, seq).sentCount); } }) });
  assert.deepEqual(counts, [1, 2, 3]);
});

test('sendBill: a stop returns the bill to pending with the typed count, last barcode and a Thai message', async () => {
  const { d, seq } = seed();
  const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: fakeTyper({ stopAfter: 2 }) });
  assert.equal(r.ok, true); assert.equal(r.done, false);
  assert.equal(r.typed, 2); assert.equal(r.lastBarcode, '111'); assert.equal(r.total, 3);
  assert.match(r.message, /2 รายการ/);
  const b = get(d, seq);
  assert.equal(b.status, 'pending'); assert.equal(b.sentCount, 2);
});

test('resumeBill: continues from sentCount, typing only the remaining barcodes', async () => {
  const { d, seq } = seed();
  await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: fakeTyper({ stopAfter: 2 }) });
  let typedList;
  const r = await ops.resumeBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async (o) => { typedList = o.list; return fakeTyper()(o); } });
  assert.deepEqual(typedList, ['222']);
  assert.equal(r.done, true);
  const b = get(d, seq);
  assert.equal(b.status, 'typed'); assert.equal(b.sentCount, 3);
});

test('sendBill on a pending bill restarts from zero even if sentCount was left over', async () => {
  const { d, seq } = seed({ sentCount: 2 });
  let list;
  await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async (o) => { list = o.list; return fakeTyper()(o); } });
  assert.deepEqual(list, ['111', '111', '222']);
});

test('sendBill on a flagged bill re-sends from the start (flagged -> pending -> sending)', async () => {
  const { d, seq } = seed({ status: 'flagged', sentCount: 3 });
  const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: fakeTyper() });
  assert.equal(r.done, true);
  assert.equal(get(d, seq).status, 'typed');
});

test('sendBill refuses confirmed / void / typed bills and never calls the typer', async () => {
  for (const status of ['confirmed', 'void', 'typed']) {
    const { d, seq } = seed({ status });
    let called = false;
    const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async () => { called = true; return { done: true, typed: 0 }; } });
    assert.equal(r.ok, false, status);
    assert.equal(called, false, status);
    assert.equal(get(d, seq).status, status);
  }
});

test('sendBill: a bill with nothing typeable (all manual) is refused with a Thai message', async () => {
  const { d, seq } = seed({ lines: [{ barcode: '', qty: 1, manual: true, name: 'x', price: 1, total: 1 }] });
  const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: fakeTyper() });
  assert.equal(r.ok, false);
  assert.match(r.error, /คีย์เอง|ไม่มีบาร์โค้ด/);
});

test('only one send at a time', async () => {
  const a = seed(); const b = seed();
  let release; const gate = new Promise((r) => { release = r; });
  const slow = async (o) => { await gate; return fakeTyper()(o); };
  const first = ops.sendBill({ dir: a.d, date: DATE, seq: a.seq, settings, script: 'x', runTyper: slow });
  const second = await ops.sendBill({ dir: b.d, date: DATE, seq: b.seq, settings, script: 'x', runTyper: fakeTyper() });
  assert.equal(second.ok, false);
  assert.match(second.error, /กำลังส่ง/);
  release();
  await first;
});

test('a typer that throws puts the bill back to pending and reports the error', async () => {
  const { d, seq } = seed();
  const r = await ops.sendBill({ dir: d, date: DATE, seq, settings, script: 'x', runTyper: async () => { throw new Error('boom'); } });
  assert.equal(r.ok, false);
  assert.equal(get(d, seq).status, 'pending');
});

test('recoverSending warns to check the last barcode when a bill had already typed some', () => {
  const d = tmp();
  store.clearWarnings();
  store.saveBill(d, mk({ status: 'sending', sentCount: 2 }));
  assert.equal(store.recoverSending(d), 1);
  const w = store.getWarnings();
  assert.ok(w.some((x) => /ตรวจรายการสุดท้าย/.test(x)), JSON.stringify(w));
  store.clearWarnings();
});
