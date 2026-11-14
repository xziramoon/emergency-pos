'use strict';
// Sell screen (spec 6.2). Pure cart math lives in ../shared/cart.js.
const Sell = {
  cart: [],
  $: (id) => document.getElementById(id),
  fmt: (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

  modalOpen() {
    return !!document.querySelector('dialog[open]');
  },

  focusScan() {
    if (!this.$('view-sell').hidden && !this.modalOpen()) this.$('scan').focus();
  },

  message(text) {
    this.$('sell-msg').textContent = text || '';
  },

  icon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  },

  // Steps strip: 1 scan -> 2 pay -> 3 receipt. Says where the sale is at a glance.
  setStep(n) {
    this.step = n;
    [1, 2, 3].forEach((i) => {
      const el = this.$('step-' + i);
      el.classList.toggle('is-active', i === n);
      el.classList.toggle('is-done', i < n);
    });
    this.updateEmpty();
  },

  // Risu-san mascot: basket pose before the first item, thank-you pose right after a sale.
  updateEmpty() {
    const thanks = this.step === 3 && this.cart.length === 0;
    const was = this.thanksShown;
    this.thanksShown = thanks;
    if (thanks && !was) { Mascot.play(this.$('empty-mascot'), 'is-pop'); Mascot.burst(this.$('empty-mascot')); }
    if (!thanks) this.$('empty-mascot').classList.remove('is-pop');
    this.$('empty-mascot').src = thanks ? 'assets/mascot/thanks.png' : 'assets/mascot/basket.png';
    this.$('empty-title').textContent = thanks ? 'ขอบคุณที่มาอุดหนุน' : 'ยังไม่มีสินค้าในบิล';
    this.$('empty-hint').textContent = thanks
      ? 'บิลเสร็จแล้ว ยิงสินค้าชิ้นแรกของลูกค้าคนถัดไปได้เลย'
      : 'ยิงบาร์โค้ดสินค้าชิ้นแรกเพื่อเริ่มขาย หรือพิมพ์ชื่อสินค้าในช่องด้านบน แล้วกด Enter';
  },

  // Total ticks to the new amount (instant when the user prefers reduced motion).
  showTotal(to) {
    const el = this.$('total');
    const from = this.shownTotal === undefined ? to : this.shownTotal;
    this.shownTotal = to;
    cancelAnimationFrame(this.tickId);
    clearTimeout(this.tickEnd);
    // rAF pauses while the window is hidden/occluded; never leave a stale amount on a till.
    this.tickEnd = setTimeout(() => { cancelAnimationFrame(this.tickId); el.textContent = this.fmt(to); }, 400);
    if (from === to || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { el.textContent = this.fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = this.fmt(from + (to - from) * e);
      if (k < 1) this.tickId = requestAnimationFrame(step); else el.textContent = this.fmt(to);
    };
    this.tickId = requestAnimationFrame(step);
  },

  render() {
    const body = this.$('cart-body');
    body.textContent = '';
    const prev = this.prevKeys || [];
    const keys = [];
    this.cart.forEach((l, i) => {
      const key = l.name + '|' + l.price + '|' + l.qty;
      keys.push(key);
      const tr = document.createElement('tr');
      if (l.manual) tr.className = 'flag-manual';
      else if (l.priceEdited) tr.className = 'flag-edited';
      if (prev[i] !== key && prev.length) tr.classList.add('is-new');
      const tag = l.manual ? ' <span class="tag">คีย์เอง</span>' : l.priceEdited ? ' <span class="tag">แก้ราคา</span>' : '';
      tr.innerHTML = '<td class="idx"></td><td class="name"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num total-cell"></td><td></td>';
      const c = tr.children;
      c[0].textContent = i + 1;
      c[1].textContent = l.name;
      c[1].insertAdjacentHTML('beforeend', tag);
      c[2].appendChild(this.numInput(l.price, 'ราคา', (v) => this.edit(Cart.setPrice, i, v), '0.01'));
      c[3].appendChild(this.qtyControl(l, i));
      c[4].appendChild(this.numInput(l.discount, 'ส่วนลด', (v) => this.edit(Cart.setDiscount, i, v), '0.01'));
      c[5].textContent = this.fmt(l.total);
      const del = document.createElement('button');
      del.className = 'row-del'; del.type = 'button'; del.title = 'ลบรายการนี้'; del.setAttribute('aria-label', 'ลบรายการ ' + l.name);
      del.appendChild(this.icon('i-trash'));
      del.addEventListener('click', () => { this.cart = Cart.removeLine(this.cart, i); this.render(); this.focusScan(); });
      c[6].appendChild(del);
      body.appendChild(tr);
    });
    this.prevKeys = keys;
    const s = Cart.cartSummary(this.cart);
    this.showTotal(s.total);
    this.$('counts').textContent = `${s.itemCount} รายการ · ${s.pieceCount} ชิ้น`;
    this.$('cart-empty').hidden = this.cart.length > 0;
    this.updateEmpty();
    this.$('btn-pay').disabled = this.cart.length === 0;
    this.$('btn-clear').disabled = this.cart.length === 0;
    const last = body.lastElementChild;
    if (last && prev.length < keys.length) last.scrollIntoView({ block: 'nearest' });
  },

  // - [qty] + : large targets, so a mouse click never needs aiming at a tiny field.
  qtyControl(line, i) {
    const wrap = document.createElement('div');
    wrap.className = 'qty';
    const mk = (id, label, delta) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'qty-btn'; b.setAttribute('aria-label', label);
      b.appendChild(this.icon(id));
      b.addEventListener('click', () => this.edit(Cart.setQty, i, Math.max(1, Number(line.qty) + delta)));
      return b;
    };
    wrap.appendChild(mk('i-minus', 'ลดจำนวน', -1));
    wrap.appendChild(this.numInput(line.qty, 'จำนวน', (v) => this.edit(Cart.setQty, i, v), '1', '1'));
    wrap.appendChild(mk('i-plus', 'เพิ่มจำนวน', 1));
    return wrap;
  },

  numInput(value, label, onCommit, step, min) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = value; inp.step = step; inp.className = 'cell-input';
    inp.dataset.orig = value;
    if (min !== undefined) inp.min = min;
    inp.setAttribute('aria-label', label);
    // An emptied field means "no change" (Number('') would otherwise become 0).
    const commit = () => { if (inp.value.trim() === '') { this.render(); return; } onCommit(Number(inp.value)); };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    return inp;
  },

  edit(fn, idx, value) {
    this.cart = fn(this.cart, idx, value);
    this.render();
    this.focusScan();
  },

  add(product) {
    this.setStep(1);
    this.cart = Cart.addProduct(this.cart, product);
    this.hideResults();
    this.message('');
    this.render();
    this.focusScan();
  },

  hideResults() {
    const r = this.$('results');
    r.hidden = true; r.textContent = '';
  },

  showResults(items) {
    const r = this.$('results');
    r.textContent = '';
    items.forEach((p) => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.textContent = `${p.name} (${p.unit}) — ${this.fmt(p.price)}`;
      li.addEventListener('click', () => { this.$('scan').value = ''; this.add(p); });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') li.click(); });
      r.appendChild(li);
    });
    r.hidden = items.length === 0;
  },

  async onScan() {
    const input = this.$('scan');
    const text = input.value.trim();
    input.value = '';
    this.hideResults();
    if (!text) return;
    const found = await window.api.findByBarcode(text);
    if (found) return this.add(found);
    if (/^[0-9A-Za-z\-]+$/.test(text) && /\d/.test(text) && text.length >= 6) return this.openManual(text);
    const list = await window.api.searchByName(text);
    if (list.length === 1) { this.add(list[0]); return; }
    if (list.length > 1) { this.showResults(list); this.message('เลือกสินค้าจากรายการ'); return; }
    this.openManual('', text);
  },

  openManual(barcode, name) {
    this.manualBarcode = barcode || '';
    this.$('manual-hint').textContent = barcode ? `ไม่พบบาร์โค้ด ${barcode} ในรายการสินค้า` : 'ไม่พบสินค้านี้ในรายการ';
    this.$('man-name').value = name || '';
    this.$('man-price').value = '';
    this.$('man-qty').value = '1';
    this.$('man-err').textContent = '';
    this.$('dlg-manual').showModal();
    (name ? this.$('man-price') : this.$('man-name')).focus();
  },

  submitManual(e) {
    e.preventDefault();
    try {
      this.cart = Cart.addManual(this.cart, {
        barcode: this.manualBarcode, name: this.$('man-name').value,
        price: Number(this.$('man-price').value), qty: Number(this.$('man-qty').value),
      });
    } catch (err) {
      this.$('man-err').textContent = err.message;
      return;
    }
    this.$('dlg-manual').close();
    this.setStep(1);
    this.render();
    this.focusScan();
  },

  clear() {
    if (this.cart.length === 0) return;
    // A <dialog>, not window.confirm(): confirm() can leave inputs unable to type in Electron on Windows.
    this.$('dlg-clear').showModal();
    this.$('clear-no').focus();
  },

  // The last-sale reprint button is always available after a sale (paper jam, out of paper...);
  // `urgent` only changes the emphasis when the automatic print just failed.
  showReprint(urgent) {
    const b = this.$('btn-reprint');
    b.hidden = !this.lastSaved;
    b.classList.toggle('btn-primary', !!urgent);
  },

  async reprint() {
    if (!this.lastSaved) return;
    this.message('กำลังพิมพ์ซ้ำ...');
    const r = await window.api.printReceipt(this.lastSaved);
    this.message(r.ok ? 'พิมพ์ซ้ำแล้ว' : 'พิมพ์ไม่สำเร็จ: ' + r.error);
    this.focusScan();
  },

  newBill(message) {
    this.cart = [];
    this.message(message);
    this.render();
    this.focusScan();
  },

  init() {
    this.$('scan').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.onScan(); }
      if (e.key === 'Escape') { this.hideResults(); }
    });
    this.$('form-manual').addEventListener('submit', (e) => this.submitManual(e));
    this.$('man-cancel').addEventListener('click', () => { this.$('dlg-manual').close(); this.focusScan(); });
    this.$('form-clear').addEventListener('submit', () => { this.cart = []; this.setStep(1); this.render(); });
    this.$('clear-no').addEventListener('click', () => this.$('dlg-clear').close());
    this.$('btn-pay').addEventListener('click', () => Pay.open());
    this.$('btn-clear').addEventListener('click', () => this.clear());
    this.$('btn-reprint').addEventListener('click', () => this.reprint());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F11' && !this.$('view-sell').hidden && !this.modalOpen()) { e.preventDefault(); Pay.open(); }
    });
    // Keep focus in the scan field: after any dialog closes or a click on empty space.
    document.addEventListener('close', () => setTimeout(() => this.focusScan(), 0), true);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('input, button, li, dialog, select, textarea')) this.focusScan();
    });
    this.initFocusGuard();
    this.render();
  },

  // ---- Scanner focus guard: a scan must never be lost, and never land in a price/qty cell. ----
  activeKind() {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    if (a === this.$('scan')) return 'scan';
    if (a.classList.contains('cell-input')) return 'cell';
    if (a.closest('input, textarea, select')) return 'other';
    return 'button';
  },

  guardState() {
    return {
      sellVisible: !this.$('view-sell').hidden, modalOpen: this.modalOpen(),
      active: this.activeKind(), idleMs: Date.now() - this.lastActivity,
    };
  },

  updateScanStatus() {
    const st = FocusGuard.scanStatus({ hasFocus: document.hasFocus(), scanFocused: document.activeElement === this.$('scan') });
    const el = this.$('scan-status');
    el.className = 'scan-status is-' + st;
    el.textContent = { ready: 'พร้อมสแกน', lost: 'คลิกช่องสแกน', away: 'คลิกที่หน้าต่างนี้' }[st];
  },

  guardTick() {
    if (FocusGuard.decideFocus(this.guardState()) === 'scan') {
      const a = document.activeElement;
      if (a && a !== document.body) a.blur(); // an idle half-typed cell commits normally
      this.$('scan').focus();
    }
    this.updateScanStatus();
  },

  initFocusGuard() {
    this.lastActivity = Date.now();
    this.burst = FocusGuard.createBurstDetector();
    const scan = this.$('scan');
    const touch = () => { this.lastActivity = Date.now(); };
    document.addEventListener('pointerdown', touch, true);
    document.addEventListener('focusin', touch, true);
    document.addEventListener('keydown', (e) => {
      touch();
      const s = this.guardState();
      const printable = typeof e.key === 'string' && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (s.sellVisible && !s.modalOpen && s.active === 'cell' && printable) {
        // Several keys a few ms apart = barcode scanner pointed at the wrong place: undo and re-route.
        const r = this.burst.push(e.key, e.timeStamp);
        if (r.burst) {
          e.preventDefault();
          const cell = document.activeElement;
          if (cell.dataset.orig !== undefined) cell.value = cell.dataset.orig;
          scan.focus();
          scan.value = r.text;
          this.burst.reset();
        }
        return;
      }
      if (FocusGuard.keyAction(s, e) === 'redirect') {
        e.preventDefault();
        scan.focus();
        scan.value += e.key;
      }
    }, true);
    scan.addEventListener('focus', () => this.updateScanStatus());
    scan.addEventListener('blur', () => setTimeout(() => this.updateScanStatus(), 0));
    window.addEventListener('focus', () => this.guardTick());
    window.addEventListener('blur', () => this.updateScanStatus());
    document.addEventListener('visibilitychange', () => this.guardTick());
    if (window.api.onWindowFocus) window.api.onWindowFocus(() => this.guardTick());
    setInterval(() => this.guardTick(), 1000);
    this.updateScanStatus();
  },
};

App.onShowSell = () => { Sell.setStep(1); Sell.render(); Sell.focusScan(); };
Sell.init();
