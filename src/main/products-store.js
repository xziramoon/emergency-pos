'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { atomicWriteJson } = require('./store');
const { parseCsv } = require('../shared/csv');
const { guessColumns, buildIndex } = require('../shared/products');

const STALE_MS = 3 * 24 * 3600 * 1000;

function fetchText(url, maxRedirects = 5, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, (res) => {
      const code = res.statusCode;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (maxRedirects <= 0) return reject(new Error('redirect มากเกินไป'));
        return resolve(fetchText(new URL(res.headers.location, url).href, maxRedirects - 1, timeoutMs));
      }
      if (code !== 200) { res.resume(); return reject(new Error('HTTP ' + code)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('หมดเวลาดาวน์โหลด')));
    req.on('error', reject);
  });
}

const file = (dir) => path.join(dir, 'products.json');

// Never throws. On any failure the existing local copy is left untouched.
async function refreshProducts({ url, dir, columnMap, fetchText: fetcher = fetchText }) {
  try {
    if (!String(url || '').trim()) throw new Error('ยังไม่ได้ตั้ง URL รายการสินค้า (ตั้งค่า > URL รายการสินค้า)');
    const text = await fetcher(url);
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('ไฟล์สินค้าว่างหรือไม่ใช่ CSV');
    const map = columnMap || guessColumns(rows[0]);
    if (map.barcode < 0 || map.price < 0 || map.name < 0) throw new Error('จับคู่คอลัมน์ไม่ได้');
    const body = rows.slice(1);
    const index = buildIndex(body, map);
    if (index.count === 0) throw new Error('ไม่พบสินค้าที่ใช้ได้ในไฟล์');
    const updatedAt = new Date().toISOString();
    atomicWriteJson(file(dir), { updatedAt, rows: body, map, duplicates: index.duplicates });
    return { ok: true, count: index.count, updatedAt, duplicates: index.duplicates };
  } catch (e) {
    return { ok: false, count: 0, updatedAt: null, error: String(e.message || e) };
  }
}

function loadProducts(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
    const index = buildIndex(data.rows, data.map);
    const age = Date.now() - Date.parse(data.updatedAt);
    return { index, updatedAt: data.updatedAt, stale: !(age <= STALE_MS) };
  } catch {
    return null;
  }
}

module.exports = { fetchText, refreshProducts, loadProducts };
