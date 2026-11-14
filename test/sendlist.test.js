const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBarcodeList, remainingFrom, timeoutMs } = require('../src/shared/sendlist.js');

const bill = {
  lines: [
    { barcode: '111', qty: 3, manual: false },
    { barcode: '', qty: 1, manual: true, name: 'ของฝาก' },
    { barcode: '222', qty: 2, manual: false },
  ],
};

test('buildBarcodeList repeats by qty in line order and skips manual lines', () => {
  assert.deepEqual(buildBarcodeList(bill), ['111', '111', '111', '222', '222']);
});

test('buildBarcodeList: empty or all-manual bill gives an empty list', () => {
  assert.deepEqual(buildBarcodeList({ lines: [] }), []);
  assert.deepEqual(buildBarcodeList({ lines: [{ barcode: 'x', qty: 2, manual: true }] }), []);
});

test('remainingFrom skips what was already typed', () => {
  const list = buildBarcodeList(bill);
  assert.deepEqual(remainingFrom(list, 2), ['111', '222', '222']);
  assert.deepEqual(remainingFrom(list, 0), list);
  assert.deepEqual(remainingFrom(list, 99), []);
});

test('timeoutMs = count*(delay+500)+10000', () => {
  assert.equal(timeoutMs(10, 600), 21000);
  assert.equal(timeoutMs(0, 600), 10000);
});
