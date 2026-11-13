'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  machineId: 'POS02',
  staff: [],
  shopName: 'UNG LUK SENG',
  productsUrl: '', // entered once in Settings: the repo is public, so the Sheet link is not shipped
  columnMap: null,
  printer: '',
  delayMs: 600,
  windowLike: '*Sea And Hill POS*',
};

// Write to file.tmp, flush to disk, then rename over the target. A power cut
// leaves either the old file or the new one, never a half-written file.
function atomicWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadSettings(dir) {
  return { ...DEFAULT_SETTINGS, ...readJson(path.join(dir, 'settings.json'), {}) };
}

function saveSettings(dir, s) {
  atomicWriteJson(path.join(dir, 'settings.json'), s);
}

const billsFile = (dir, date) => path.join(dir, 'bills', date + '.json');
const dateOf = (createdAt) => createdAt.slice(0, 10);

const warnings = [];
const seqFloor = new Map(); // dir|date -> minimum seq already "used" (after a corrupt file with no backup)
const getWarnings = () => warnings.slice();
const clearWarnings = () => { warnings.length = 0; };

function newestBackupCopy(dir, date) {
  const root = path.join(dir, 'backup');
  if (!fs.existsSync(root)) return null;
  for (const n of fs.readdirSync(root).sort().reverse()) {
    const data = readJson(path.join(root, n, date + '.json'), null);
    if (Array.isArray(data)) return data;
  }
  return null;
}

// Never throws and never overwrites a file it could not read: the bad file is renamed
// aside, then restored from the newest backup if there is one, otherwise seq restarts at 1001
// so numbers cannot collide with bills that may already have been typed into the main POS.
function listBills(dir, date) {
  const f = billsFile(dir, date);
  if (!fs.existsSync(f)) return [];
  const data = readJson(f, null);
  if (Array.isArray(data)) return data;
  const aside = path.join(dir, 'bills', `${date}.corrupt-${Date.now()}.json`);
  fs.renameSync(f, aside);
  const backup = newestBackupCopy(dir, date);
  if (backup) {
    atomicWriteJson(f, backup);
    warnings.push(`ไฟล์บิลวันที่ ${date} เสีย กู้คืนจากไฟล์สำรองแล้ว (บิลหลังการสำรองล่าสุดอาจหาย) ไฟล์เดิมเก็บไว้ที่ ${aside}`);
    return backup;
  }
  seqFloor.set(dir + '|' + date, 1000);
  warnings.push(`ไฟล์บิลวันที่ ${date} เสียและไม่มีไฟล์สำรอง บิลใหม่จะเริ่มที่เลข 1001 ไฟล์เดิมเก็บไว้ที่ ${aside}`);
  return [];
}

function saveBill(dir, bill) {
  const date = dateOf(bill.createdAt);
  const bills = listBills(dir, date);
  const out = { ...bill };
  if (!out.seq) out.seq = bills.reduce((m, b) => Math.max(m, b.seq), seqFloor.get(dir + '|' + date) || 0) + 1;
  bills.push(out);
  atomicWriteJson(billsFile(dir, date), bills);
  return out;
}

function updateBill(dir, date, seq, patch) {
  const bills = listBills(dir, date);
  const i = bills.findIndex((b) => b.seq === seq);
  if (i < 0) throw new Error(`ไม่พบบิล ${date} #${seq}`);
  bills[i] = { ...bills[i], ...patch };
  atomicWriteJson(billsFile(dir, date), bills);
  return bills[i];
}

function allDates(dir) {
  const d = path.join(dir, 'bills');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => n.slice(0, 10)).sort();
}

function listPending(dir) {
  const out = [];
  for (const date of allDates(dir)) {
    for (const b of listBills(dir, date)) {
      if (b.status !== 'confirmed' && b.status !== 'void') out.push(b);
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

function recoverSending(dir) {
  let n = 0;
  for (const date of allDates(dir)) {
    const bills = listBills(dir, date);
    let changed = false;
    for (const b of bills) {
      if (b.status === 'sending') { b.status = 'pending'; changed = true; n++; }
    }
    if (changed) atomicWriteJson(billsFile(dir, date), bills);
  }
  return n;
}

function makeBackup(dir, now) {
  const src = path.join(dir, 'bills');
  const root = path.join(dir, 'backup');
  fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(src)) {
    const name = now.toISOString().replace(/[:.]/g, '-');
    fs.cpSync(src, path.join(root, name), { recursive: true });
  }
  const cutoff = now.getTime() - 30 * 24 * 3600 * 1000;
  for (const n of fs.readdirSync(root)) {
    const t = Date.parse(n.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z$/, '$1:$2:$3.$4Z'));
    if (!Number.isNaN(t) && t < cutoff) fs.rmSync(path.join(root, n), { recursive: true, force: true });
  }
}

module.exports = {
  DEFAULT_SETTINGS, atomicWriteJson, loadSettings, saveSettings,
  getWarnings, clearWarnings, saveBill, updateBill, listBills, listPending, recoverSending, makeBackup, allDates,
};
