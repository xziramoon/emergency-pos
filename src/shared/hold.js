'use strict';
// Parked ("พักบิล") bills: a cart set aside while the cashier serves someone else. Pure list helpers.
(function () {
  const total = (lines) => Math.round(lines.reduce((s, l) => s + Math.round(Number(l.total) * 100), 0)) / 100;

  // Returns a new list with the cart appended; an empty cart returns the same list.
  function hold(list, cart, { id, at, cashier }) {
    if (!cart.length) return list;
    const lines = cart.map((l) => ({ ...l }));
    return [...list, { id, at, cashier, lines, total: total(lines) }];
  }

  // { lines, held }: the parked lines (or null) and the list without that bill.
  function take(list, id) {
    const found = list.find((h) => h.id === id);
    if (!found) return { lines: null, held: list };
    return { lines: found.lines.map((l) => ({ ...l })), held: list.filter((h) => h.id !== id) };
  }

  const wellFormed = (h) => h && typeof h.id === 'string' && typeof h.at === 'string'
    && Array.isArray(h.lines) && h.lines.length > 0 && Number.isFinite(Number(h.total));

  function parse(text) {
    try { const v = JSON.parse(text); return Array.isArray(v) ? v.filter(wellFormed) : []; } catch { return []; }
  }

  const api = { hold, take, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Hold = api;
})();
