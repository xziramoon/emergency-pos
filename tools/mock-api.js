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

  let progressCb = () => {};
  // The reconcile page is a separate document in the harness, so give it a sample typed bill.
  if (location.pathname.endsWith('reconcile.html')) {
    bills.push({ seq: Number(new URLSearchParams(location.search).get('seq')) || 3, machine: 'POS02', createdAt: '2026-11-14T11:13:00+07:00', cashier: 'ตั้น', total: 211, change: 0, status: 'typed', sentCount: 5, payments: [{ method: 'transfer', amount: 111 }, { method: 'cash', amount: 100 }],
      lines: [{ barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', qty: 2, price: 58, discount: 0, total: 116, manual: false }, { barcode: '', name: 'ของฝาก', qty: 1, price: 25, discount: 0, total: 25, manual: true }, { barcode: '8850000000002', name: 'น้ำดื่ม 600มล.', qty: 3, price: 5, listPrice: 7, discount: 0, total: 15, manual: false, priceEdited: true }] });
  }
  const codesOf = (b) => b.lines.filter((l) => !l.manual).flatMap((l) => Array(l.qty).fill(l.barcode));
  // ?stop=N makes the mock stop after N barcodes (to see the "stopped midway" result).
  async function mockSend(seq, resume) {
    const b = bills.find((x) => x.seq === seq);
    const all = codesOf(b);
    const from = resume ? b.sentCount : 0;
    const stopAt = Number(new URLSearchParams(location.search).get('stop')) || 0;
    b.status = 'sending';
    let n = from;
    for (const c of all.slice(from)) {
      if (stopAt && n >= stopAt && !resume) { b.status = 'pending'; b.sentCount = n; return { ok: true, done: false, typed: n, total: all.length, lastBarcode: all[n - 1], reason: 'foreground-changed', message: BillState.describeStop('foreground-changed', n, all[n - 1]), bill: b }; }
      await new Promise((r) => setTimeout(r, 250));
      n++; b.sentCount = n; progressCb({ date: b.createdAt.slice(0, 10), seq, typed: n, total: all.length });
    }
    b.status = 'typed'; b.sentAt = new Date().toISOString();
    return { ok: true, done: true, typed: n, total: all.length, bill: b };
  }

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
    installUpdate: async () => ({ ok: true }),
    getUpdateStatus: async () => ({ state: new URLSearchParams(location.search).get('demo') === 'update' ? 'ready' : 'idle', version: '0.3.0', current: '0.2.0' }),
    checkUpdate: async () => ({ ok: true }),
    onUpdateStatus: () => {},
    // ---- Stage 3 stubs: bills list + simulated typing (never touches a real POS) ----
    listBills: async (filter = 'open') => {
      const keep = { open: (b) => b.status !== 'confirmed' && b.status !== 'void', sent: (b) => b.status === 'typed' || b.status === 'confirmed', void: (b) => b.status === 'void', all: () => true }[filter];
      return bills.filter(keep).map((b) => ({ ...b, date: b.createdAt.slice(0, 10) }));
    },
    sendBill: async (date, seq) => mockSend(seq, false),
    resumeBill: async (date, seq) => mockSend(seq, true),
    onSendProgress: (cb) => { progressCb = cb; },
    getBill: async (date, seq) => ({ ...bills.find((b) => b.seq === seq), date }),
    confirmReceived: async (date, seq) => { bills.find((b) => b.seq === seq).status = 'confirmed'; return { ok: true }; },
    flagBill: async (date, seq, note) => { const b = bills.find((x) => x.seq === seq); b.status = 'flagged'; b.flagNote = note; return { ok: true }; },
    voidBill: async (date, seq, info) => { if (!String(info.reason || '').trim()) return { ok: false, error: 'ต้องใส่เหตุผลที่ยกเลิกบิล' }; const b = bills.find((x) => x.seq === seq); b.status = 'void'; b.void = { at: new Date().toISOString(), by: info.by, reason: info.reason }; return { ok: true }; },
    openReconcile: async (date, seq) => { window.open('/reconcile.html?date=' + date + '&seq=' + seq, '_blank', 'width=380,height=640'); return { ok: true }; },
    onBillsChanged: () => {},
    onWindowFocus: () => {},
  };

  // ?demo=sell logs in and scans two items; ?demo=pay also opens the payment dialog (for screenshots).
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) {
    window.addEventListener('load', () => setTimeout(async () => {
      document.querySelector('#staff-list button').click();
      await new Promise((r) => setTimeout(r, 200));
      if (demo === 'empty') return;
      if (demo === 'pending') {
        const mk = (n, status, extra) => ({ seq: n, machine: 'POS02', createdAt: '2026-11-14T' + String(8 + n).padStart(2, '0') + ':' + String(10 + n).padStart(2, '0') + ':00+07:00', cashier: n % 2 ? 'ตั้น' : 'แอน', total: 100 + n * 37, change: 0, payments: [{ method: 'cash', amount: 100 + n * 37 }], status, sentCount: 0, sentAt: null, confirmedAt: null, void: null,
          lines: [{ barcode: '8850000000001', name: 'อะยัม แมคเคอเรล 230กรัม', qty: 2, price: 58, discount: 0, total: 116, manual: false }, { barcode: '8850000000002', name: 'น้ำดื่ม 600มล.', qty: 3, price: 7, discount: 0, total: 21, manual: false }], ...extra });
        bills.push(mk(1, 'pending'), mk(2, 'pending', { sentCount: 3, lines: [{ barcode: '8850000000001', name: 'อะยัม', qty: 4, price: 58, discount: 0, total: 232, manual: false }, { barcode: '', name: 'ของฝาก', qty: 1, price: 25, discount: 0, total: 25, manual: true }] }), mk(3, 'typed', { payments: [{ method: 'cash', amount: 100 }, { method: 'transfer', amount: 111 }] }), mk(4, 'flagged', { flagNote: 'POS ขึ้นยอดต่างกัน 5 บาท' }), mk(5, 'pending', { lines: [{ barcode: '8850000000002', name: 'น้ำดื่ม (แก้ราคา)', qty: 1, price: 5, discount: 0, total: 5, manual: false, priceEdited: true }] }));
        document.getElementById('btn-pending').click();
        const act = new URLSearchParams(location.search).get('act');
        if (act) {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          await sleep(150);
          if (act === 'void') { [...document.querySelectorAll('#pend-body button')].find((b) => b.textContent === 'ยกเลิกบิล').click(); return; }
          document.querySelector('#pend-body .btn-go').click();
          if (act !== 'confirm') { await sleep(150); document.getElementById('send-go').click(); }
          if (act === 'sending') await sleep(500);
        }
        return;
      }
      if (demo === 'settings') { document.getElementById('btn-sell-settings').click(); return; }
      const scan = document.getElementById('scan');
      for (const code of ['8850000000001', '8850000000001', '8850000000002', '1234567890123']) {
        scan.value = code;
        scan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 120));
      }
      if (demo === 'manual') { document.getElementById('man-name').value = 'ของฝาก'; document.getElementById('man-price').value = '25'; document.getElementById('form-manual').requestSubmit(); }
      if (demo === 'thanks') { document.getElementById('man-cancel').click(); document.getElementById('btn-pay').click(); document.getElementById('pay-cash').value = '500'; document.getElementById('pay-cash').dispatchEvent(new Event('input')); document.getElementById('form-pay').requestSubmit(); }
      if (demo === 'focus-test') await window.__focusTest();
      if (demo === 'pay') { document.getElementById('man-cancel').click(); document.getElementById('btn-pay').click(); document.getElementById('pay-cash').value = '500'; document.getElementById('pay-cash').dispatchEvent(new Event('input')); }
    }, 100));
  }

  // ?t=<ms> freezes every CSS animation at that time (screenshots of animation frames); ?greet=1 clicks the mascot first.
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.addEventListener('load', () => setTimeout(() => {
    if (q.get('greet')) document.getElementById('mascot-hero').click();
    setTimeout(() => document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = Number(q.get('t')); } catch (e) { /* ignore */ } }), 200);
  }, 300));
})();
