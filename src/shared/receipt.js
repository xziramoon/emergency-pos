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
body { width: 72mm; margin: 0 4mm 0 4mm; padding: 2mm 0; color: #000; font: 12pt/1.25 "Tahoma", "Leelawadee UI", sans-serif; }
.c { text-align: center; }
.r { display: flex; justify-content: space-between; gap: 4mm; }
hr { border: 0; border-top: 1px dashed #000; margin: 1mm 0; }
</style></head><body>
${body}
</body></html>`;
  }

  const api = { buildReceipt, renderReceiptHtml, WIDTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Receipt = api;
})();
