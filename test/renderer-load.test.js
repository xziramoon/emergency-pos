const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Simulates Electron's contextBridge: window.api is read-only and non-configurable,
// so a top-level `const api` in a classic script would throw SyntaxError.
test('shared scripts load as classic scripts when window.api is non-configurable', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  // must be defined from inside the context to be a real non-configurable global
  vm.runInContext("Object.defineProperty(globalThis,'api',{value:{},writable:false,configurable:false})", ctx);
  for (const f of ['bill.js', 'cart.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../src/shared', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  assert.equal(typeof ctx.Bill.validatePayments, 'function');
  assert.equal(typeof ctx.Cart.addProduct, 'function');
});
