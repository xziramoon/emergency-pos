const test = require('node:test');
const assert = require('node:assert/strict');
const { round2, lineTotal, billTotal, validatePayments } = require('../src/shared/bill');

test('round2 avoids float drift', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test('lineTotal never goes negative', () => {
  assert.equal(lineTotal({ price: 10, qty: 3, discount: 50 }), 0);
});

test('lineTotal subtracts discount', () => {
  assert.equal(lineTotal({ price: 58, qty: 2, discount: 6 }), 110);
});

test('billTotal sums line totals', () => {
  assert.equal(billTotal([{ total: 58 }, { total: 12.5 }]), 70.5);
});

test('cash only gives change', () => {
  const r = validatePayments(58, { cash: 500 });
  assert.deepEqual(r, { ok: true, change: 442, payments: [{ method: 'cash', amount: 500 }] });
});

test('cash plus transfer exact has no change', () => {
  const r = validatePayments(100, { cash: 50, transfer: 50 });
  assert.equal(r.ok, true);
  assert.equal(r.change, 0);
});

test('transfer over bill total is rejected', () => {
  assert.equal(validatePayments(100, { transfer: 120 }).ok, false);
});

test('sum below total is rejected', () => {
  assert.equal(validatePayments(100, { gov: 60, cash: 30 }).ok, false);
});

test('mixed gov transfer cash gives change from cash', () => {
  const r = validatePayments(100, { gov: 40, transfer: 30, cash: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.change, 70);
});

test('zero channels are omitted from payments', () => {
  const r = validatePayments(100, { cash: 100, transfer: 0, gov: 0 });
  assert.deepEqual(r.payments, [{ method: 'cash', amount: 100 }]);
});
