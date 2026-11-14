'use strict';
// Keeps barcode-scanner input landing in the scan field. Pure decisions only; the DOM wiring is in sell.js.
(function () {
  const CELL_IDLE_MS = 8000;
  const BURST_GAP_MS = 40;
  const BURST_KEYS = 3;

  // active: 'scan' | 'cell' (cart edit field) | 'button' | 'body' (nothing focused)
  function decideFocus(s) {
    if (!s.sellVisible || s.modalOpen) return 'none';
    if (s.active === 'body') return 'scan';
    if (s.active === 'cell' && s.idleMs >= CELL_IDLE_MS) return 'scan';
    return 'none';
  }

  // A scanner "types" digits; if focus is on the page or a button they would be lost (and its trailing Enter
  // would press the button), so the first printable key pulls focus into the scan field.
  function keyAction(s, e) {
    if (!s.sellVisible || s.modalOpen) return 'ignore';
    if (s.active !== 'body' && s.active !== 'button') return 'ignore';
    if (e.ctrlKey || e.altKey || e.metaKey) return 'ignore';
    if (typeof e.key !== 'string' || e.key.length !== 1) return 'ignore';
    return 'redirect';
  }

  // Humans type with 100+ ms between keys; scanners with a few ms.
  function createBurstDetector() {
    let buf = '';
    let last = -Infinity;
    let run = 0;
    return {
      push(key, t) {
        if (t - last > BURST_GAP_MS) { buf = ''; run = 0; }
        last = t;
        buf += key;
        run += 1;
        return { burst: run >= BURST_KEYS, text: buf };
      },
      reset() { buf = ''; run = 0; last = -Infinity; },
    };
  }

  function scanStatus({ hasFocus, scanFocused }) {
    if (!hasFocus) return 'away';
    return scanFocused ? 'ready' : 'lost';
  }

  const api = { decideFocus, keyAction, createBurstDetector, scanStatus, CELL_IDLE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.FocusGuard = api;
})();
