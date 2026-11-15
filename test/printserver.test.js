const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createPrintServer, newToken } = require('../src/main/printserver');

const TOKEN = 'tok-123';
const bill = () => ({
  machine: 'MOB01', cashier: 'สมชาย', createdAt: '2026-11-15T10:00:00.000Z', total: 58,
  lines: [{ name: 'ปลากระป๋อง', price: 58, qty: 1, discount: 0 }],
  payments: [{ method: 'cash', amount: 100 }], change: 42,
});

async function start(over = {}) {
  const calls = { print: [], test: 0 };
  const srv = createPrintServer({
    getToken: () => TOKEN,
    machine: () => 'POS01',
    print: async (b) => { if (over.printError) throw new Error(over.printError); calls.print.push(b); },
    printTest: async () => { calls.test++; },
    ...over.opts,
  });
  const port = await srv.listen(0, '127.0.0.1');
  return { srv, port, calls };
}

function req(port, { method = 'GET', path = '/ping', token = TOKEN, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const h = { ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* not json */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test('ping with the right token answers with the machine id', async () => {
  const { srv, port } = await start();
  const r = await req(port);
  await srv.close();
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, app: 'emergency-pos', machine: 'POS01' });
});

test('missing or wrong token is refused and nothing is printed', async () => {
  const { srv, port, calls } = await start();
  const none = await req(port, { method: 'POST', path: '/print', token: null, body: bill() });
  const bad = await req(port, { method: 'POST', path: '/print', token: 'nope', body: bill() });
  const ping = await req(port, { token: 'nope' });
  await srv.close();
  assert.equal(none.status, 401);
  assert.equal(bad.status, 401);
  assert.equal(ping.status, 401);
  assert.equal(calls.print.length, 0);
});

test('POST /print hands the bill to print and says ok', async () => {
  const { srv, port, calls } = await start();
  const r = await req(port, { method: 'POST', path: '/print', body: bill() });
  await srv.close();
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(calls.print.length, 1);
  assert.equal(calls.print[0].cashier, 'สมชาย');
});

test('a printer failure comes back as 502 with the Thai reason', async () => {
  const { srv, port } = await start({ printError: 'เครื่องพิมพ์ไม่พร้อม' });
  const r = await req(port, { method: 'POST', path: '/print', body: bill() });
  await srv.close();
  assert.equal(r.status, 502);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error, 'เครื่องพิมพ์ไม่พร้อม');
});

test('a malformed bill is refused with 400 and not printed', async () => {
  const { srv, port, calls } = await start();
  const noLines = await req(port, { method: 'POST', path: '/print', body: { ...bill(), lines: undefined } });
  const notJson = await req(port, { method: 'POST', path: '/print', body: '{not json' });
  const badLine = await req(port, { method: 'POST', path: '/print', body: { ...bill(), lines: [{ name: 'x' }] } });
  await srv.close();
  assert.equal(noLines.status, 400);
  assert.equal(notJson.status, 400);
  assert.equal(badLine.status, 400);
  assert.equal(calls.print.length, 0);
});

test('an oversized request is refused with 413', async () => {
  const { srv, port, calls } = await start();
  const big = { ...bill(), note: 'x'.repeat(300 * 1024) };
  const r = await req(port, { method: 'POST', path: '/print', body: big }).catch((e) => ({ status: 'closed', e }));
  await srv.close();
  assert.ok(r.status === 413 || r.status === 'closed');
  assert.equal(calls.print.length, 0);
});

test('POST /print-test prints the test slip', async () => {
  const { srv, port, calls } = await start();
  const r = await req(port, { method: 'POST', path: '/print-test' });
  await srv.close();
  assert.equal(r.status, 200);
  assert.equal(calls.test, 1);
});

test('other paths are 404 and wrong methods are 405', async () => {
  const { srv, port } = await start();
  const nf = await req(port, { path: '/bills' });
  const wm = await req(port, { method: 'GET', path: '/print' });
  await srv.close();
  assert.equal(nf.status, 404);
  assert.equal(wm.status, 405);
});

test('the same bill printed twice prints twice (printing never writes bills)', async () => {
  const { srv, port, calls } = await start();
  await req(port, { method: 'POST', path: '/print', body: bill() });
  await req(port, { method: 'POST', path: '/print', body: bill() });
  await srv.close();
  assert.equal(calls.print.length, 2);
});

test('newToken makes long distinct hex tokens', () => {
  const a = newToken(); const b = newToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

const { createController } = require('../src/main/printserver');

function ctl(initial = {}) {
  let settings = { machineId: 'POS01', printServer: { enabled: false, port: 0, token: '', ...initial } };
  const c = createController({
    loadSettings: () => settings, saveSettings: (s) => { settings = s; },
    print: async () => {}, printTest: async () => {}, addresses: () => ['192.168.1.20'], host: '127.0.0.1',
  });
  return { c, get: () => settings };
}

test('controller: disabled by default, info shows no server and creates a token', async () => {
  const { c, get } = ctl();
  const i = await c.info();
  assert.equal(i.running, false);
  assert.match(i.token, /^[0-9a-f]{32}$/);
  assert.equal(get().printServer.token, i.token);
});

test('controller: enabling starts the server and the token works; disabling stops it', async () => {
  const { c } = ctl();
  const on = await c.apply({ enabled: true });
  assert.equal(on.running, true);
  assert.ok(on.port > 0);
  assert.deepEqual(on.addresses, ['192.168.1.20']);
  const r = await req(on.port, { token: on.token });
  assert.equal(r.status, 200);
  const off = await c.apply({ enabled: false });
  assert.equal(off.running, false);
  await assert.rejects(req(on.port, { token: on.token }));
});

test('controller: regenerating the token locks out the old one', async () => {
  const { c } = ctl();
  const a = await c.apply({ enabled: true });
  const b = await c.apply({ regenerate: true });
  assert.notEqual(a.token, b.token);
  assert.equal((await req(b.port, { token: a.token })).status, 401);
  assert.equal((await req(b.port, { token: b.token })).status, 200);
  await c.stop();
});

test('controller: a port already in use reports a Thai error and does not throw', async () => {
  const hog = http.createServer(); await new Promise((r) => hog.listen(0, '127.0.0.1', r));
  const { c } = ctl();
  const i = await c.apply({ enabled: true, port: hog.address().port });
  hog.close();
  assert.equal(i.running, false);
  assert.match(i.error, /พอร์ต/);
});
