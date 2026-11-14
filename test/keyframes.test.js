const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A typo in an animation name fails silently (the element just stops moving); keep names and @keyframes in sync.
test('every animation name used in style.css has a matching @keyframes', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/style.css'), 'utf8');
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const builtin = new Set(['none', 'infinite', 'forwards', 'alternate', 'ease', 'ease-in-out', 'ease-out', 'linear']);
  const used = new Set();
  for (const m of css.matchAll(/animation:\s*([^;}]+)[;}]/g)) {
    for (const part of m[1].split(',')) {
      for (const tok of part.trim().split(/\s+/)) {
        if (/^[a-z][\w-]*$/i.test(tok) && !builtin.has(tok) && !/^\d/.test(tok) && !/^(cubic-bezier|var)/.test(tok)) used.add(tok);
      }
    }
  }
  assert.ok(used.size >= 5, 'expected the mascot animations to be found');
  for (const name of used) assert.ok(defined.has(name), 'no @keyframes for ' + name);
});

test('mascot.js loads before sell.js (Sell.updateEmpty calls Mascot)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.indexOf('mascot.js') > 0 && html.indexOf('mascot.js') < html.indexOf('sell.js'));
});
