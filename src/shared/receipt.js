'use strict';
// Receipt builder (spec 6.4). Pure: bill in, lines + plain text out.
// No "เลขที่" line and no barcode, and nothing the real Sea & Hill receipt does not have.
(function () {
  const T = typeof module !== 'undefined' && module.exports ? require('./thaidate') : window.ThaiDate;
  const { formatThaiDate, displayWidth, clusters } = T;
  const WIDTH = 42;

  const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PAY_LABEL = { cash: 'ชำระด้วยเงินสด', transfer: 'ชำระด้วยเงินโอน', gov: 'ชำระด้วยโครงการรัฐ' };

  // Break text into pieces of at most `width` columns, preferring spaces, never splitting a Thai cluster.
  function wrap(text, width) {
    const out = [];
    let cur = '';
    let curW = 0;
    let lastSpace = -1; // index in cur (UTF-16) after which we may break
    for (const c of clusters(text)) {
      const w = displayWidth(c);
      if (curW + w > width) {
        if (lastSpace > 0) {
          out.push(cur.slice(0, lastSpace).trimEnd());
          cur = cur.slice(lastSpace).trimStart();
          curW = displayWidth(cur);
        } else {
          out.push(cur);
          cur = '';
          curW = 0;
        }
        lastSpace = -1;
      }
      cur += c;
      curW += w;
      if (c === ' ') lastSpace = cur.length;
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  const padRow = (l, r) => l + ' '.repeat(Math.max(1, WIDTH - displayWidth(l) - displayWidth(r))) + r;
  const padCenter = (s) => ' '.repeat(Math.max(0, Math.floor((WIDTH - displayWidth(s)) / 2))) + s;

  function buildReceipt(bill, { shopName } = {}) {
    const shop = String(shopName || '').trim() || 'UNG LUK SENG';
    const lines = [];
    const center = (t) => lines.push({ kind: 'center', text: t });
    const row = (l, r, bold) => lines.push({ kind: bold ? 'bold' : 'row', left: l, right: r });
    const text = (t) => lines.push({ kind: 'text', text: t });
    const rule = () => lines.push({ kind: 'rule' });

    center(shop);
    center('ใบเสร็จรับเงิน');
    row(`เลขเครื่อง : ${bill.machine}`, `พนักงาน : ${bill.cashier}`);
    text('สมาชิก : ลูกค้าเงินสด (CASH)');
    rule();

    let pieces = 0;
    for (const l of bill.lines) {
      pieces += Number(l.qty) || 0;
      for (const part of wrap(l.name, WIDTH)) lines.push({ kind: 'item', text: part });
      const gross = Math.round(l.price * 100) * l.qty / 100;
      row(`${money(l.price)} X ${l.qty}`, money(gross));
      if (l.discount > 0) row('ส่วนลด', '-' + money(l.discount));
    }
    rule();
    row(`${bill.lines.length} รายการ ${money(pieces)} ชิ้น`, money(bill.total), true);
    rule();
    let hasCash = false;
    for (const p of bill.payments) {
      if (p.method === 'cash') hasCash = true;
      row(PAY_LABEL[p.method] || p.method, money(p.amount));
    }
    if (hasCash) row('เงินทอน', money(bill.change));
    rule();
    text('วันที่:' + formatThaiDate(new Date(bill.createdAt)));
    text('V=สินค้ามีภาษีมูลค่าเพิ่ม E=สินค้ายกเว้นภาษี');
    text('ขอบคุณที่ใช้บริการ ครับ/ค่ะ');

    const plain = lines.map((x) => {
      if (x.kind === 'center') return padCenter(x.text);
      if (x.kind === 'rule') return '-'.repeat(WIDTH);
      if (x.kind === 'row' || x.kind === 'bold') return padRow(x.left, x.right);
      return x.text;
    });
    return { lines, text: plain.join('\n') };
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 80 mm page. Rows use flex so the amount stays right-aligned whatever the font.
  function renderReceiptHtml(receipt) {
    const body = receipt.lines.map((x) => {
      if (x.kind === 'center') return `<div class="c">${esc(x.text)}</div>`;
      if (x.kind === 'rule') return '<hr>';
      if (x.kind === 'row') return `<div class="r"><span>${esc(x.left)}</span><span>${esc(x.right)}</span></div>`;
      if (x.kind === 'bold') return `<div class="r"><b>${esc(x.left)}</b><b>${esc(x.right)}</b></div>`;
      return `<div>${esc(x.text)}</div>`;
    }).join('\n');
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { width: 64mm; margin: 0 0 0 4mm; padding: 2mm 0; color: #000; font: 12pt/1.25 "Tahoma", "Leelawadee UI", sans-serif; }
.c { text-align: center; }
.r { display: flex; justify-content: space-between; gap: 4mm; }
hr { border: 0; border-top: 1px dashed #000; margin: 1mm 0; }
</style></head><body>
${body}
</body></html>`;
  }

  // Printed daily summary (spec 6.9): same line kinds as a receipt, so the same renderer prints it.
  // `date` is 'YYYY-MM-DD'; machine is optional (omitted = all machines).
  function buildSummary(s, { shopName, date, machine, printedAt } = {}) {
    const shop = String(shopName || '').trim() || 'UNG LUK SENG';
    const lines = [];
    const center = (t) => lines.push({ kind: 'center', text: t });
    const row = (l, r, bold) => lines.push({ kind: bold ? 'bold' : 'row', left: l, right: r });
    const text = (t) => lines.push({ kind: 'text', text: t });
    const rule = () => lines.push({ kind: 'rule' });
    const [y, m, d] = String(date || '').split('-');
    const thDate = y ? `${d}-${m}-${Number(y) + 543}` : '-';

    center(shop);
    center('สรุปยอดขายประจำวัน');
    row(`วันที่ : ${thDate}`, machine ? `เครื่อง : ${machine}` : 'ทุกเครื่อง');
    rule();
    row(`ยอดขาย ${s.billCount} บิล`, money(s.sales), true);
    rule();
    row('เงินสดที่รับ', money(s.cash));
    row('หักเงินทอน', '-' + money(s.cash - s.netCash));
    row('เงินสดสุทธิ (ในลิ้นชัก)', money(s.netCash), true);
    row('เงินโอน', money(s.transfer));
    row('โครงการรัฐ', money(s.gov));
    rule();
    for (const [name, g] of Object.entries(s.byCashier)) row(`${name} ${g.count} บิล`, money(g.sales));
    rule();
    row(`ส่งเข้า POS หลักแล้ว ${s.sent.count} บิล`, money(s.sent.sales));
    row(`ยังไม่ส่ง ${s.pending.count} บิล`, money(s.pending.sales));
    if (s.flagged.count) row(`ตรวจสอบ ${s.flagged.count} บิล`, money(s.flagged.sales));
    row(`ยกเลิก ${s.void.count} บิล (ไม่รวมในยอดขาย)`, money(s.void.sales));
    rule();
    text('พิมพ์เมื่อ:' + formatThaiDate(printedAt ? new Date(printedAt) : new Date()));

    const plain = lines.map((x) => {
      if (x.kind === 'center') return padCenter(x.text);
      if (x.kind === 'rule') return '-'.repeat(WIDTH);
      if (x.kind === 'row' || x.kind === 'bold') return padRow(x.left, x.right);
      return x.text;
    });
    return { lines, text: plain.join('\n') };
  }

  // A short slip for the "print test" buttons. It goes through renderReceiptHtml so the page size
  // (80mm wide, height = content) matches real receipts; a bare page leaves the driver's own paper length.
  function buildTestSlip(note) {
    const lines = [{ kind: 'center', text: 'ทดสอบเครื่องพิมพ์' }, { kind: 'center', text: 'POS ฉุกเฉิน' }];
    if (note) lines.push({ kind: 'center', text: String(note) });
    return { lines };
  }

  const api = { buildReceipt, renderReceiptHtml, buildSummary, buildTestSlip, renderSummaryHtml: renderReceiptHtml, WIDTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Receipt = api;
})();
