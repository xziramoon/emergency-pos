'use strict';
// Small always-on-top window shown after a bill was typed into the main POS (spec 6.7).
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const q = new URLSearchParams(location.search);
  const date = q.get('date');
  const seq = Number(q.get('seq'));

  function li(text, strong) {
    const el = document.createElement('li');
    if (strong) { const b = document.createElement('b'); b.textContent = strong; el.append(b, ' '); }
    el.append(text);
    return el;
  }

  function render(bill) {
    $('rc-seq').textContent = '#' + bill.seq;
    $('rc-total').textContent = fmt(bill.total);
    const pay = $('rc-pay');
    pay.textContent = '';
    for (const p of ManualFix.paymentSummary(bill)) pay.appendChild(li(fmt(p.amount) + ' บาท', p.label));
    $('rc-change').textContent = bill.change > 0 ? `เงินทอน ${fmt(bill.change)} บาท` : '';

    const fix = ManualFix.manualFixList(bill);
    $('rc-fix').hidden = fix.length === 0;
    const list = $('rc-fix-list');
    list.textContent = '';
    for (const f of fix) {
      list.appendChild(f.kind === 'manual'
        ? li(`${f.name} · จำนวน ${f.qty} · ราคา ${fmt(f.price)} (คีย์เองใน POS หลัก)`, 'คีย์เอง:')
        : li(`${f.name} · ขายจริง ${fmt(f.price)}${f.discount ? ' · ส่วนลด ' + fmt(f.discount) : ''} (แก้ราคาใน POS หลัก)`, 'แก้ราคา:'));
    }
    if (bill.status !== 'typed') {
      $('rc-err').textContent = 'บิลนี้ไม่ได้อยู่ในสถานะรอเทียบยอดแล้ว';
      $('rc-actions').hidden = true;
    }
  }

  async function act(fn) {
    const r = await fn();
    if (r.ok) window.close(); else $('rc-err').textContent = r.error;
  }

  $('rc-ok').addEventListener('click', () => act(() => window.api.confirmReceived(date, seq)));
  $('rc-bad').addEventListener('click', () => { $('rc-flag-box').hidden = false; $('rc-actions').hidden = true; $('rc-note').focus(); });
  $('rc-flag-cancel').addEventListener('click', () => { $('rc-flag-box').hidden = true; $('rc-actions').hidden = false; });
  $('rc-flag-save').addEventListener('click', () => act(() => window.api.flagBill(date, seq, $('rc-note').value)));

  window.api.getBill(date, seq).then(render).catch((e) => { $('rc-err').textContent = 'เปิดบิลไม่ได้: ' + e.message; });
})();
