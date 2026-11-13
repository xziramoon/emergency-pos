'use strict';
// Payment dialog (spec 6.3). Rules live in Bill.validatePayments.
const Pay = {
  $: (id) => document.getElementById(id),
  total: 0,
  busy: false,

  amounts() {
    const n = (id) => Number(this.$(id).value) || 0;
    return { cash: n('pay-cash'), transfer: n('pay-transfer'), gov: n('pay-gov') };
  },

  open() {
    if (Sell.cart.length === 0) return;
    this.total = Cart.cartSummary(Sell.cart).total;
    this.$('pay-total').textContent = Sell.fmt(this.total);
    for (const id of ['pay-cash', 'pay-transfer', 'pay-gov']) this.$(id).value = '';
    this.busy = false;
    this.justPaid = false;
    this.update();
    Sell.setStep(2);
    this.$('dlg-pay').showModal();
    this.$('pay-cash').focus();
  },

  update() {
    const r = Bill.validatePayments(this.total, this.amounts());
    this.$('pay-change').textContent = Sell.fmt(r.ok ? r.change : 0);
    const anyInput = Object.values(this.amounts()).some((v) => v > 0);
    const am = this.amounts();
    this.$('pm-cash').classList.toggle('has-value', am.cash > 0);
    this.$('pm-transfer').classList.toggle('has-value', am.transfer > 0);
    this.$('pm-gov').classList.toggle('has-value', am.gov > 0);
    this.$('pay-err').textContent = !r.ok && anyInput ? r.error : '';
    this.$('pay-confirm').disabled = !r.ok || this.busy;
    return r;
  },

  async confirm(e) {
    e.preventDefault();
    if (this.busy) return;
    const r = this.update();
    if (!r.ok) return;
    this.busy = true;
    this.$('pay-confirm').disabled = true;
    const bill = Cart.toBill(Sell.cart, {
      machine: App.settings.machineId, cashier: App.cashier, now: new Date(),
      payments: r.payments, change: r.change,
    });
    try {
      // Main process saves to disk first, then prints (spec 6.3). A save failure throws; a print failure
      // comes back as printed:false with the bill already safe.
      const res = await window.api.confirmBill(bill);
      this.justPaid = true;
      this.$('dlg-pay').close();
      Sell.lastSaved = res.saved;
      const change = `เงินทอน ${Sell.fmt(r.change)}`;
      Sell.newBill(res.printed
        ? `บันทึกบิลแล้ว (${change})`
        : `บันทึกบิลแล้ว (${change}) แต่พิมพ์ใบเสร็จไม่สำเร็จ: ${res.error} — กด "พิมพ์ใบล่าสุดซ้ำ"`);
      Sell.showReprint(!res.printed);
      Sell.setStep(3);
      App.refreshStatus();
      return res.saved;
    } catch (err) {
      this.busy = false;
      this.$('pay-err').textContent = 'บันทึกบิลไม่สำเร็จ: ' + (err.message || err) + ' — ยังไม่ได้พิมพ์ใบเสร็จ กดยืนยันอีกครั้ง';
      this.$('pay-confirm').disabled = false;
    }
  },

  init() {
    for (const id of ['pay-cash', 'pay-transfer', 'pay-gov']) this.$(id).addEventListener('input', () => this.update());
    this.$('pay-exact').addEventListener('click', () => {
      this.$('pay-cash').value = this.total; this.$('pay-transfer').value = ''; this.$('pay-gov').value = ''; this.update();
    });
    this.$('pay-full-transfer').addEventListener('click', () => {
      this.$('pay-transfer').value = this.total; this.$('pay-cash').value = ''; this.$('pay-gov').value = ''; this.update();
    });
    // Banknote chips: tap what the customer handed over (replaces typing for the common case).
    this.$('cash-chips').querySelectorAll('[data-cash]').forEach((b) => b.addEventListener('click', () => {
      this.$('pay-cash').value = b.dataset.cash; this.update(); this.$('pay-cash').focus();
    }));
    this.$('dlg-pay').addEventListener('close', () => { if (!this.justPaid) Sell.setStep(1); });
    this.$('form-pay').addEventListener('submit', (e) => this.confirm(e));
    this.$('pay-cancel').addEventListener('click', () => { this.$('dlg-pay').close(); });
  },
};

Pay.init();
