'use strict';
// What the cashier must fix by hand in the main POS after the barcodes are typed (spec 6.7).
(function () {
  // Manual lines have no barcode in the main POS; price-edited lines were typed at the list price.
  function manualFixList(bill) {
    const out = [];
    for (const l of bill.lines || []) {
      if (l.manual) out.push({ kind: 'manual', name: l.name, qty: l.qty, price: l.price, discount: l.discount || 0 });
      else if (l.priceEdited) out.push({ kind: 'edited', name: l.name, qty: l.qty, price: l.price, discount: l.discount || 0 });
    }
    return out;
  }

  const LABEL = { cash: 'เงินสด', transfer: 'เงินโอน', gov: 'โครงการรัฐ' };
  const ORDER = ['cash', 'transfer', 'gov'];

  // One row per payment channel so the cashier can press the same amounts in the main POS.
  function paymentSummary(bill) {
    return (bill.payments || [])
      .filter((p) => p.amount > 0)
      .map((p) => ({ method: p.method, label: LABEL[p.method] || p.method, amount: p.amount }))
      .sort((a, b) => ORDER.indexOf(a.method) - ORDER.indexOf(b.method));
  }

  const api = { manualFixList, paymentSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ManualFix = api;
})();
