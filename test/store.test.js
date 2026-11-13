const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-'));
const mk = (createdAt, extra = {}) => ({
  machine: 'POS02', createdAt, cashier: 'ตั้น', lines: [], total: 10,
  payments: [{ method: 'cash', amount: 10 }], change: 0,
  status: 'pending', sentCount: 0, sentAt: null, confirmedAt: null, void: null, ...extra,
});

test('atomicWriteJson leaves no tmp file and replaces content', () => {
  const d = tmp(); const f = path.join(d, 'a.json');
  S.atomicWriteJson(f, { v: 1 });
  S.atomicWriteJson(f, { v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { v: 2 });
  assert.deepEqual(fs.readdirSync(d), ['a.json']);
});

test('stale .tmp from power loss does not break listBills', () => {
  const d = tmp();
  S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  fs.writeFileSync(path.join(d, 'bills', '2026-11-12.json.tmp'), '{"broken');
  assert.equal(S.listBills(d, '2026-11-12').length, 1);
});

test('seq increments per day and resets next day', () => {
  const d = tmp();
  assert.equal(S.saveBill(d, mk('2026-11-12T23:59:00+07:00')).seq, 1);
  assert.equal(S.saveBill(d, mk('2026-11-12T23:59:30+07:00')).seq, 2);
  assert.equal(S.saveBill(d, mk('2026-11-13T00:01:00+07:00')).seq, 1);
  assert.equal(S.listBills(d, '2026-11-12').length, 2);
  assert.equal(S.listBills(d, '2026-11-13').length, 1);
});

test('updateBill patches and persists', () => {
  const d = tmp();
  const b = S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  S.updateBill(d, '2026-11-12', b.seq, { status: 'typed', sentCount: 3 });
  const got = S.listBills(d, '2026-11-12')[0];
  assert.equal(got.status, 'typed');
  assert.equal(got.sentCount, 3);
});

test('listPending excludes confirmed and void, oldest first', () => {
  const d = tmp();
  S.saveBill(d, mk('2026-11-13T09:00:00+07:00'));
  S.saveBill(d, mk('2026-11-12T09:00:00+07:00'));
  S.saveBill(d, mk('2026-11-12T10:00:00+07:00', { status: 'confirmed' }));
  S.saveBill(d, mk('2026-11-12T11:00:00+07:00', { status: 'void' }));
  const p = S.listPending(d);
  assert.deepEqual(p.map((b) => b.createdAt), ['2026-11-12T09:00:00+07:00', '2026-11-13T09:00:00+07:00']);
});

test('recoverSending turns sending into pending and keeps sentCount', () => {
  const d = tmp();
  const b = S.saveBill(d, mk('2026-11-12T10:00:00+07:00', { status: 'sending', sentCount: 4 }));
  assert.equal(S.recoverSending(d), 1);
  const got = S.listBills(d, '2026-11-12')[0];
  assert.equal(got.status, 'pending');
  assert.equal(got.sentCount, 4);
  assert.equal(b.seq, got.seq);
});

test('corrupt day file is quarantined, selling continues, seq floors at 1001', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'bills'), { recursive: true });
  fs.writeFileSync(path.join(d, 'bills', '2026-11-12.json'), '{"broken');
  const saved = S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  assert.equal(saved.seq, 1001);
  const names = fs.readdirSync(path.join(d, 'bills'));
  assert.ok(names.some((n) => /^2026-11-12\.corrupt-.*\.json$/.test(n)));
  assert.equal(S.listBills(d, '2026-11-12').length, 1);
  assert.ok(S.getWarnings().some((w) => w.includes('2026-11-12')));
});

test('corrupt day file is restored from the newest backup when one exists', () => {
  const d = tmp();
  S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  S.makeBackup(d, new Date('2026-11-12T12:00:00Z'));
  fs.writeFileSync(path.join(d, 'bills', '2026-11-12.json'), 'garbage');
  const restored = S.listBills(d, '2026-11-12');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].seq, 1);
});

test('non-array JSON in a day file is treated as corrupt, not overwritten', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'bills'), { recursive: true });
  fs.writeFileSync(path.join(d, 'bills', '2026-11-12.json'), '{}');
  S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  assert.ok(fs.readdirSync(path.join(d, 'bills')).some((n) => n.includes('corrupt')));
});

test('a corrupt OLD file does not break listPending or recoverSending', () => {
  const d = tmp();
  S.saveBill(d, mk('2026-11-13T10:00:00+07:00'));
  fs.writeFileSync(path.join(d, 'bills', '2026-10-01.json'), '{"broken');
  assert.doesNotThrow(() => S.recoverSending(d));
  assert.equal(S.listPending(d).length, 1);
});

test('settings default and round trip', () => {
  const d = tmp();
  const s = S.loadSettings(d);
  assert.equal(s.machineId, 'POS02');
  assert.equal(s.shopName, 'UNG LUK SENG');
  assert.equal(s.delayMs, 600);
  assert.equal(s.windowLike, '*Sea And Hill POS*');
  S.saveSettings(d, { ...s, machineId: 'POS01' });
  assert.equal(S.loadSettings(d).machineId, 'POS01');
});

test('makeBackup copies bills and prunes backups older than 30 days', () => {
  const d = tmp();
  S.saveBill(d, mk('2026-11-12T10:00:00+07:00'));
  const old = new Date('2026-10-01T10:00:00Z');
  const recent = new Date('2026-10-20T10:00:00Z');
  S.makeBackup(d, old);
  S.makeBackup(d, recent);
  S.makeBackup(d, new Date('2026-11-13T10:00:00Z'));
  const names = fs.readdirSync(path.join(d, 'backup'));
  assert.equal(names.length, 2); // 2026-10-01 is >30 days before 11-13, pruned
  const last = names.sort().pop();
  assert.ok(fs.existsSync(path.join(d, 'backup', last, '2026-11-12.json')));
});
