'use strict';
(function () {

// All money math is done in integer satang to avoid float drift.
const toSatang = (n) => Math.round((Number(n) || 0) * 100);
const fromSatang = (s) => s / 100;

function round2(n) {
  return fromSatang(toSatang(n));
}

function lineTotal({ price, qty, discount }) {
  const gross = toSatang(price) * (Number(qty) || 0);
  const net = gross - toSatang(discount);
  return fromSatang(Math.max(0, net));
}

function billTotal(lines) {
  return fromSatang(lines.reduce((sum, l) => sum + toSatang(l.total), 0));
}

// total: bill total. amounts: {cash, transfer, gov}.
// Rules (spec 6.3): transfer+gov <= total; sum of all >= total; change = sum - total (from cash only).
function validatePayments(total, amounts) {
  const t = toSatang(total);
  const cash = toSatang(amounts.cash);
  const transfer = toSatang(amounts.transfer);
  const gov = toSatang(amounts.gov);
  if (cash < 0 || transfer < 0 || gov < 0) return { ok: false, error: 'ยอดติดลบไม่ได้' };
  if (transfer + gov > t) return { ok: false, error: 'ยอดโอนและโครงการรัฐรวมกันเกินยอดบิล' };
  const sum = cash + transfer + gov;
  if (sum < t) return { ok: false, error: 'ยอดรับเงินน้อยกว่ายอดบิล' };
  const payments = [];
  if (cash > 0) payments.push({ method: 'cash', amount: fromSatang(cash) });
  if (transfer > 0) payments.push({ method: 'transfer', amount: fromSatang(transfer) });
  if (gov > 0) payments.push({ method: 'gov', amount: fromSatang(gov) });
  return { ok: true, payments, change: fromSatang(sum - t) };
}

  const exported = { round2, lineTotal, billTotal, validatePayments };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else window.Bill = exported; // loaded via <script> in the renderer
})();
