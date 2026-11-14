'use strict';
// Daily summary screen (spec 6.9). The numbers come from shared/summary.js; main prints from the same bills.
const SummaryView = {
  date: '',
  machine: '', // '' = all machines
  all: [],
  $: (id) => document.getElementById(id),
  fmt: (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  shift(days) {
    const [y, m, d] = this.date.split('-').map(Number);
    const t = new Date(y, m - 1, d + days);
    this.date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  },

  async open() {
    this.$('sum-msg').textContent = '';
    this.date = this.date || this.todayStr();
    await this.load();
    App.show('summary');
  },

  async load() {
    this.all = await window.api.listBills('all');
    const machines = [...new Set(this.all.map((b) => b.machine))].sort();
    const sel = this.$('sum-machine');
    if (this.machine && !machines.includes(this.machine)) this.machine = '';
    sel.textContent = '';
    for (const [v, t] of [['', 'ทุกเครื่อง'], ...machines.map((m) => [m, 'เครื่อง ' + m])]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o);
    }
    sel.value = this.machine;
    this.render();
  },

  dayBills() {
    return this.all.filter((b) => b.date === this.date && (!this.machine || b.machine === this.machine));
  },

  row(tbody, label, count, sales, cls) {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    const a = document.createElement('td'); a.textContent = label;
    const b = document.createElement('td'); b.className = 'num'; b.textContent = count + ' บิล';
    const c = document.createElement('td'); c.className = 'num'; c.textContent = this.fmt(sales);
    tr.append(a, b, c); tbody.appendChild(tr);
  },

  render() {
    this.$('sum-date').value = this.date;
    const bills = this.dayBills();
    const s = Summary.summarize(bills);
    const empty = bills.length === 0;
    this.$('sum-body').hidden = empty;
    this.$('sum-empty').hidden = !empty;
    this.$('sum-print').disabled = empty;
    this.$('sum-empty').querySelector('.empty-title').textContent = this.date === this.todayStr() ? 'วันนี้ยังไม่มีบิล' : 'วันที่เลือกไม่มีบิล';
    if (empty) return;
    this.$('sum-count').textContent = `${s.billCount} บิล`;
    this.$('sum-sales').textContent = this.fmt(s.sales);
    this.$('sum-net').textContent = this.fmt(s.netCash);
    this.$('sum-net-note').textContent = `รับเงินสด ${this.fmt(s.cash)} หักเงินทอน ${this.fmt(s.cash - s.netCash)}`;
    this.$('sum-transfer').textContent = this.fmt(s.transfer);
    this.$('sum-gov').textContent = this.fmt(s.gov);
    const cs = this.$('sum-cashiers'); cs.textContent = '';
    for (const [name, g] of Object.entries(s.byCashier)) this.row(cs, name, g.count, g.sales);
    const st = this.$('sum-status'); st.textContent = '';
    this.row(st, 'ส่งเข้า POS หลักแล้ว', s.sent.count, s.sent.sales);
    this.row(st, 'ยังไม่ส่ง', s.pending.count, s.pending.sales, s.pending.count ? 'sum-attn' : '');
    if (s.flagged.count) this.row(st, 'ต้องตรวจสอบ', s.flagged.count, s.flagged.sales, 'sum-attn');
    this.row(st, 'ยกเลิก (ไม่รวมในยอดขาย)', s.void.count, s.void.sales, 'sum-void');
  },

  async print() {
    this.$('sum-msg').textContent = 'กำลังพิมพ์...';
    const r = await window.api.printSummary({ date: this.date, machine: this.machine, bills: this.dayBills() });
    this.$('sum-msg').textContent = r.ok ? 'พิมพ์ใบสรุปแล้ว' : 'พิมพ์ไม่สำเร็จ: ' + r.error;
  },

  init() {
    this.$('btn-summary').addEventListener('click', () => this.open());
    this.$('btn-close-summary').addEventListener('click', () => { App.refreshStatus(); App.show('sell'); });
    this.$('sum-prev').addEventListener('click', () => { this.shift(-1); this.render(); });
    this.$('sum-next').addEventListener('click', () => { this.shift(1); this.render(); });
    this.$('sum-today').addEventListener('click', () => { this.date = this.todayStr(); this.render(); });
    this.$('sum-date').addEventListener('change', (e) => { if (e.target.value) { this.date = e.target.value; this.render(); } });
    this.$('sum-machine').addEventListener('change', (e) => { this.machine = e.target.value; this.render(); });
    this.$('sum-print').addEventListener('click', () => this.print());
    window.api.onBillsChanged(() => { if (!this.$('view-summary').hidden) this.load(); });
  },
};
SummaryView.init();
