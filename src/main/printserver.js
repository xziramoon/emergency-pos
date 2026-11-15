'use strict';
// Tiny LAN print relay (design 5.3). No electron imports: main.js injects print/printTest.
// Routes: GET /ping, POST /print, POST /print-test. Every request needs the paired token.
const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY = 256 * 1024;

const newToken = () => crypto.randomBytes(16).toString('hex');

function tokenOk(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validPrintBill(b) {
  return b && typeof b === 'object' && typeof b.machine === 'string' && typeof b.cashier === 'string'
    && typeof b.createdAt === 'string' && !Number.isNaN(Date.parse(b.createdAt))
    && Number.isFinite(Number(b.total)) && Array.isArray(b.payments) && Array.isArray(b.lines)
    && b.lines.length > 0
    && b.lines.every((l) => l && typeof l.name === 'string' && Number.isFinite(Number(l.price)) && Number.isFinite(Number(l.qty)));
}

// opts: { getToken(), machine(), print(bill) -> Promise, printTest() -> Promise }
function createPrintServer(opts) {
  const send = (res, status, obj) => {
    const s = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
    res.end(s);
  };
  const fail = (e) => (e && e.message) || String(e);

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = (req.url || '').split('?')[0];
      // The phone test page is static and carries no secret; everything else needs the token.
      if (url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(require('./testpage'));
      }
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!tokenOk(m && m[1], opts.getToken())) return send(res, 401, { ok: false, error: 'ไม่ได้รับอนุญาต (โทเค็นไม่ตรง)' });

      const routes = { '/ping': 'GET', '/print': 'POST', '/print-test': 'POST' };
      if (!routes[url]) return send(res, 404, { ok: false, error: 'ไม่พบเส้นทางนี้' });
      if (req.method !== routes[url]) return send(res, 405, { ok: false, error: 'วิธีเรียกไม่ถูกต้อง' });

      if (url === '/ping') return send(res, 200, { ok: true, app: 'emergency-pos', machine: opts.machine() });

      if (url === '/print-test') {
        try { await opts.printTest(); return send(res, 200, { ok: true }); } catch (e) { return send(res, 502, { ok: false, error: fail(e) }); }
      }

      let bill;
      try { bill = JSON.parse(await readBody(req)); } catch (e) {
        if (e.code === 413) return send(res, 413, { ok: false, error: 'คำขอใหญ่เกินไป' });
        return send(res, 400, { ok: false, error: 'ข้อมูลบิลอ่านไม่ได้' });
      }
      if (!validPrintBill(bill)) return send(res, 400, { ok: false, error: 'ข้อมูลบิลไม่ครบ' });
      try { await opts.print(bill); return send(res, 200, { ok: true }); } catch (e) { return send(res, 502, { ok: false, error: fail(e) }); }
    } catch (e) {
      if (!res.headersSent) send(res, 500, { ok: false, error: fail(e) });
    }
  });

  return {
    server,
    listen: (port, host = '0.0.0.0') => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
    }),
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections && server.closeAllConnections(); }),
  };
}

// Owns the running server and its settings (printServer: { enabled, port, token }).
// deps: { loadSettings(), saveSettings(s), print, printTest, addresses() -> string[], host? }
function createController(deps) {
  let running = null; // { srv, port }
  let error = '';

  const cfg = () => {
    const s = deps.loadSettings();
    let ps = { enabled: false, port: 8765, token: '', ...(s.printServer || {}) };
    if (!ps.token) { ps = { ...ps, token: newToken() }; deps.saveSettings({ ...s, printServer: ps }); }
    return ps;
  };
  const save = (patch) => { const s = deps.loadSettings(); deps.saveSettings({ ...s, printServer: { ...cfg(), ...patch } }); };

  async function stop() {
    if (running) { const r = running; running = null; await r.srv.close(); }
  }

  async function start() {
    await stop();
    error = '';
    const ps = cfg();
    const srv = createPrintServer({
      getToken: () => cfg().token,
      machine: () => deps.loadSettings().machineId,
      print: deps.print, printTest: deps.printTest,
    });
    try {
      const port = await srv.listen(ps.port, deps.host || '0.0.0.0');
      running = { srv, port };
    } catch (e) {
      error = e && e.code === 'EADDRINUSE'
        ? `พอร์ต ${ps.port} ถูกใช้อยู่แล้ว ลองเปลี่ยนเลขพอร์ต`
        : 'เปิดตัวรับงานพิมพ์ไม่สำเร็จ: ' + ((e && e.message) || e);
    }
  }

  const info = async () => {
    const ps = cfg();
    const addresses = deps.addresses();
    const port = running ? running.port : ps.port;
    // The token rides in the #part: browsers never send it to the server, and the test page reads it from there.
    const link = running && addresses.length ? `http://${addresses[0]}:${port}/#t=${ps.token}` : '';
    return { enabled: ps.enabled, running: !!running, port, token: ps.token, addresses, error, link, qrSvg: link && deps.qr ? deps.qr(link) : '' };
  };

  return {
    info,
    stop,
    // Boot: start only if it was left switched on.
    async init() { if (cfg().enabled) await start(); return info(); },
    async apply({ enabled, port, regenerate } = {}) {
      const patch = {};
      if (typeof enabled === 'boolean') patch.enabled = enabled;
      if (Number.isInteger(port) && port >= 1024 && port <= 65535) patch.port = port;
      if (regenerate) patch.token = newToken();
      save(patch);
      if (cfg().enabled) await start(); else { await stop(); error = ''; }
      return info();
    },
  };
}

module.exports = { createPrintServer, createController, newToken, validPrintBill, tokenOk };
