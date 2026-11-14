'use strict';
// Runs resources/pos-type.ps1 and reads its stdout protocol as a stream (spec section 7).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { timeoutMs } = require('../shared/sendlist.js');

function psArgs({ script, listFile, delayMs, windowLike }) {
  return ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-ListFile', listFile, '-DelayMs', String(delayMs), '-WindowLike', windowLike];
}

// -> Promise<{done, typed, reason?, lastBarcode?}>  (typed/lastBarcode are relative to THIS run's list)
async function runTyper({ list, delayMs, windowLike, script, spawn = cp.spawn, onProgress, onStop, timeoutOverrideMs }) {
  if (!list || list.length === 0) throw new Error('empty barcode list');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-send-'));
  const listFile = path.join(dir, 'list.txt');
  fs.writeFileSync(listFile, list.join('\r\n') + '\r\n', 'utf8');

  return new Promise((resolve) => {
    const child = spawn('powershell.exe', psArgs({ script, listFile, delayMs, windowLike }), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let typed = 0;
    let last;
    let result = null;
    let buf = '';
    let finished = false;

    const finish = (r) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp only */ }
      resolve({ typed, lastBarcode: last, ...r });
    };

    const line = (s) => {
      let m;
      if ((m = /^TYPED (\d+) (.+)$/.exec(s))) {
        typed = Number(m[1]); last = m[2];
        if (onProgress) onProgress(typed, last);
      } else if ((m = /^STOPPED (\d+) (.+)$/.exec(s))) {
        typed = Number(m[1]);
        result = { done: false, reason: m[2] };
        if (onStop) onStop(typed, m[2]);
      } else if ((m = /^DONE (\d+)$/.exec(s))) {
        typed = Number(m[1]);
        result = { done: true };
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
    });
    child.stdout.on('end', () => { if (buf.trim()) line(buf.trim()); });

    // BlockInput is tied to the process thread, so killing the process also releases the keyboard/mouse.
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish({ done: false, reason: 'timeout' });
    }, timeoutOverrideMs || timeoutMs(list.length, delayMs));

    child.on('error', (e) => finish({ done: false, reason: 'spawn-error: ' + e.message }));
    child.on('close', (code) => finish(result || { done: false, reason: 'exited ' + code }));
  });
}

module.exports = { runTyper, psArgs };
