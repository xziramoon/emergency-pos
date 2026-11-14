const test = require('node:test');
const assert = require('node:assert/strict');
const { manualFixList, paymentSummary } = require('../src/shared/manualfix.js');

test('manualFixList: one manual line and one price-edited line give two entries with the right kinds', () => {
  const bill = {
    lines: [
      { name: 'ปลากระป๋อง', barcode: '1', qty: 1, price: 58, listPrice: 58, discount: 0, manual: false, priceEdited: false },
      { name: 'ของฝาก', barcode: '', qty: 2, price: 25, listPrice: 25, discount: 0, manual: true, priceEdited: false },
      { name: 'น้ำดื่ม', barcode: '2', qty: 3, price: 5, listPrice: 7, discount: 1, manual: false, priceEdited: true },
    ],
  };
  const r = manualFixList(bill);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { kind: 'manual', name: 'ของฝาก', qty: 2, price: 25, discount: 0 });
  assert.deepEqual(r[1], { kind: 'edited', name: 'น้ำดื่ม', qty: 3, price: 5, discount: 1 });
});

test('manualFixList: an ordinary bill gives an empty list (the section is hidden)', () => {
  assert.deepEqual(manualFixList({ lines: [{ name: 'x', qty: 1, price: 1, discount: 0, manual: false, priceEdited: false }] }), []);
  assert.deepEqual(manualFixList({ lines: [] }), []);
});

test('manualFixList: a discount alone (price unchanged) is not a manual fix', () => {
  assert.deepEqual(manualFixList({ lines: [{ name: 'x', qty: 1, price: 10, listPrice: 10, discount: 2, manual: false, priceEdited: false }] }), []);
});

test('paymentSummary: one row per used channel with Thai names, in cash/transfer/gov order', () => {
  const rows = paymentSummary({ payments: [{ method: 'gov', amount: 30 }, { method: 'cash', amount: 100 }], change: 20 });
  assert.deepEqual(rows.map((r) => r.method), ['cash', 'gov']);
  assert.equal(rows[0].label, 'เงินสด');
  assert.equal(rows[1].label, 'โครงการรัฐ');
  assert.equal(rows[0].amount, 100);
});
