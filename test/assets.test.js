const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A missing image is silent in the UI; keep every referenced asset on disk (and inside the packaged src/**).
test('every assets/ file referenced by the renderer exists', () => {
  const dir = path.join(__dirname, '../src/renderer');
  const refs = new Set();
  for (const f of ['index.html', 'sell.js', 'pay.js', 'app.js', 'settings.js', 'style.css']) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/assets\/[\w\-./]+\.(?:png|jpg|svg|webp)/g)) refs.add(m[0]);
  }
  assert.ok(refs.size >= 4, 'expected the mascot images to be referenced');
  for (const r of refs) assert.ok(fs.existsSync(path.join(dir, r)), 'missing ' + r);
});
