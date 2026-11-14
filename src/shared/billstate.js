'use strict';
// Bill status machine (spec section 5 / 6.6 / 6.8). Pure.
(function () {
  const NEXT = {
    pending: ['sending', 'void'],
    sending: ['typed', 'pending'],
    typed: ['confirmed', 'flagged', 'void'],
    flagged: ['void', 'pending'], // pending = send again
    confirmed: [],
    void: [],
  };

  const LABEL = {
    pending: 'ยังไม่ส่ง', sending: 'กำลังส่ง', typed: 'ส่งแล้ว รอเทียบยอด',
    confirmed: 'ยอดตรง รับเงินแล้ว', flagged: 'ยอดไม่ตรง รอตรวจ', void: 'ยกเลิก',
  };

  function canTransition(from, to) {
    return Object.prototype.hasOwnProperty.call(NEXT, from) && NEXT[from].includes(to);
  }

  function applyProgress(bill, typedCount) {
    return { ...bill, sentCount: typedCount };
  }

  function flagsOf(bill) {
    const lines = bill.lines || [];
    return { manual: lines.some((l) => l.manual), priceEdited: lines.some((l) => !l.manual && l.priceEdited) };
  }

  function statusLabel(s) {
    return LABEL[s] || s;
  }

  // Thai explanation when the typer stopped (spec 6.6 step 8).
  function describeStop(reason, typed, last) {
    const done = `พิมพ์ไปแล้ว ${typed} รายการ`;
    switch (reason) {
      case 'window-not-found': return 'ไม่พบหน้าต่าง Sea & Hill POS กรุณาเปิดหน้าขายของ POS หลักก่อน (ยังไม่ได้พิมพ์อะไร)';
      case 'cannot-focus': return 'ดึงหน้าต่าง POS หลักขึ้นมาไม่ได้ ยังไม่ได้พิมพ์อะไร';
      case 'foreground-changed': return `หยุดกลางทาง: มีหน้าต่างอื่นหรือข้อความของ POS แทรกขึ้นมา ${done} บาร์โค้ดสุดท้ายคือ ${last || '-'}`;
      case 'timeout': return `ตัวพิมพ์ค้างเกินเวลาและถูกหยุด ${done} บาร์โค้ดสุดท้ายคือ ${last || '-'} ตรวจรายการสุดท้ายใน POS หลักก่อนส่งต่อ`;
      case 'empty-list': return 'ไม่มีบาร์โค้ดให้พิมพ์';
      default: return `ส่งไม่สำเร็จ (${reason}) ${done} บาร์โค้ดสุดท้ายคือ ${last || '-'} ตรวจรายการสุดท้ายใน POS หลักก่อนส่งต่อ`;
    }
  }

  const api = { canTransition, applyProgress, flagsOf, statusLabel, describeStop, NEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.BillState = api;
})();
