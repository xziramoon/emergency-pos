'use strict';
// Export/import of unsent bills between the two POS machines (spec 6.10). No electron imports.
const fs = require('node:fs');
const store = require('./store');

const FORMAT = 'emergency-pos-bills';
const dateOf = (b) => String(b.createdAt).slice(0, 10);

// A bill's identity across machines: where it was first made. Imported bills get a new local seq
// (so nothing collides with this machine's numbers) and remember the original in importedFrom.
function originOf(b) {
  const o = b.importedFrom;
  return o ? `${o.machine}|${o.date}|${o.seq}` : `${b.machine}|${dateOf(b)}|${b.seq}`;
}

function exportPending(dir, filePath) {
  const out = [];
  for (const date of store.allDates(dir)) {
    for (const b of store.listBills(dir, date)) {
      if (b.status === 'pending' || b.status === 'sending' || b.status === 'flagged') {
        // Typing progress belongs to one POS session: the receiving machine starts from 0.
        const status = b.status === 'sending' ? 'pending' : b.status;
        out.push({ ...b, status, sentCount: 0, sentAt: null });
      }
    }
  }
  store.atomicWriteJson(filePath, { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), bills: out });
  return out.length;
}

function validBill(b) {
  return b && typeof b === 'object' && typeof b.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b.createdAt)
    && typeof b.machine === 'string' && Number.isInteger(b.seq)
    && Array.isArray(b.lines) && Array.isArray(b.payments) && Number.isFinite(Number(b.total));
}

function readExport(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { throw new Error('ไม่พบไฟล์ หรืออ่านไฟล์ไม่ได้: ' + filePath); }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('ไฟล์นี้เสีย อ่านไม่ได้ (ไม่ใช่ไฟล์ JSON ที่สมบูรณ์) ข้อมูลเดิมในเครื่องไม่ถูกแตะ'); }
  if (!data || data.format !== FORMAT || !Array.isArray(data.bills)) throw new Error('ไม่ใช่ไฟล์บิลที่ส่งออกจากโปรแกรมนี้');
  const bad = data.bills.findIndex((b) => !validBill(b));
  if (bad >= 0) throw new Error(`บิลลำดับที่ ${bad + 1} ในไฟล์ข้อมูลไม่ครบ จึงไม่นำเข้าอะไรเลย`);
  return data.bills;
}

function importBills(dir, filePath) {
  const incoming = readExport(filePath); // everything is validated before the first write
  const have = new Set();
  for (const date of store.allDates(dir)) for (const b of store.listBills(dir, date)) have.add(originOf(b));
  let added = 0; let skipped = 0;
  for (const b of incoming) {
    const key = originOf(b);
    if (have.has(key)) { skipped++; continue; }
    const { seq, date, ...rest } = b; // eslint-disable-line no-unused-vars
    store.saveBill(dir, {
      ...rest,
      status: b.status === 'flagged' ? 'flagged' : 'pending',
      sentCount: 0, sentAt: null, confirmedAt: null,
      importedFrom: b.importedFrom || { machine: b.machine, date: dateOf(b), seq: b.seq },
    });
    have.add(key);
    added++;
  }
  return { added, skipped };
}

module.exports = { exportPending, importBills, FORMAT };
