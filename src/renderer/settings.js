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
    this.$('set-delay').value = s.delayMs;
    this.$('set-window').value = s.windowLike;
    for (const k of ['barcode', 'name', 'unit', 'price']) {
      this.$('map-' + k).value = s.columnMap && s.columnMap[k] >= 0 ? s.columnMap[k] + 1 : '';
    }
    this.$('set-msg').textContent = '';
    await this.fillPrinters(s.printer);
    try { this.$('set-version').textContent = 'เวอร์ชันที่ใช้อยู่: ' + (await window.api.getUpdateStatus()).current; } catch { /* leave blank */ }
    await this.showProductsInfo();
    try { this.showPrintServer(await window.api.getPrintServer()); } catch { /* panel stays blank */ }
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

  showPrintServer(i) {
    this.$('ps-enabled').checked = i.enabled;
    this.$('ps-port').value = i.port;
    this.$('ps-detail').hidden = !i.running;
    this.$('ps-token').value = i.token;
    this.$('ps-address').value = i.addresses.length ? i.addresses.map((a) => `${a}:${i.port}`).join('  หรือ  ') : 'ไม่พบเครือข่าย (เชื่อม Wi-Fi หรือสายแลนก่อน)';
    // The SVG comes from our own main process (qrcode-generator), not from the network.
    const qr = this.$('ps-qr');
    const doc = new DOMParser().parseFromString(i.qrSvg || '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');
    qr.replaceChildren(document.importNode(doc.documentElement, true));
    this.$('ps-link').textContent = i.link ? i.link.replace(/#t=.*/, '') : '';
    this.$('ps-state').textContent = i.error ? i.error
      : i.running ? 'เปิดอยู่ รอรับงานพิมพ์จากมือถือ'
        : i.enabled ? 'เปิดไม่สำเร็จ' : 'ปิดอยู่';
  },

  async applyPrintServer(patch) {
    this.showPrintServer(await window.api.setPrintServer(patch));
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
      delayMs: Math.max(100, parseInt(this.$('set-delay').value, 10) || cur.delayMs),
      windowLike: this.$('set-window').value.trim() || cur.windowLike,
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

Settings.$('ps-enabled').addEventListener('change', (e) => Settings.applyPrintServer({ enabled: e.target.checked, port: parseInt(Settings.$('ps-port').value, 10) }));
Settings.$('ps-port').addEventListener('change', () => { if (Settings.$('ps-enabled').checked) Settings.applyPrintServer({ port: parseInt(Settings.$('ps-port').value, 10) }); });
// Two clicks (confirm() can leave inputs untypable in Electron on Windows).
Settings.$('ps-regen').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.dataset.label = b.textContent; b.textContent = 'กดอีกครั้งเพื่อยืนยัน (มือถือที่จับคู่ไว้จะใช้ไม่ได้)'; return; }
  b.textContent = b.dataset.label; delete b.dataset.armed;
  Settings.applyPrintServer({ regenerate: true });
});
Settings.$('ps-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(Settings.$('ps-token').value); Settings.$('set-msg').textContent = 'คัดลอกรหัสแล้ว'; } catch { Settings.$('ps-token').select(); } });
Settings.$('btn-save-settings').addEventListener('click', () => Settings.save());
Settings.$('btn-refresh-products').addEventListener('click', () => Settings.refresh());
Settings.$('btn-open-data').addEventListener('click', () => window.api.openDataFolder());
Settings.$('btn-close-settings').addEventListener('click', () => Settings.close());
Settings.$('btn-print-test').addEventListener('click', () => Settings.runPrint(() => window.api.printTest(), 'ส่งงานพิมพ์ทดสอบแล้ว'));
Settings.$('btn-drawer-test').addEventListener('click', () => Settings.runPrint(() => window.api.openDrawer(), 'ส่งคำสั่งเปิดลิ้นชักแล้ว'));
Settings.$('btn-check-update').addEventListener('click', async () => {
  Settings.$('set-msg').textContent = 'กำลังตรวจหาเวอร์ชันใหม่...';
  const r = await window.api.checkUpdate();
  Settings.$('set-msg').textContent = r.ok ? 'ตรวจแล้ว ถ้ามีเวอร์ชันใหม่จะแจ้งที่มุมขวาบน' : 'ตรวจไม่สำเร็จ: ' + r.error;
});
