'use strict';
const Settings = {
  returnTo: 'staff',
  $: (id) => document.getElementById(id),

  async open(returnTo) {
    this.returnTo = returnTo;
    const s = await window.api.getSettings();
    this.$('set-machine').value = s.machineId;
    this.$('set-staff').value = s.staff.join('\n');
    this.$('set-shop').value = s.shopName;
    this.$('set-url').value = s.productsUrl;
    for (const k of ['barcode', 'name', 'unit', 'price']) {
      this.$('map-' + k).value = s.columnMap && s.columnMap[k] >= 0 ? s.columnMap[k] + 1 : '';
    }
    this.$('set-msg').textContent = '';
    await this.fillPrinters(s.printer);
    await this.showProductsInfo();
    App.show('settings');
  },

  async fillPrinters(selected) {
    const sel = this.$('set-printer');
    while (sel.options.length > 1) sel.remove(1);
    let names = [];
    try { names = (await window.api.listPrinters()).map((p) => p.name); } catch { /* list stays minimal */ }
    // Keep a saved printer visible even if Windows does not list it right now.
    if (selected && !names.includes(selected)) names.push(selected);
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    }
    sel.value = selected || '';
  },

  async runPrint(fn, okText) {
    await this.save();
    this.$('set-msg').textContent = 'กำลังส่งงานพิมพ์...';
    const r = await fn();
    this.$('set-msg').textContent = r.ok ? okText : 'ไม่สำเร็จ: ' + r.error;
  },

  async showProductsInfo() {
    const st = await window.api.getProductsStatus();
    this.$('set-products-info').textContent = st.updatedAt
      ? `สินค้า ${st.count.toLocaleString('th-TH')} รายการ อัปเดตล่าสุด ${new Date(st.updatedAt).toLocaleString('th-TH')}`
      : 'ยังไม่มีรายการสินค้าในเครื่อง';
  },

  // Blank column fields mean "auto-guess"; all four must be filled to override.
  readColumnMap() {
    const vals = ['barcode', 'name', 'unit', 'price'].map((k) => parseInt(this.$('map-' + k).value, 10));
    if (vals.some((v) => !(v >= 1))) return null;
    return { barcode: vals[0] - 1, name: vals[1] - 1, unit: vals[2] - 1, price: vals[3] - 1 };
  },

  async save() {
    const cur = await window.api.getSettings();
    const staff = this.$('set-staff').value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const machineId = this.$('set-machine').value.trim() || cur.machineId;
    await window.api.saveSettings({
      ...cur,
      machineId,
      staff,
      shopName: this.$('set-shop').value.trim() || cur.shopName,
      productsUrl: this.$('set-url').value.trim() || cur.productsUrl,
      printer: this.$('set-printer').value,
      columnMap: this.readColumnMap(),
    });
    this.$('set-msg').textContent = 'บันทึกแล้ว';
  },

  async refresh() {
    await this.save();
    this.$('set-msg').textContent = 'กำลังอัปเดตรายการสินค้า...';
    const r = await window.api.refreshProducts();
    this.$('set-msg').textContent = r.ok ? `อัปเดตแล้ว ${r.count.toLocaleString('th-TH')} รายการ` : 'อัปเดตไม่สำเร็จ ใช้รายการเดิมในเครื่อง: ' + r.error;
    await this.showProductsInfo();
  },

  async close() {
    if (this.returnTo === 'sell') { App.settings = await window.api.getSettings(); await App.refreshStatus(); App.show('sell'); }
    else App.showStaffPicker();
  },
};

Settings.$('btn-save-settings').addEventListener('click', () => Settings.save());
Settings.$('btn-refresh-products').addEventListener('click', () => Settings.refresh());
Settings.$('btn-open-data').addEventListener('click', () => window.api.openDataFolder());
Settings.$('btn-close-settings').addEventListener('click', () => Settings.close());
Settings.$('btn-print-test').addEventListener('click', () => Settings.runPrint(() => window.api.printTest(), 'ส่งงานพิมพ์ทดสอบแล้ว'));
Settings.$('btn-drawer-test').addEventListener('click', () => Settings.runPrint(() => window.api.openDrawer(), 'ส่งคำสั่งเปิดลิ้นชักแล้ว'));
