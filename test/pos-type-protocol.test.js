const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '../resources/pos-type.ps1');
const isWin = process.platform === 'win32';

function run(listText, extra) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pt-')), 'list.txt');
  fs.writeFileSync(f, listText, 'utf8');
  const r = spawnSync('powershell.exe', [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
    '-ListFile', f, '-DelayMs', '10', '-WindowLike', '*no-such-window-xyz*', ...extra,
  ], { encoding: 'utf8', timeout: 30000 });
  return { out: (r.stdout || '').split(/\r?\n/).filter(Boolean), code: r.status, err: r.stderr };
}

test('dry run: 3 barcodes stream TYPED 1..3 then DONE 3 (exit 0)', { skip: !isWin }, () => {
  const r = run('a\r\nb\r\nc\r\n', ['-DryRun']);
  assert.deepEqual(r.out, ['TYPED 1 a', 'TYPED 2 b', 'TYPED 3 c', 'DONE 3']);
  assert.equal(r.code, 0);
});

test('dry run: an empty list stops with STOPPED 0 (exit 2)', { skip: !isWin }, () => {
  const r = run('', ['-DryRun']);
  assert.equal(r.out.length, 1);
  assert.match(r.out[0], /^STOPPED 0 \S+/);
  assert.equal(r.code, 2);
});

test('window not found (no dry run): STOPPED 0 window-not-found, exit 2, nothing typed', { skip: !isWin }, () => {
  const r = run('8850000000001\r\n', []);
  assert.deepEqual(r.out, ['STOPPED 0 window-not-found']);
  assert.equal(r.code, 2);
});

test('script keeps the proven key-sending method from the spec (Appendix A)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  for (const needle of ['SendInput', 'Key(0, c, 4)', 'Key(0x0D, 0, 0)', 'Sleep(15)', 'BlockInput($false)', 'finally', 'Milliseconds 800', 'Milliseconds 80']) {
    assert.ok(src.includes(needle), 'missing ' + needle);
  }
});
