const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/shared/cart');

const fish = { barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', unit: 'ชิ้น', price: 58 };
const water = { barcode: '8850000000002', name: 'น้ำดื่ม', unit: 'ขวด', price: 7 };

test('scanning the same barcode again adds quantity on one line', () => {
  let c = C.addProduct([], fish);
  c = C.addProduct(c, fish);
  assert.equal(c.length, 1);
  assert.equal(c[0].qty, 2);
  assert.equal(c[0].total, 116);
});

test('scanning after a price edit creates a new line', () => {
  let c = C.addProduct([], fish);
  c = C.setPrice(c, 0, 50);
  c = C.addProduct(c, fish);
  assert.equal(c.length, 2);
  assert.equal(c[1].price, 58);
});

test('setPrice flags priceEdited and keeps listPrice', () => {
  let c = C.addProduct([], fish);
  c = C.setPrice(c, 0, 50);
  assert.equal(c[0].priceEdited, true);
  assert.equal(c[0].listPrice, 58);
  assert.equal(c[0].total, 50);
});

test('setDiscount is capped at the line amount and flags priceEdited', () => {
  let c = C.addProduct([], fish, 2);
  c = C.setDiscount(c, 0, 500);
  assert.equal(c[0].discount, 116);
  assert.equal(c[0].total, 0);
  assert.equal(c[0].priceEdited, true);
});

test('setDiscount ignores negative values', () => {
  let c = C.addProduct([], fish);
  c = C.setDiscount(c, 0, -5);
  assert.equal(c[0].discount, 0);
});

test('setQty rejects 0, negatives and fractions', () => {
  const c = C.addProduct([], fish);
  assert.equal(C.setQty(c, 0, 0)[0].qty, 1);
  assert.equal(C.setQty(c, 0, -2)[0].qty, 1);
  assert.equal(C.setQty(c, 0, 1.5)[0].qty, 1);
  assert.equal(C.setQty(c, 0, 4)[0].qty, 4);
});

test('lowering qty re-caps an existing discount (no negative lines)', () => {
  let c = C.addProduct([], fish, 3);
  c = C.setDiscount(c, 0, 150);
  c = C.setQty(c, 0, 1);
  assert.equal(c[0].discount, 58);
  assert.equal(c[0].total, 0);
});

test('absurd qty or price (scanner typed into a cell) is rejected', () => {
  const c = C.addProduct([], fish);
  assert.equal(C.setQty(c, 0, 38850000000001)[0].qty, 1);
  assert.equal(C.setQty(c, 0, 10000)[0].qty, 1);
  assert.equal(C.setQty(c, 0, 9999)[0].qty, 9999);
  assert.equal(C.setPrice(c, 0, 8850000000001)[0].price, 58);
  assert.equal(C.setDiscount(c, 0, 8850000000001)[0].discount, 0);
  assert.throws(() => C.addManual([], { name: 'x', price: 1e9, qty: 1 }));
  assert.throws(() => C.addManual([], { name: 'x', price: 5, qty: 10000 }));
});

test('functions do not mutate the original cart', () => {
  const c = C.addProduct([], fish);
  C.setQty(c, 0, 9);
  assert.equal(c[0].qty, 1);
});

test('addManual sets manual and keeps scanned barcode', () => {
  const c = C.addManual([], { barcode: '999', name: 'ของฝาก', price: 25, qty: 2 });
  assert.equal(c[0].manual, true);
  assert.equal(c[0].barcode, '999');
  assert.equal(c[0].total, 50);
});

test('addManual rejects bad input', () => {
  assert.throws(() => C.addManual([], { name: '', price: 5, qty: 1 }));
  assert.throws(() => C.addManual([], { name: 'x', price: -1, qty: 1 }));
  assert.throws(() => C.addManual([], { name: 'x', price: 5, qty: 0 }));
});

test('removeLine removes by index', () => {
  let c = C.addProduct(C.addProduct([], fish), water);
  c = C.removeLine(c, 0);
  assert.equal(c.length, 1);
  assert.equal(c[0].barcode, water.barcode);
});

test('cartSummary counts lines, pieces and total', () => {
  let c = C.addProduct([], fish, 2);
  c = C.addProduct(c, water, 3);
  assert.deepEqual(C.cartSummary(c), { total: 137, itemCount: 2, pieceCount: 5 });
});

test('toBill builds the spec shape with pending status', () => {
  const c = C.addProduct([], fish);
  const now = new Date('2026-11-12T16:20:05+07:00');
  const b = C.toBill(c, {
    machine: 'POS02', cashier: 'ตั้น', now,
    payments: [{ method: 'cash', amount: 500 }], change: 442,
  });
  assert.equal(b.status, 'pending');
  assert.equal(b.sentCount, 0);
  assert.equal(b.total, 58);
  assert.equal(b.void, null);
  assert.equal(b.lines[0].barcode, '8850000000001');
  assert.equal(b.lines[0].manual, false);
  assert.match(b.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('toBill createdAt uses the local date, not UTC', () => {
  // 00:30 local must stay on that local day even if UTC is the previous day
  const now = new Date(2026, 10, 13, 0, 30, 0); // local time
  const b = C.toBill(C.addProduct([], fish), { machine: 'M', cashier: 'x', now, payments: [], change: 0 });
  assert.equal(b.createdAt.slice(0, 10), '2026-11-13');
});
