'use strict';
// Serves src/renderer with a mock window.api so the UI can be checked in a normal browser.
// Never starts Electron. Usage: npm run harness:ui  (PORT env to override, NO_OPEN=1 to skip browser)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const root = path.join(__dirname, '../src/renderer');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (url === '/__mock-api.js') {
    res.writeHead(200, { 'Content-Type': types['.js'] });
    return res.end(fs.readFileSync(path.join(__dirname, 'mock-api.js')));
  }
  if (url === '/__focus-test.js') { res.writeHead(200, { 'Content-Type': types['.js'] }); return res.end(fs.readFileSync(path.join(__dirname, 'focus-test.js'))); }
  const rel = url === '/' ? 'index.html' : decodeURIComponent(url.slice(1));
  const shared = rel.startsWith('shared/');
  const base = shared ? path.join(__dirname, '../src/shared') : root;
  const file = path.join(base, shared ? rel.slice(7) : rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  let body = fs.readFileSync(file);
  if (rel === 'index.html') {
    body = Buffer.from(body.toString('utf8').replace('<script src="settings.js">',
      '<script src="/__mock-api.js"></script>\n  <script src="/__focus-test.js"></script>\n  <script src="settings.js">'));
  } else if (rel === 'reconcile.html') {
    body = Buffer.from(body.toString('utf8').replace('<script src="../shared/manualfix.js">',
      '<script src="/__mock-api.js"></script>\n  <script src="../shared/manualfix.js">'));
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});

const port = Number(process.env.PORT) || 5177;
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log('UI harness at ' + url);
  if (!process.env.NO_OPEN) exec(`start "" "${url}"`);
});
