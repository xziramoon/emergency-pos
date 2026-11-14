const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../src/shared/summary');
const { buildSummary, renderSummaryHtml } = require('../src/shared/receipt');

const b = (o) => ({ machine: 'POS02', cashier: 'ตั้น', status: 'pending', total: 0, change: 0, payments: [], lines: [], ...o });

// Five hand-made bills (hand-computed expectations):
//  1 ตั้น  100.00  cash 100                     pending
//  2 แอน   250.50  cash 300 change 49.50        typed
//  3 ตั้น   80.00  transfer 30 + cash 50        confirmed (mixed)
//  4 แอน    60.00  gov 60                       flagged
//  5 ตั้น   999.00  cash 1000 change 1          void (not counted in sales)
const FIVE = [
  b({ seq: 1, total: 100, payments: [{ method: 'cash', amount: 100 }], status: 'pending' }),
  b({ seq: 2, cashier: 'แอน', total: 250.5, payments: [{ method: 'cash', amount: 300 }], change: 49.5, status: 'typed' }),
  b({ seq: 3, total: 80, payments: [{ method: 'transfer', amount: 30 }, { method: 'cash', amount: 50 }], status: 'confirmed' }),
  b({ seq: 4, cashier: 'แอน', total: 60, payments: [{ method: 'gov', amount: 60 }], status: 'flagged' }),
  b({ seq: 5, total: 999, payments: [{ method: 'cash', amount: 1000 }], change: 1, status: 'void' }),
];

test('summarize: totals match the hand count; void is separate and never in sales', () => {
  const s = summarize(FIVE);
  assert.equal(s.billCount, 4);
  assert.equal(s.sales, 490.5);          // 100 + 250.5 + 80 + 60
  assert.equal(s.cash, 450);             // 100 + 300 + 50   (received, before change)
  assert.equal(s.transfer, 30);
  assert.equal(s.gov, 60);
  assert.equal(s.netCash, 400.5);        // 450 - 49.5
  assert.deepEqual(s.void, { count: 1, sales: 999 });
});

test('summarize: per-cashier and per-status groups', () => {
  const s = summarize(FIVE);
  assert.deepEqual(s.byCashier, { 'ตั้น': { count: 2, sales: 180 }, 'แอน': { count: 2, sales: 310.5 } });
  assert.deepEqual(s.pending, { count: 1, sales: 100 });
  assert.deepEqual(s.sent, { count: 2, sales: 330.5 });   // typed + confirmed
  assert.deepEqual(s.flagged, { count: 1, sales: 60 });
});

test('summarize: money is exact (no float drift over many 0.1 bills)', () => {
  const many = Array.from({ length: 30 }, (_, i) => b({ seq: i + 1, total: 0.1, payments: [{ method: 'cash', amount: 0.1 }] }));
  const s = summarize(many);
  assert.equal(s.sales, 3);
  assert.equal(s.cash, 3);
  assert.equal(s.netCash, 3);
});

test('summarize: empty list is all zeros', () => {
  const s = summarize([]);
  assert.equal(s.billCount, 0);
  assert.equal(s.sales, 0);
  assert.equal(s.netCash, 0);
  assert.deepEqual(s.byCashier, {});
  assert.deepEqual(s.void, { count: 0, sales: 0 });
});

test('summarize: a sending bill counts as pending', () => {
  const s = summarize([b({ seq: 1, total: 10, status: 'sending', payments: [{ method: 'cash', amount: 10 }] })]);
  assert.deepEqual(s.pending, { count: 1, sales: 10 });
});

test('buildSummary: receipt-style lines carry date, totals, cash drawer figure and void count', () => {
  const r = buildSummary(summarize(FIVE), { shopName: 'UNG LUK SENG', date: '2026-11-12', machine: 'POS02' });
  assert.match(r.text, /สรุปยอดขายประจำวัน/);
  assert.match(r.text, /4 บิล/);
  assert.match(r.text, /490\.50/);
  assert.match(r.text, /400\.50/);                // net cash
  assert.match(r.text, /ยกเลิก 1 บิล/);
  assert.match(r.text, /ตั้น/);
  assert.match(r.text, /แอน/);
  assert.ok(r.text.split('\n').every((l) => l.length < 80));
});

test('renderSummaryHtml: 80 mm page, escapes names', () => {
  const s = summarize([b({ seq: 1, cashier: '<b>x</b>', total: 5, payments: [{ method: 'cash', amount: 5 }] })]);
  const html = renderSummaryHtml(buildSummary(s, { shopName: 'ร้าน', date: '2026-11-12' }));
  assert.match(html, /size: 80mm/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;x/);
});
