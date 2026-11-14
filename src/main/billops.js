'use strict';
// Bill actions that change status: send / resume / reconcile / void. No electron imports (unit-testable).
const store = require('./store');
const { canTransition, describeStop } = require('../shared/billstate');
const { buildBarcodeList, remainingFrom } = require('../shared/sendlist');

let sending = false; // one send at a time: the typer owns the keyboard

function findBill(dir, date, seq) {
  const b = store.listBills(dir, date).find((x) => x.seq === seq);
  if (!b) throw new Error(`ไม่พบบิล ${date} #${seq}`);
  return b;
}

function setStatus(dir, date, seq, to, patch = {}) {
  const b = findBill(dir, date, seq);
  if (!canTransition(b.status, to)) throw new Error(`เปลี่ยนสถานะ ${b.status} เป็น ${to} ไม่ได้`);
  return store.updateBill(dir, date, seq, { ...patch, status: to });
}

async function run({ dir, date, seq, settings, script, runTyper, resume, notify }) {
  if (sending) return { ok: false, error: 'กำลังส่งบิลอื่นอยู่ รอให้เสร็จก่อน' };
  let bill;
  try { bill = findBill(dir, date, seq); } catch (e) { return { ok: false, error: e.message }; }
  if (bill.status !== 'pending' && bill.status !== 'flagged') {
    return { ok: false, error: `บิลนี้อยู่ในสถานะ "${bill.status}" ส่งไม่ได้` };
  }
  const full = buildBarcodeList(bill);
  if (full.length === 0) return { ok: false, error: 'บิลนี้ไม่มีบาร์โค้ดให้พิมพ์ (มีแต่รายการคีย์เอง) ต้องคีย์ใน POS หลักเอง' };
  // Resuming keeps sentCount; a plain send (or a re-send of a flagged bill) starts over at zero.
  const from = resume && bill.status === 'pending' ? Math.min(bill.sentCount || 0, full.length) : 0;
  const list = remainingFrom(full, from);
  if (list.length === 0) return { ok: false, error: 'พิมพ์ครบทุกรายการแล้ว' };

  sending = true;
  try {
    if (bill.status === 'flagged') setStatus(dir, date, seq, 'pending', { sentCount: 0 });
    setStatus(dir, date, seq, 'sending', { sentCount: from });
    let res;
    try {
      res = await runTyper({
        list, delayMs: settings.delayMs, windowLike: settings.windowLike, script,
        onProgress: (n) => { store.updateBill(dir, date, seq, { sentCount: from + n }); if (notify) notify({ date, seq, typed: from + n, total: full.length }); },
      });
    } catch (e) {
      setStatus(dir, date, seq, 'pending');
      return { ok: false, error: (e && e.message) || String(e) };
    }
    const sent = from + res.typed;
    if (res.done) {
      const b = setStatus(dir, date, seq, 'typed', { sentCount: sent, sentAt: new Date().toISOString() });
      return { ok: true, done: true, typed: sent, total: full.length, bill: b };
    }
    const b = setStatus(dir, date, seq, 'pending', { sentCount: sent });
    return { ok: true, done: false, typed: sent, total: full.length, lastBarcode: res.lastBarcode, reason: res.reason, message: describeStop(res.reason, sent, res.lastBarcode), bill: b };
  } finally {
    sending = false;
  }
}

const sendBill = (o) => run({ ...o, resume: false });
const resumeBill = (o) => run({ ...o, resume: true });

// Reconcile (spec 6.7): the cashier compared totals with the main POS.
function confirmReceived({ dir, date, seq }) {
  return setStatus(dir, date, seq, 'confirmed', { confirmedAt: new Date().toISOString() });
}

function flagBill({ dir, date, seq, note }) {
  return setStatus(dir, date, seq, 'flagged', { flagNote: String(note || '').trim() });
}

// Void (spec 6.8): never deletes; needs a reason; not allowed once confirmed.
function voidBill({ dir, date, seq, by, reason }) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('ต้องใส่เหตุผลที่ยกเลิกบิล');
  return setStatus(dir, date, seq, 'void', { void: { at: new Date().toISOString(), by: String(by || '').trim() || '-', reason: why } });
}

module.exports = { sendBill, resumeBill, setStatus, findBill, confirmReceived, flagBill, voidBill };
