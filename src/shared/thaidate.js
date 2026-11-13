'use strict';
(function () {
  const pad = (n) => String(n).padStart(2, '0');

  // DD-MM-YYYY@HH:mm with Buddhist-era year, from the Date's local fields.
  function formatThaiDate(d) {
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear() + 543}@${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Thai combining marks (above/below vowels, tone marks) take no column on a receipt printer.
  const isMark = (cp) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);

  function displayWidth(s) {
    let w = 0;
    for (const ch of String(s)) if (!isMark(ch.codePointAt(0))) w++;
    return w;
  }

  // Split into clusters (base char + its combining marks) so wrapping never separates them.
  function clusters(s) {
    const out = [];
    for (const ch of String(s)) {
      if (isMark(ch.codePointAt(0)) && out.length) out[out.length - 1] += ch;
      else out.push(ch);
    }
    return out;
  }

  const api = { formatThaiDate, displayWidth, clusters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ThaiDate = api;
})();
