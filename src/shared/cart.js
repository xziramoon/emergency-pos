'use strict';
// Pure cart logic: every function returns a new cart and never mutates its input.
// Loaded with require() in Node and via <script> in the renderer.
(function () {
  const Bill = typeof require === 'function' ? require('./bill') : window.Bill;
  const { lineTotal, billTotal, round2 } = Bill;

  const MAX_QTY = 9999;
  const MAX_MONEY = 999999.99;
  const isPosInt = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_QTY;
  const isMoney = (n) => Number.isFinite(n) && n >= 0 && n <= MAX_MONEY;

  function withTotal(line) {
    return { ...line, total: lineTotal(line) };
  }

  function addProduct(cart, product, qty = 1) {
    const i = cart.findIndex((l) => l.barcode === product.barcode && !l.manual && !l.priceEdited);
    if (i >= 0) {
      return cart.map((l, j) => (j === i ? withTotal({ ...l, qty: l.qty + qty }) : l));
    }
    return [...cart, withTotal({
      barcode: product.barcode, name: product.name, unit: product.unit || '', qty,
      price: product.price, listPrice: product.price, discount: 0,
      manual: false, priceEdited: false,
    })];
  }

  function addManual(cart, { barcode = '', name, price, qty }) {
    const nm = String(name || '').trim();
    if (!nm) throw new Error('กรุณาใส่ชื่อสินค้า');
    if (!isMoney(Number(price))) throw new Error('ราคาไม่ถูกต้อง');
    if (!isPosInt(qty)) throw new Error('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ' + MAX_QTY);
    return [...cart, withTotal({
      barcode: String(barcode || ''), name: nm, unit: '', qty, price: round2(price), listPrice: round2(price),
      discount: 0, manual: true, priceEdited: false,
    })];
  }

  function setQty(cart, idx, qty) {
    if (!isPosInt(qty)) return cart.slice();
    return cart.map((l, i) => {
      if (i !== idx) return l;
      const discount = Math.min(l.discount, round2(l.price * qty));
      return withTotal({ ...l, qty, discount });
    });
  }

  function setPrice(cart, idx, price) {
    const p = Number(price);
    if (!isMoney(p)) return cart.slice();
    return cart.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, price: round2(p), priceEdited: true };
      next.discount = Math.min(next.discount, round2(next.price * next.qty));
      return withTotal(next);
    });
  }

  function setDiscount(cart, idx, baht) {
    const d = Number(baht);
    if (!isMoney(d)) return cart.slice();
    return cart.map((l, i) => {
      if (i !== idx) return l;
      const capped = Math.min(round2(d), round2(l.price * l.qty));
      return withTotal({ ...l, discount: capped, priceEdited: true });
    });
  }

  function removeLine(cart, idx) {
    return cart.filter((_, i) => i !== idx);
  }

  function cartSummary(cart) {
    return {
      total: billTotal(cart),
      itemCount: cart.length,
      pieceCount: cart.reduce((s, l) => s + l.qty, 0),
    };
  }

  // ISO-8601 with the machine's local offset, e.g. 2026-11-12T16:20:05+07:00
  function localIso(d) {
    const p = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
      `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
  }

  function toBill(cart, { machine, cashier, now, payments, change }) {
    return {
      machine,
      createdAt: localIso(now),
      cashier,
      lines: cart.map((l) => ({ ...l })),
      total: billTotal(cart),
      payments,
      change,
      status: 'pending',
      sentCount: 0,
      sentAt: null,
      confirmedAt: null,
      void: null,
    };
  }

  const api = { addProduct, addManual, setQty, setPrice, setDiscount, removeLine, cartSummary, toBill, localIso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Cart = api;
})();
