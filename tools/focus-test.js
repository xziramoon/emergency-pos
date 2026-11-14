// Harness-only behavioural check of the scanner focus guard (loaded by mock-api when ?demo=focus-test).
// Result is written to document.title as "FOCUSTEST {json}" so headless Edge --dump-dom can read it.
window.__focusTest = async function () {
  try { await run(); } catch (e) { document.title = 'FOCUSTEST-ERR ' + e.message; }
};
async function run() {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const res = {};
  $('man-cancel').click();

  document.activeElement.blur(); key(document.body, '8');
  res.bodyKey = document.activeElement === $('scan') && $('scan').value === '8';

  $('scan').value = ''; $('btn-clear').focus(); key($('btn-clear'), '9');
  res.buttonKey = document.activeElement === $('scan') && $('scan').value === '9';

  $('scan').value = ''; $('btn-clear').focus(); key($('btn-clear'), 'Enter');
  res.enterIgnored = document.activeElement === $('btn-clear') && $('scan').value === '';

  const cell = document.querySelector('.cell-input'); const orig = cell.value; cell.focus();
  for (const k of ['8', '8', '5', '0']) key(document.activeElement, k);
  res.cellRestored = cell.value === orig;
  res.cellBurstToScan = document.activeElement === $('scan') && $('scan').value === '885'; // 4th key is a plain keystroke into scan (synthetic events do not insert text)

  $('scan').value = ''; cell.focus(); key(cell, '7'); await wait(300); key(cell, '7');
  res.slowTypingStays = document.activeElement === cell && $('scan').value === '';
  res.dbg = { active: document.activeElement.id || document.activeElement.className, scan: $('scan').value, connected: cell.isConnected };

  cell.blur(); await wait(1300);
  res.watchdog = document.activeElement === $('scan');
  res.status = $('scan-status').textContent;
  document.title = 'FOCUSTEST ' + JSON.stringify(res);
}
