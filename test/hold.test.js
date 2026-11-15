const test = require('node:test');
const assert = require('node:assert/strict');
const Hold = require('../src/shared/hold');

const line = (name, total) => ({ name, price: total, qty: 1, discount: 0, total });

test('hold puts the cart on the list with time, cashier and totals', () => {
  const held = Hold.hold([], [line('ปลา', 58), line('น้ำ', 7)], { id: 'a', at: '2026-11-15T10:00:00.000Z', cashier: 'ตั้น' });
  assert.equal(held.length, 1);
  assert.deepEqual({ id: held[0].id, count: held[0].lines.length, total: held[0].total, cashier: held[0].cashier }, { id: 'a', count: 2, total: 65, cashier: 'ตั้น' });
});

test('hold of an empty cart changes nothing', () => {
  const before = [];
  assert.equal(Hold.hold(before, [], { id: 'a', at: 'x', cashier: 'y' }), before);
});

test('take returns the lines and removes that bill from the list', () => {
  const held = Hold.hold(Hold.hold([], [line('ก', 10)], { id: 'a', at: 't1', cashier: 'x' }), [line('ข', 20)], { id: 'b', at: 't2', cashier: 'x' });
  const r = Hold.take(held, 'a');
  assert.equal(r.lines[0].name, 'ก');
  assert.deepEqual(r.held.map((h) => h.id), ['b']);
});

test('take of an unknown id returns null lines and the list unchanged', () => {
  const held = Hold.hold([], [line('ก', 10)], { id: 'a', at: 't', cashier: 'x' });
  const r = Hold.take(held, 'zzz');
  assert.equal(r.lines, null);
  assert.equal(r.held, held);
});

test('held lines are copies: editing the cart afterwards does not change the parked bill', () => {
  const cart = [line('ก', 10)];
  const held = Hold.hold([], cart, { id: 'a', at: 't', cashier: 'x' });
  cart[0].qty = 99;
  assert.equal(held[0].lines[0].qty, 1);
});

test('parse survives garbage storage and keeps only well-formed parked bills', () => {
  assert.deepEqual(Hold.parse('not json'), []);
  assert.deepEqual(Hold.parse(null), []);
  const good = Hold.hold([], [line('ก', 10)], { id: 'a', at: 't', cashier: 'x' });
  assert.deepEqual(Hold.parse(JSON.stringify([...good, { id: 'bad' }])), good);
});
