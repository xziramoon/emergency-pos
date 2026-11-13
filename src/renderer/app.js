'use strict';
// Shell: view switching, staff picker, status bar. Sell/pay screens plug in via App (Task 6).
const App = {
  cashier: null,
  settings: null,
  views: ['staff', 'sell', 'settings'],

  show(name) {
    for (const v of this.views) document.getElementById('view-' + v).hidden = v !== name;
    if (name === 'sell' && this.onShowSell) this.onShowSell();
  },

  async refreshStatus() {
    const [st, pend, warns] = await Promise.all([
      window.api.getProductsStatus(), window.api.listPending(), window.api.getWarnings(),
    ]);
    const wb = document.getElementById('sb-warning');
    wb.textContent = warns.length ? '⚠ ' + warns[warns.length - 1] : '';
    wb.hidden = warns.length === 0;
    document.getElementById('sb-cashier').textContent = this.cashier || '-';
    document.getElementById('sb-machine').textContent = 'เครื่อง ' + this.settings.machineId;
    const sp = document.getElementById('sb-products');
    const when = st.updatedAt ? new Date(st.updatedAt).toLocaleString('th-TH') : 'ยังไม่เคยอัปเดต';
    sp.textContent = st.count ? `สินค้า ${st.count.toLocaleString('th-TH')} รายการ · อัปเดต ${when}${st.stale ? ' (ข้อมูลเก่า ควรอัปเดต)' : ''}` : 'ยังไม่มีรายการสินค้า: ไปที่ ตั้งค่า > URL รายการสินค้า';
    sp.className = st.stale ? 'warn' : '';
    document.getElementById('sb-pending').textContent = pend.length ? `บิลรอส่งเข้า POS หลัก ${pend.length} บิล` : 'ไม่มีบิลค้าง';
  },

  async showStaffPicker() {
    this.settings = await window.api.getSettings();
    const list = document.getElementById('staff-list');
    list.textContent = '';
    for (const name of this.settings.staff) {
      const b = document.createElement('button');
      b.className = 'staff-btn';
      const av = document.createElement('span');
      av.className = 'avatar';
      av.textContent = Array.from(name.replace(/[^\p{L}\p{N}]/gu, ''))[0] || '?';
      const nm = document.createElement('span');
      nm.textContent = name;
      b.append(av, nm);
      b.addEventListener('click', () => this.login(name));
      list.appendChild(b);
    }
    document.getElementById('staff-empty').hidden = this.settings.staff.length > 0;
    this.show('staff');
  },

  async login(name) {
    this.cashier = name;
    this.settings = await window.api.getSettings();
    await this.refreshStatus();
    this.show('sell');
  },
};

document.getElementById('btn-open-settings').addEventListener('click', () => Settings.open('staff'));
document.getElementById('btn-sell-settings').addEventListener('click', () => Settings.open('sell'));

App.showStaffPicker();
