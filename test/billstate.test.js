const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/shared/billstate.js');

const ALL = ['pending', 'sending', 'typed', 'confirmed', 'flagged', 'void'];
const OK = {
  'pending>sending': 1, 'pending>void': 1,
  'sending>typed': 1, 'sending>pending': 1,
  'typed>confirmed': 1, 'typed>flagged': 1, 'typed>void': 1,
  'flagged>void': 1, 'flagged>pending': 1,
};

test('canTransition: exactly the allowed edges, nothing else (all 36 pairs)', () => {
  for (const from of ALL) for (const to of ALL) {
    assert.equal(B.canTransition(from, to), !!OK[from + '>' + to], `${from} -> ${to}`);
  }
});

test('a confirmed bill can never be voided, and void is terminal', () => {
  assert.equal(B.canTransition('confirmed', 'void'), false);
  for (const to of ALL) assert.equal(B.canTransition('void', to), false);
});

test('canTransition rejects unknown statuses', () => {
  assert.equal(B.canTransition('nope', 'void'), false);
  assert.equal(B.canTransition('pending', 'nope'), false);
});

test('applyProgress sets sentCount without mutating the input', () => {
  const b = { seq: 1, sentCount: 0 };
  const n = B.applyProgress(b, 4);
  assert.equal(n.sentCount, 4);
  assert.equal(b.sentCount, 0);
});

test('flagsOf: manual / priceEdited', () => {
  assert.deepEqual(B.flagsOf({ lines: [{ manual: true }, { priceEdited: false }] }), { manual: true, priceEdited: false });
  assert.deepEqual(B.flagsOf({ lines: [{ manual: false, priceEdited: true }] }), { manual: false, priceEdited: true });
  assert.deepEqual(B.flagsOf({ lines: [{ manual: false }] }), { manual: false, priceEdited: false });
});

test('describeStop: plain Thai text per reason, with counts and last barcode', () => {
  assert.match(B.describeStop('window-not-found', 0), /ไม่พบหน้าต่าง/);
  assert.match(B.describeStop('cannot-focus', 0), /ยังไม่ได้พิมพ์/);
  const m = B.describeStop('foreground-changed', 3, '8850000000001');
  assert.match(m, /3 รายการ/);
  assert.match(m, /8850000000001/);
  assert.match(B.describeStop('timeout', 2, 'x'), /ตรวจรายการสุดท้าย/);
  assert.match(B.describeStop('something-else', 1, 'x'), /1 รายการ/);
});

test('statusLabel gives a Thai label for every status', () => {
  for (const s of ALL) assert.ok(B.statusLabel(s) && B.statusLabel(s) !== s, s);
});
