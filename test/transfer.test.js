const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src/main/store');
const { exportPending, importBills } = require('../src/main/transfer');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-xfer-'));
const mk = (extra = {}) => ({
  machine: 'POS02', createdAt: '2026-11-12T10:00:00+07:00', cashier: 'ตั้น',
  lines: [{ barcode: '111', qty: 1, manual: false, name: 'ก', price: 10, total: 10 }],
  total: 10, payments: [{ method: 'cash', amount: 10 }], change: 0,
  status: 'pending', sentCount: 0, sentAt: null, confirmedAt: null, void: null, ...extra,
});

function seeded() {
  const d = tmp();
  store.saveBill(d, mk());
  store.saveBill(d, mk({ createdAt: '2026-11-12T11:00:00+07:00', status: 'flagged', flagNote: 'ยอดต่าง' }));
  store.saveBill(d, mk({ createdAt: '2026-11-12T12:00:00+07:00', status: 'confirmed' }));
  store.saveBill(d, mk({ createdAt: '2026-11-13T09:00:00+07:00', status: 'void', void: { reason: 'x' } }));
  return d;
}

test('exportPending: writes only pending and flagged bills, returns the count', () => {
  const d = seeded();
  const f = path.join(tmp(), 'out.json');
  assert.equal(exportPending(d, f), 2);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(data.bills.length, 2);
  assert.deepEqual(data.bills.map((x) => x.status).sort(), ['flagged', 'pending']);
});

test('exportPending: a sending bill is exported as pending (the typing is not portable)', () => {
  const d = tmp();
  store.saveBill(d, mk({ status: 'sending', sentCount: 1 }));
  const f = path.join(tmp(), 'o.json');
  exportPending(d, f);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(data.bills[0].status, 'pending');
  assert.equal(data.bills[0].sentCount, 0);
});

test('import: 2 exported bills into a fresh dir -> added 2; again -> added 0 skipped 2', () => {
  const src = seeded();
  const f = path.join(tmp(), 'out.json');
  exportPending(src, f);
  const dst = tmp();
  assert.deepEqual(importBills(dst, f), { added: 2, skipped: 0 });
  assert.deepEqual(importBills(dst, f), { added: 0, skipped: 2 });
  assert.equal(store.listPending(dst).length, 2);
});

test('import: keeps the source machine id and the bill content; status flagged stays flagged', () => {
  const src = seeded();
  const f = path.join(tmp(), 'out.json');
  exportPending(src, f);
  const dst = tmp();
  importBills(dst, f);
  const got = store.listPending(dst);
  assert.ok(got.every((x) => x.machine === 'POS02'));
  assert.deepEqual(got.map((x) => x.status).sort(), ['flagged', 'pending']);
  assert.equal(got.find((x) => x.status === 'flagged').flagNote, 'ยอดต่าง');
  assert.equal(got[0].total, 10);
});

test('import: imported bills never collide with this machine seq (own bills untouched)', () => {
  const src = seeded();
  const f = path.join(tmp(), 'out.json');
  exportPending(src, f);
  const dst = tmp();
  const own = store.saveBill(dst, mk({ machine: 'POS01' })); // seq 1 on 2026-11-12 already used here
  importBills(dst, f);
  const all = store.listBills(dst, '2026-11-12');
  assert.equal(new Set(all.map((x) => x.seq)).size, all.length);
  assert.equal(all.find((x) => x.seq === own.seq).machine, 'POS01');
  assert.equal(all.length, 3);
});

test('import: the same machine+date+seq from a second file is a duplicate (key survives renumbering)', () => {
  const src = seeded();
  const f1 = path.join(tmp(), 'a.json');
  exportPending(src, f1);
  const dst = tmp();
  importBills(dst, f1);
  store.saveBill(dst, mk({ machine: 'POS01' }));       // local bill shifts the next local seq
  const f2 = path.join(tmp(), 'b.json');
  exportPending(src, f2);
  assert.deepEqual(importBills(dst, f2), { added: 0, skipped: 2 });
});

test('import: importing this machine own export is all skipped', () => {
  const d = seeded();
  const f = path.join(tmp(), 'o.json');
  exportPending(d, f);
  assert.deepEqual(importBills(d, f), { added: 0, skipped: 2 });
});

test('import: same seq number from two different machines are both added', () => {
  const a = tmp(); store.saveBill(a, mk({ machine: 'POS01' }));
  const b = tmp(); store.saveBill(b, mk({ machine: 'POS02' }));
  const fa = path.join(tmp(), 'a.json'); const fb = path.join(tmp(), 'b.json');
  exportPending(a, fa); exportPending(b, fb);
  const dst = tmp();
  assert.deepEqual(importBills(dst, fa), { added: 1, skipped: 0 });
  assert.deepEqual(importBills(dst, fb), { added: 1, skipped: 0 });
});

test('import: broken JSON throws a readable Thai message and touches nothing', () => {
  const dst = tmp();
  store.saveBill(dst, mk());
  const before = fs.readFileSync(path.join(dst, 'bills', '2026-11-12.json'), 'utf8');
  const f = path.join(tmp(), 'bad.json');
  fs.writeFileSync(f, '{ not json');
  assert.throws(() => importBills(dst, f), /ไฟล์.*(อ่าน|เสีย)/);
  assert.equal(fs.readFileSync(path.join(dst, 'bills', '2026-11-12.json'), 'utf8'), before);
});

test('import: valid JSON of the wrong shape is refused; one bad bill refuses the whole file', () => {
  const dst = tmp();
  const f = path.join(tmp(), 'x.json');
  fs.writeFileSync(f, JSON.stringify({ hello: 1 }));
  assert.throws(() => importBills(dst, f), /ไม่ใช่ไฟล์บิล/);
  fs.writeFileSync(f, JSON.stringify({ format: 'emergency-pos-bills', version: 1, bills: [mk(), { nope: true }] }));
  assert.throws(() => importBills(dst, f), /บิล/);
  assert.equal(fs.existsSync(path.join(dst, 'bills')), false);
});

test('import: a missing file is a readable error', () => {
  assert.throws(() => importBills(tmp(), path.join(tmp(), 'none.json')), /ไม่พบไฟล์|อ่านไฟล์/);
});

test('import: imported pending bills can be found for sending (status machine unaffected)', () => {
  const src = seeded();
  const f = path.join(tmp(), 'o.json');
  exportPending(src, f);
  const dst = tmp();
  importBills(dst, f);
  const b = store.listPending(dst).find((x) => x.status === 'pending');
  assert.equal(b.sentCount, 0);
  assert.ok(b.seq >= 1);
  assert.ok(b.importedFrom);
});
