'use strict';
// Daily summary (spec 6.9). Pure: bills in, totals out. Money is added in integer satang.
(function () {
  const sat = (n) => Math.round((Number(n) || 0) * 100);
  const baht = (s) => s / 100;

  // Groups: pending (incl. sending) / sent (typed + confirmed) / flagged / void. Void is never in billCount/sales.
  function summarize(bills) {
    const acc = { billCount: 0, sales: 0, cash: 0, transfer: 0, gov: 0, change: 0 };
    const grp = { pending: [0, 0], sent: [0, 0], flagged: [0, 0], void: [0, 0] };
    const byCashier = {};
    const bump = (g, total) => { g[0] += 1; g[1] += total; };
    for (const b of bills) {
      const total = sat(b.total);
      if (b.status === 'void') { bump(grp.void, total); continue; }
      acc.billCount += 1;
      acc.sales += total;
      for (const p of b.payments || []) if (p.method in acc) acc[p.method] += sat(p.amount);
      acc.change += sat(b.change);
      const who = b.cashier || '-';
      byCashier[who] = byCashier[who] || [0, 0];
      bump(byCashier[who], total);
      if (b.status === 'typed' || b.status === 'confirmed') bump(grp.sent, total);
      else if (b.status === 'flagged') bump(grp.flagged, total);
      else bump(grp.pending, total);
    }
    const out = (g) => ({ count: g[0], sales: baht(g[1]) });
    return {
      billCount: acc.billCount,
      sales: baht(acc.sales),
      cash: baht(acc.cash),
      transfer: baht(acc.transfer),
      gov: baht(acc.gov),
      netCash: baht(acc.cash - acc.change),
      byCashier: Object.fromEntries(Object.entries(byCashier).map(([k, g]) => [k, out(g)])),
      pending: out(grp.pending),
      sent: out(grp.sent),
      flagged: out(grp.flagged),
      void: out(grp.void),
    };
  }

  const api = { summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Summary = api;
})();
