'use strict';
// Bills screen (spec 6.5) and the send flow (spec 6.6). Status rules live in shared/billstate.js.
const Pending = {
  filter: 'open',
  bills: [],
  target: null, // the bill the confirm/result dialogs are about
  $: (id) => document.getElementById(id),
  fmt: (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  methodName: { cash: 'เงินสด', transfer: 'เงินโอน', gov: 'โครงการรัฐ' },

  async open() {
    this.$('pend-msg').textContent = '';
    await this.load();
    App.show('pending');
  },

  async load() {
    this.bills = await window.api.listBills(this.filter);
    const warns = await window.api.getWarnings();
    const w = this.$('pend-warn');
    const check = warns.filter((x) => /ตรวจรายการสุดท้าย/.test(x));
    w.textContent = check.length ? '⚠ ' + check[check.length - 1] : '';
    w.hidden = check.length === 0;
    this.render();
  },

  tag(text) {
    const s = document.createElement('span');
    s.className = 'tag'; s.textContent = text;
    return s;
  },

  btn(text, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-small ' + (cls || ''); b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  },

  render() {
    const body = this.$('pend-body');
    body.textContent = '';
    const firstPending = this.bills.find((b) => b.status === 'pending');
    for (const b of this.bills) {
      const tr = document.createElement('tr');
      const cell = (text, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; };
      cell(b.seq, 'idx');
      cell(b.createdAt.slice(11, 16));
      cell(b.cashier);
      cell(b.lines.length, 'num');
      cell(this.fmt(b.total), 'num');
      cell(b.payments.map((p) => this.methodName[p.method] || p.method).join(' + ') || '-');
      const st = cell(BillState.statusLabel(b.status));
      st.classList.add('st-' + b.status);
      if (b.status === 'pending' && b.sentCount > 0) {
        const total = SendList.buildBarcodeList(b).length;
        st.appendChild(this.tag(`พิมพ์แล้ว ${b.sentCount}/${total}`));
      }
      const fl = BillState.flagsOf(b);
      if (fl.manual) st.appendChild(this.tag('มีรายการคีย์เอง'));
      if (fl.priceEdited) st.appendChild(this.tag('มีแก้ราคา'));
      if (b.status === 'flagged' && b.flagNote) st.appendChild(this.tag(b.flagNote));
      if (b.status === 'void' && b.void) st.appendChild(this.tag(b.void.reason));

      const act = document.createElement('td');
      act.className = 'pend-actions';
      if (b.status === 'pending') {
        if (b.sentCount > 0) {
          act.appendChild(this.btn('ส่งต่อจากรายการที่เหลือ', 'btn-go', () => this.askSend(b, true)));
          act.appendChild(this.btn('ส่งใหม่ตั้งแต่ต้น', '', () => this.askSend(b, false)));
        } else {
          act.appendChild(this.btn('ส่งเข้า POS หลัก', b === firstPending ? 'btn-go' : '', () => this.askSend(b, false)));
        }
      } else if (b.status === 'typed') {
        act.appendChild(this.btn('เทียบยอด', 'btn-go', () => window.api.openReconcile(b.date, b.seq)));
      } else if (b.status === 'flagged') {
        act.appendChild(this.btn('ส่งใหม่', '', () => this.askSend(b, false)));
      }
      act.appendChild(this.btn('ดู', 'btn-quiet', () => this.showBill(b)));
      if (b.status !== 'void') act.appendChild(this.btn('พิมพ์ซ้ำ', 'btn-quiet', () => this.reprint(b)));
      if (['pending', 'typed', 'flagged'].includes(b.status)) act.appendChild(this.btn('ยกเลิกบิล', 'btn-quiet', () => this.askVoid(b)));
      tr.appendChild(act);
      body.appendChild(tr);
    }
    const empty = this.bills.length === 0;
    this.$('pend-empty').hidden = !empty;
    this.$('pend-empty-title').textContent = { open: 'ไม่มีบิลค้างส่ง', sent: 'ยังไม่มีบิลที่ส่งแล้ว', void: 'ไม่มีบิลที่ยกเลิก' }[this.filter];
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.filter === this.filter;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  },

  // ---- send flow ----
  askSend(bill, resume) {
    this.target = { bill, resume };
    const total = SendList.buildBarcodeList(bill).length;
    const left = resume ? total - (bill.sentCount || 0) : total;
    this.$('send-title').textContent = resume ? 'ส่งต่อเข้า POS หลัก' : 'ส่งบิลเข้า POS หลัก';
    this.$('send-summary').textContent = resume
      ? `บิล #${bill.seq} ยอด ${this.fmt(bill.total)} บาท: พิมพ์ไปแล้ว ${bill.sentCount} จะพิมพ์ต่ออีก ${left} รายการ (ตรวจดูใน POS หลักก่อนว่ารายการสุดท้ายลงครบ)`
      : `บิล #${bill.seq} ยอด ${this.fmt(bill.total)} บาท: จะพิมพ์บาร์โค้ด ${total} รายการ`;
    this.$('dlg-send').showModal();
    this.$('send-go').focus();
  },

  async doSend() {
    const { bill, resume } = this.target;
    const total = SendList.buildBarcodeList(bill).length;
    this.$('dlg-send').close();
    this.$('sending-n').textContent = resume ? bill.sentCount : 0;
    this.$('sending-total').textContent = total;
    this.$('sending-bar').max = total;
    this.$('sending-bar').value = resume ? bill.sentCount : 0;
    const dlg = this.$('dlg-sending');
    dlg.showModal();
    let r;
    try {
      r = await (resume ? window.api.resumeBill(bill.date, bill.seq) : window.api.sendBill(bill.date, bill.seq));
    } catch (e) {
      r = { ok: false, error: (e && e.message) || String(e) };
    }
    dlg.close();
    await this.load();
    App.refreshStatus();
    this.showResult(r, bill);
  },

  onProgress(p) {
    if (!this.$('dlg-sending').open) return;
    this.$('sending-n').textContent = p.typed;
    this.$('sending-total').textContent = p.total;
    this.$('sending-bar').max = p.total;
    this.$('sending-bar').value = p.typed;
  },

  showResult(r, bill) {
    const resumeBtn = this.$('result-resume');
    resumeBtn.hidden = true;
    if (!r.ok) {
      this.$('result-title').textContent = 'ส่งไม่สำเร็จ';
      this.$('result-text').textContent = r.error;
    } else if (r.done) {
      this.$('result-title').textContent = 'ส่งครบแล้ว';
      this.$('result-text').textContent = `พิมพ์บาร์โค้ดเข้า POS หลักครบ ${r.typed} รายการ ให้เทียบยอดกับ POS หลักในหน้าต่างเทียบยอด แล้วกดรับเงินใน POS หลักให้ตรง`;
    } else {
      this.$('result-title').textContent = 'หยุดกลางทาง';
      this.$('result-text').textContent = r.message;
      if (r.typed > 0) { this.target = { bill: r.bill ? { ...r.bill, date: bill.date } : bill, resume: true }; resumeBtn.hidden = false; }
    }
    this.$('dlg-result').showModal();
  },

  // ---- details / reprint ----
  showBill(b) {
    this.$('bill-title').textContent = `บิล #${b.seq} · ${BillState.statusLabel(b.status)}`;
    this.$('bill-meta').textContent = `${b.date} ${b.createdAt.slice(11, 16)} · พนักงาน ${b.cashier} · เครื่อง ${b.machine}`;
    const body = this.$('bill-lines');
    body.textContent = '';
    for (const l of b.lines) {
      const tr = document.createElement('tr');
      [l.name + (l.manual ? ' (คีย์เอง)' : l.priceEdited ? ' (แก้ราคา)' : ''), this.fmt(l.price), l.qty, this.fmt(l.discount || 0), this.fmt(l.total)].forEach((v, i) => {
        const td = document.createElement('td'); td.textContent = v; if (i > 0) td.className = 'num'; tr.appendChild(td);
      });
      body.appendChild(tr);
    }
    this.$('bill-pay').textContent = `ยอด ${this.fmt(b.total)} · ` + b.payments.map((p) => `${this.methodName[p.method] || p.method} ${this.fmt(p.amount)}`).join(' + ') + ` · เงินทอน ${this.fmt(b.change)}`;
    this.$('dlg-bill').showModal();
  },

  // ---- void (spec 6.8): never deleted, needs a reason ----
  askVoid(b) {
    this.target = { bill: b };
    this.$('void-title').textContent = `ยกเลิกบิล #${b.seq} ยอด ${this.fmt(b.total)} บาท?`;
    this.$('void-reason').value = '';
    this.$('void-err').textContent = '';
    this.$('dlg-void').showModal();
    this.$('void-reason').focus();
  },

  async doVoid() {
    const b = this.target.bill;
    const reason = this.$('void-reason').value.trim();
    if (!reason) { this.$('void-err').textContent = 'ต้องใส่เหตุผลที่ยกเลิกบิล'; return; }
    const r = await window.api.voidBill(b.date, b.seq, { by: App.cashier, reason });
    if (!r.ok) { this.$('void-err').textContent = r.error; return; }
    this.$('dlg-void').close();
    this.$('pend-msg').textContent = `ยกเลิกบิล #${b.seq} แล้ว (เก็บไว้ในแท็บ "ยกเลิก")`;
    await this.load();
    App.refreshStatus();
  },

  async reprint(b) {
    this.$('pend-msg').textContent = 'กำลังพิมพ์ซ้ำ...';
    const r = await window.api.printReceipt(b);
    this.$('pend-msg').textContent = r.ok ? `พิมพ์ใบเสร็จบิล #${b.seq} ซ้ำแล้ว` : 'พิมพ์ไม่สำเร็จ: ' + r.error;
  },

  init() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { this.filter = t.dataset.filter; this.load(); }));
    this.$('btn-pending').addEventListener('click', () => this.open());
    this.$('btn-close-pending').addEventListener('click', () => { App.refreshStatus(); App.show('sell'); });
    this.$('form-send').addEventListener('submit', (e) => { e.preventDefault(); this.doSend(); });
    this.$('send-cancel').addEventListener('click', () => this.$('dlg-send').close());
    // Esc must not dismiss the "sending" dialog: the typer keeps going either way.
    this.$('dlg-sending').addEventListener('cancel', (e) => e.preventDefault());
    this.$('result-close').addEventListener('click', () => this.$('dlg-result').close());
    this.$('result-resume').addEventListener('click', () => { this.$('dlg-result').close(); this.askSend(this.target.bill, true); });
    this.$('bill-close').addEventListener('click', () => this.$('dlg-bill').close());
    window.api.onSendProgress((p) => this.onProgress(p));
    this.$('form-void').addEventListener('submit', (e) => { e.preventDefault(); this.doVoid(); });
    this.$('void-no').addEventListener('click', () => this.$('dlg-void').close());
    // The reconcile window is a separate window: refresh when it confirms/flags a bill.
    window.api.onBillsChanged(() => { App.refreshStatus(); if (!this.$('view-pending').hidden) this.load(); });
  },
};
Pending.init();
