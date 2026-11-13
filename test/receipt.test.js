const test = require('node:test');
const assert = require('node:assert/strict');
const { formatThaiDate, displayWidth } = require('../src/shared/thaidate');
const { buildReceipt, renderReceiptHtml, WIDTH } = require('../src/shared/receipt');
const Cart = require('../src/shared/cart');

const fish = { barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', unit: 'ชิ้น', price: 58 };
const water = { barcode: '8850000000002', name: 'น้ำดื่ม 600มล.', unit: 'ขวด', price: 7 };
const when = new Date(2026, 10, 12, 16, 20); // 12 Nov 2026 = 12-11-2569 (B.E.)

function bill(cart, payments, change, extra = {}) {
  return { ...Cart.toBill(cart, { machine: 'POS02', cashier: 'ตั้น', now: when, payments, change }), ...extra };
}
const norm = (s) => s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

test('formatThaiDate uses Buddhist year and DD-MM-YYYY@HH:mm', () => {
  assert.equal(formatThaiDate(when), '12-11-2569@16:20');
  assert.equal(formatThaiDate(new Date(2026, 0, 5, 9, 3)), '05-01-2569@09:03');
});

test('displayWidth ignores Thai combining marks', () => {
  assert.equal(displayWidth('ตั้น'), 2);
  assert.equal(displayWidth('ใบเสร็จรับเงิน'), 11);
  assert.equal(displayWidth('POS02'), 5);
});

test('golden: spec 6.4 sample receipt, line for line', () => {
  const b = bill(Cart.addProduct([], fish), [{ method: 'cash', amount: 500 }], 442);
  const { text } = buildReceipt(b, { shopName: 'UNG LUK SENG' });
  assert.deepEqual(norm(text), [
    'UNG LUK SENG',
    'ใบเสร็จรับเงิน',
    'เลขเครื่อง : POS02 พนักงาน : ตั้น',
    'สมาชิก : ลูกค้าเงินสด (CASH)',
    '-'.repeat(42),
    'อะยัม แมคเคอเรล 230กรัม',
    '58.00 X 1 58.00',
    '-'.repeat(42),
    '1 รายการ 1.00 ชิ้น 58.00',
    '-'.repeat(42),
    'ชำระด้วยเงินสด 500.00',
    'เงินทอน 442.00',
    '-'.repeat(42),
    'วันที่:12-11-2569@16:20',
    'V=สินค้ามีภาษีมูลค่าเพิ่ม E=สินค้ายกเว้นภาษี',
    'ขอบคุณที่ใช้บริการ ครับ/ค่ะ',
  ]);
});

test('receipt never contains เลขที่ or a barcode', () => {
  let c = Cart.addProduct([], fish);
  c = Cart.addManual(c, { barcode: '9990000000009', name: 'ของฝาก', price: 25, qty: 2 });
  const { text } = buildReceipt(bill(c, [{ method: 'cash', amount: 200 }], 92), { shopName: 'UNG LUK SENG' });
  assert.ok(!text.includes('เลขที่'));
  assert.ok(!text.includes('8850000000001'));
  assert.ok(!text.includes('9990000000009'));
});

test('every line fits the 42-column paper', () => {
  let c = Cart.addProduct([], { ...fish, name: 'สินค้าชื่อยาวมากมายก่อกองเกินความกว้างของกระดาษแปดสิบมิลลิเมตรแน่นอน ' + 'ก'.repeat(30) });
  c = Cart.setQty(c, 0, 12);
  const { text } = buildReceipt(bill(c, [{ method: 'cash', amount: 2000 }], 1000), { shopName: 'UNG LUK SENG' });
  for (const l of text.split('\n')) assert.ok(displayWidth(l) <= WIDTH, `too wide (${displayWidth(l)}): ${l}`);
  // the amount must still be on its own row, right-aligned, not overwritten
  assert.ok(text.split('\n').some((l) => /X 12\s+696\.00$/.test(l)));
});

test('mixed cash + transfer: both pay rows, change after them', () => {
  const b = bill(Cart.addProduct([], fish), [{ method: 'cash', amount: 30 }, { method: 'transfer', amount: 40 }], 12);
  const lines = norm(buildReceipt(b, { shopName: 'X' }).text);
  const i = lines.indexOf('ชำระด้วยเงินสด 30.00');
  assert.ok(i > 0);
  assert.equal(lines[i + 1], 'ชำระด้วยเงินโอน 40.00');
  assert.equal(lines[i + 2], 'เงินทอน 12.00');
});

test('transfer only: no change row', () => {
  const b = bill(Cart.addProduct([], fish), [{ method: 'transfer', amount: 58 }], 0);
  const { text } = buildReceipt(b, { shopName: 'X' });
  assert.ok(text.includes('ชำระด้วยเงินโอน'));
  assert.ok(!text.includes('เงินทอน'));
});

test('gov payment label', () => {
  const b = bill(Cart.addProduct([], fish), [{ method: 'gov', amount: 58 }], 0);
  assert.ok(buildReceipt(b, { shopName: 'X' }).text.includes('ชำระด้วยโครงการรัฐ'));
});

test('discount: gross row, then ส่วนลด with negative amount, totals use net', () => {
  let c = Cart.addProduct([], fish);
  c = Cart.setQty(c, 0, 2);
  c = Cart.setDiscount(c, 0, 6);
  const lines = norm(buildReceipt(bill(c, [{ method: 'cash', amount: 110 }], 0), { shopName: 'X' }).text);
  const i = lines.indexOf('58.00 X 2 116.00');
  assert.ok(i > 0, lines.join('|'));
  assert.equal(lines[i + 1], 'ส่วนลด -6.00');
  assert.ok(lines.includes('1 รายการ 2.00 ชิ้น 110.00'));
});

test('summary line counts items and total pieces with 2 decimals', () => {
  let c = Cart.addProduct([], fish);
  c = Cart.addProduct(c, water);
  c = Cart.setQty(c, 1, 4);
  const lines = norm(buildReceipt(bill(c, [{ method: 'cash', amount: 100 }], 14), { shopName: 'X' }).text);
  assert.ok(lines.includes('2 รายการ 5.00 ชิ้น 86.00'));
});

test('shop name comes from settings, default UNG LUK SENG when blank', () => {
  const b = bill(Cart.addProduct([], fish), [{ method: 'cash', amount: 58 }], 0);
  assert.equal(norm(buildReceipt(b, { shopName: 'ร้านทดสอบ' }).text)[0], 'ร้านทดสอบ');
  assert.equal(norm(buildReceipt(b, { shopName: '  ' }).text)[0], 'UNG LUK SENG');
});

test('thousands separator on big amounts', () => {
  let c = Cart.addProduct([], { ...fish, price: 1250 });
  const lines = norm(buildReceipt(bill(c, [{ method: 'cash', amount: 1500 }], 250), { shopName: 'X' }).text);
  assert.ok(lines.includes('1,250.00 X 1 1,250.00'));
  assert.ok(lines.includes('เงินทอน 250.00'));
});

test('renderReceiptHtml escapes HTML in names and makes the summary bold', () => {
  let c = Cart.addManual([], { barcode: '', name: '<b>x</b> & y', price: 10, qty: 1 });
  const html = renderReceiptHtml(buildReceipt(bill(c, [{ method: 'cash', amount: 10 }], 0), { shopName: 'X' }));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt; &amp; y'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('80mm'));
  assert.ok(/<b>[^<]*รายการ[^<]*<\/b>/.test(html));
});
