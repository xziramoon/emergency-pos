'use strict';
// What to type into the main POS for a bill. Manual lines have no known barcode, so they are never typed
// (the reconcile window lists them for hand entry instead).
(function () {
  function buildBarcodeList(bill) {
    const out = [];
    for (const l of bill.lines || []) {
      if (l.manual) continue;
      const n = Math.max(0, Math.round(Number(l.qty) || 0));
      for (let i = 0; i < n; i++) out.push(String(l.barcode));
    }
    return out;
  }

  // Resume after a stop: skip what was already typed (bill.sentCount).
  function remainingFrom(list, sentCount) {
    return list.slice(Math.max(0, sentCount));
  }

  // Kill limit for the typer process (spec section 7).
  function timeoutMs(count, delayMs) {
    return count * (delayMs + 500) + 10000;
  }

  const api = { buildBarcodeList, remainingFrom, timeoutMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.SendList = api;
})();
