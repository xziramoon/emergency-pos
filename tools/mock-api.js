// Browser-side stand-in for the preload `window.api`, used only by tools/harness-ui.js.
(function () {
  const products = [
    { barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', unit: 'ชิ้น', price: 58 },
    { barcode: '8850000000002', name: 'น้ำดื่ม 600มล.', unit: 'ขวด', price: 7 },
    { barcode: '8850000000003', name: 'น้ำดื่ม 600มล. (แพ็ค 12)', unit: 'แพ็ค', price: 75 },
    { barcode: '8854089003139', name: 'อิ่มทอง ข้าวขาวหอมมะลิ(เขียว) 5ก.ก', unit: 'กล่อง', price: 185 },
    { barcode: '8853315000034', name: 'น้ำยาล้างห้องน้ำ ดราก้า 3,700มล.', unit: 'แกลลอน', price: 145 },
  ];
  let settings = {
    machineId: 'POS02', staff: ['ตั้น', 'แอน'], shopName: 'UNG LUK SENG', productsUrl: 'about:blank',
    columnMap: null, printer: '', delayMs: 600, windowLike: '*Sea And Hill POS*',
  };
  const bills = [];
  let updatedAt = new Date().toISOString();
  const strip = (c) => String(c).trim().replace(/^0+/, '');

  window.api = {
    getSettings: async () => structuredClone(settings),
    saveSettings: async (s) => { settings = structuredClone(s); return s; },
    getProductsStatus: async () => ({ count: products.length, updatedAt, stale: false }),
    refreshProducts: async () => { updatedAt = new Date().toISOString(); return { ok: true, count: products.length, updatedAt, stale: false }; },
    findByBarcode: async (c) => products.find((p) => p.barcode === String(c).trim() || strip(p.barcode) === strip(c)) || null,
    searchByName: async (q) => products.filter((p) => q && p.name.includes(q)).slice(0, 30),
    saveBill: async (b) => {
      const day = b.createdAt.slice(0, 10);
      const seq = bills.filter((x) => x.createdAt.slice(0, 10) === day).length + 1;
      const saved = { ...b, seq };
      bills.push(saved);
      console.log('[mock] saved bill', saved);
      return saved;
    },
    listPending: async () => bills.filter((b) => b.status !== 'confirmed' && b.status !== 'void'),
    listPrinters: async () => [{ name: 'EPSON TM-T82III (mock)' }],
    openDataFolder: async () => {},
    getWarnings: async () => [],
    confirmBill: async (b) => { const saved = await window.api.saveBill(b); console.log('[mock] print', saved.seq); return { saved, printed: true }; },
    printReceipt: async () => ({ ok: true }),
    printTest: async () => ({ ok: true }),
    openDrawer: async () => ({ ok: true }),
  };

  // ?demo=sell logs in and scans two items; ?demo=pay also opens the payment dialog (for screenshots).
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    window.addEventListener('load', () => setTimeout(async () => {
      document.querySelector('#staff-list button').click();
      await new Promise((r) => setTimeout(r, 200));
      if (demo === 'empty') return;
      if (demo === 'settings') { document.getElementById('btn-sell-settings').click(); return; }
      const scan = document.getElementById('scan');
      for (const code of ['8850000000001', '8850000000001', '8850000000002', '1234567890123']) {
        scan.value = code;
        scan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 120));
      }
      if (demo === 'manual') { document.getElementById('man-name').value = 'ของฝาก'; document.getElementById('man-price').value = '25'; document.getElementById('form-manual').requestSubmit(); }
      if (demo === 'pay') { document.getElementById('man-cancel').click(); document.getElementById('btn-pay').click(); document.getElementById('pay-cash').value = '500'; document.getElementById('pay-cash').dispatchEvent(new Event('input')); }
    }, 100));
  }
})();
