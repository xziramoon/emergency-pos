const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/shared/focus-guard.js');

const base = { sellVisible: true, modalOpen: false, active: 'body', idleMs: 0 };

test('decideFocus: never steals focus outside the sell screen or while a dialog is open', () => {
  assert.equal(G.decideFocus({ ...base, sellVisible: false }), 'none');
  assert.equal(G.decideFocus({ ...base, modalOpen: true }), 'none');
});

test('decideFocus: already in the scan field -> nothing to do', () => {
  assert.equal(G.decideFocus({ ...base, active: 'scan' }), 'none');
});

test('decideFocus: focus lost to the page body -> go back to the scan field', () => {
  assert.equal(G.decideFocus({ ...base, active: 'body' }), 'scan');
});

test('decideFocus: a cart cell being edited is left alone until it has been idle for 8 seconds', () => {
  assert.equal(G.decideFocus({ ...base, active: 'cell', idleMs: 7999 }), 'none');
  assert.equal(G.decideFocus({ ...base, active: 'cell', idleMs: 8000 }), 'scan');
});

test('decideFocus: a focused button is left alone by the watchdog (keyboard users), keys are handled elsewhere', () => {
  assert.equal(G.decideFocus({ ...base, active: 'button', idleMs: 60000 }), 'none');
});

test('keyAction: a printable key while focus is on body/button is redirected into the scan field', () => {
  assert.equal(G.keyAction({ ...base, active: 'body' }, { key: '8' }), 'redirect');
  assert.equal(G.keyAction({ ...base, active: 'button' }, { key: 'A' }), 'redirect');
});

test('keyAction: Enter, Tab, F-keys, Ctrl combos and dialogs are never redirected', () => {
  for (const key of ['Enter', 'Tab', 'F11', 'Escape', 'ArrowDown']) {
    assert.equal(G.keyAction({ ...base, active: 'body' }, { key }), 'ignore', key);
  }
  assert.equal(G.keyAction({ ...base, active: 'body' }, { key: 'a', ctrlKey: true }), 'ignore');
  assert.equal(G.keyAction({ ...base, active: 'body', modalOpen: true }, { key: '8' }), 'ignore');
  assert.equal(G.keyAction({ ...base, active: 'body', sellVisible: false }, { key: '8' }), 'ignore');
});

test('keyAction: typing in the scan field is untouched', () => {
  assert.equal(G.keyAction({ ...base, active: 'scan' }, { key: '8' }), 'ignore');
});

test('burst detector: slow human typing in a cell is not a scan', () => {
  const b = G.createBurstDetector();
  for (let i = 0; i < 6; i++) assert.equal(b.push('1', i * 200).burst, false);
});

test('burst detector: 3 keys within 40 ms gaps is a scanner and returns everything typed so far', () => {
  const b = G.createBurstDetector();
  assert.equal(b.push('8', 1000).burst, false);
  assert.equal(b.push('8', 1010).burst, false);
  const r = b.push('5', 1020);
  assert.equal(r.burst, true);
  assert.equal(r.text, '885');
  const r2 = b.push('0', 1030);
  assert.equal(r2.burst, true);
  assert.equal(r2.text, '8850');
});

test('burst detector: a slow key starts a new sequence', () => {
  const b = G.createBurstDetector();
  b.push('1', 0); b.push('2', 10);
  assert.equal(b.push('3', 500).burst, false);
});

test('scanStatus: tells the cashier whether a scan will land', () => {
  assert.equal(G.scanStatus({ hasFocus: true, scanFocused: true }), 'ready');
  assert.equal(G.scanStatus({ hasFocus: true, scanFocused: false }), 'lost');
  assert.equal(G.scanStatus({ hasFocus: false, scanFocused: true }), 'away');
});
