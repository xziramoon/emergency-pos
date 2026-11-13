const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../src/shared/csv');
const P = require('../src/shared/products');

const sample = parseCsv(fs.readFileSync(path.join(__dirname, 'fixtures/sheet-sample.csv'), 'utf8'));

test('guessColumns maps the real sheet headers', () => {
  assert.deepEqual(P.guessColumns(sample[0]), { barcode: 0, name: 1, unit: 2, price: 3 });
});

test('guessColumns ignores cost columns for price', () => {
  const m = P.guessColumns(['รหัส', 'ชื่อสินค้า', 'หน่วยนับ', 'ราคาทุน', 'ราคาขาย']);
  assert.deepEqual(m, { barcode: 0, name: 1, unit: 2, price: 4 });
});

test('guessColumns returns -1 when a column is missing', () => {
  assert.equal(P.guessColumns(['a', 'b']).price, -1);
});

test('normalizeBarcode trims, drops leading apostrophe, rejects scientific notation', () => {
  assert.equal(P.normalizeBarcode("  '8850000000000 "), '8850000000000');
  assert.equal(P.normalizeBarcode('8.85E+12'), '');
});

test('buildIndex counts, skips bad rows, keeps first duplicate', () => {
  const idx = P.buildIndex(sample.slice(1), P.guessColumns(sample[0]));
  assert.equal(idx.duplicates, 1);
  assert.equal(idx.byBarcode.get('8852108220093').name, 'ฟรีซ เก็กฮวย 240มล.');
  assert.equal(idx.byBarcode.has('8851000000001'), false); // empty price skipped
  assert.equal(idx.byBarcode.has('8.85E+12'), false);
  assert.equal(idx.byBarcode.get('8851000000002').price, 1250);
  assert.equal(idx.count, 7);
});

test('findByBarcode matches exact then without leading zeros', () => {
  const idx = P.buildIndex(
    [['0012345', 'a', 'ชิ้น', '10'], ['999', 'b', 'ชิ้น', '5']],
    { barcode: 0, name: 1, unit: 2, price: 3 }
  );
  assert.equal(P.findByBarcode(idx, '0012345').name, 'a');
  assert.equal(P.findByBarcode(idx, '12345').name, 'a');
  assert.equal(P.findByBarcode(idx, '0999').name, 'b');
  assert.equal(P.findByBarcode(idx, '404'), null);
});

test('searchByName finds by substring and caps at 30', () => {
  const rows = Array.from({ length: 40 }, (_, i) => [String(1000 + i), 'น้ำดื่ม ' + i, 'ขวด', '7']);
  const idx = P.buildIndex(rows, { barcode: 0, name: 1, unit: 2, price: 3 });
  assert.equal(P.searchByName(idx, 'น้ำดื่ม').length, 30);
  assert.equal(P.searchByName(idx, 'น้ำดื่ม 39').length, 1);
  assert.equal(P.searchByName(idx, '').length, 0);
});
