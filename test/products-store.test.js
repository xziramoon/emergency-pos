const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const PS = require('../src/main/products-store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'epos-'));
const CSV = 'Barcode,ProductName,Unit,Price\n8850000000001,ปลากระป๋อง,ชิ้น,58\n8850000000002,น้ำดื่ม,ขวด,7\n';

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s));
  });
}

test('fetchText follows a 302 redirect', async () => {
  const s = await server((req, res) => {
    if (req.url === '/start') { res.writeHead(302, { Location: '/final' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' }); res.end(CSV);
  });
  const base = 'http://127.0.0.1:' + s.address().port;
  const text = await PS.fetchText(base + '/start');
  s.close();
  assert.equal(text, CSV);
});

test('fetchText rejects on HTTP error status', async () => {
  const s = await server((req, res) => { res.writeHead(500); res.end('x'); });
  await assert.rejects(PS.fetchText('http://127.0.0.1:' + s.address().port + '/'));
  s.close();
});

test('refreshProducts writes a local copy and loadProducts reads it', async () => {
  const d = tmp();
  const r = await PS.refreshProducts({ url: 'x', dir: d, fetchText: async () => CSV });
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  const loaded = PS.loadProducts(d);
  assert.equal(loaded.index.count, 2);
  assert.equal(loaded.stale, false);
});

test('failed refresh keeps the old copy and does not throw', async () => {
  const d = tmp();
  await PS.refreshProducts({ url: 'x', dir: d, fetchText: async () => CSV });
  const before = fs.readFileSync(path.join(d, 'products.json'), 'utf8');
  const r = await PS.refreshProducts({ url: 'x', dir: d, fetchText: async () => { throw new Error('offline'); } });
  assert.equal(r.ok, false);
  assert.equal(fs.readFileSync(path.join(d, 'products.json'), 'utf8'), before);
  assert.equal(PS.loadProducts(d).index.count, 2);
});

test('a refresh that returns an HTML page does not replace a good copy', async () => {
  const d = tmp();
  await PS.refreshProducts({ url: 'x', dir: d, fetchText: async () => CSV });
  const r = await PS.refreshProducts({ url: 'x', dir: d, fetchText: async () => '<html>login</html>' });
  assert.equal(r.ok, false);
  assert.equal(PS.loadProducts(d).index.count, 2);
});

test('loadProducts marks a copy older than 3 days as stale', () => {
  const d = tmp();
  const old = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(path.join(d, 'products.json'), JSON.stringify({
    updatedAt: old, rows: [['1', 'a', 'ชิ้น', '5']], map: { barcode: 0, name: 1, unit: 2, price: 3 },
  }));
  assert.equal(PS.loadProducts(d).stale, true);
});

test('loadProducts returns null when no copy exists', () => {
  assert.equal(PS.loadProducts(tmp()), null);
});
