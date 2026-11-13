'use strict';

const HEADER_RULES = {
  barcode: /barcode|บาร์โค้ด|รหัส/i,
  name: /ชื่อ|name/i,
  unit: /หน่วย|unit/i,
  price: /ราคาขาย|ราคา|price/i,
};
const COST = /ทุน|cost/i;

function guessColumns(headers) {
  const map = { barcode: -1, name: -1, unit: -1, price: -1 };
  const used = new Set();
  // price first so "ราคาขาย" wins over a generic match; skip cost columns.
  const order = ['price', 'barcode', 'name', 'unit'];
  for (const key of order) {
    const rule = HEADER_RULES[key];
    let idx = headers.findIndex((h, i) => !used.has(i) && rule.test(h) && !COST.test(h));
    if (key === 'price') {
      const exact = headers.findIndex((h, i) => !used.has(i) && /ราคาขาย/.test(h) && !COST.test(h));
      if (exact >= 0) idx = exact;
    }
    map[key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

function normalizeBarcode(s) {
  let v = String(s == null ? '' : s).trim();
  if (v.startsWith("'")) v = v.slice(1).trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(v)) return ''; // Sheet turned it into a number
  return v;
}

function parsePrice(s) {
  const v = String(s == null ? '' : s).replace(/,/g, '').trim();
  if (v === '' || !/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

function stripZeros(code) {
  return code.replace(/^0+/, '');
}

function buildIndex(rows, map) {
  const byBarcode = new Map();
  const byStripped = new Map();
  const all = [];
  let duplicates = 0;
  for (const r of rows) {
    const barcode = normalizeBarcode(r[map.barcode]);
    const price = parsePrice(r[map.price]);
    if (!barcode || price === null) continue;
    if (byBarcode.has(barcode)) { duplicates++; continue; }
    const p = {
      barcode,
      name: String(r[map.name] || '').trim(),
      unit: map.unit >= 0 ? String(r[map.unit] || '').trim() : '',
      price,
    };
    byBarcode.set(barcode, p);
    const s = stripZeros(barcode);
    if (s && !byStripped.has(s)) byStripped.set(s, p);
    all.push(p);
  }
  return { byBarcode, byStripped, all, count: byBarcode.size, duplicates };
}

function findByBarcode(index, code) {
  const c = normalizeBarcode(code);
  if (!c) return null;
  return index.byBarcode.get(c) || index.byStripped.get(stripZeros(c)) || null;
}

function searchByName(index, q, limit = 30) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  for (const p of index.all) {
    if (p.name.toLowerCase().includes(needle)) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

module.exports = { guessColumns, normalizeBarcode, buildIndex, findByBarcode, searchByName };
