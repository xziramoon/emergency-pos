const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { runTyper } = require('../src/main/typer.js');

const FAKE = path.join(__dirname, 'fixtures/fake-typer.js');
// Runs the fake typer with node instead of powershell.exe, same argv as the real script.
const fakeSpawn = (mode) => (cmd, args, opts) => cp.spawn(process.execPath, [FAKE, ...args.slice(args.indexOf('-File') + 2)], { ...opts, env: { ...process.env, FAKE_MODE: mode } });

test('runTyper: streams progress and resolves done:true', async () => {
  const seen = [];
  const r = await runTyper({ list: ['a', 'b', 'c'], delayMs: 10, windowLike: '*x*', script: 'ignored.ps1', spawn: fakeSpawn('ok'), onProgress: (n, b) => seen.push([n, b]) });
  assert.deepEqual(seen, [[1, 'a'], [2, 'b'], [3, 'c']]);
  assert.deepEqual({ done: r.done, typed: r.typed }, { done: true, typed: 3 });
});

test('runTyper: STOPPED reports reason, count and last barcode, done:false', async () => {
  let stop;
  const r = await runTyper({ list: ['a', 'b', 'c'], delayMs: 10, windowLike: '*x*', script: 'x', spawn: fakeSpawn('stopped'), onStop: (n, why) => { stop = [n, why]; } });
  assert.equal(r.done, false);
  assert.equal(r.typed, 1);
  assert.equal(r.reason, 'foreground-changed');
  assert.equal(r.lastBarcode, 'a');
  assert.deepEqual(stop, [1, 'foreground-changed']);
});

test('runTyper: a hung process is killed after the timeout and reported', async () => {
  const t0 = Date.now();
  const r = await runTyper({ list: ['a', 'b'], delayMs: 10, windowLike: '*x*', script: 'x', spawn: fakeSpawn('hang'), timeoutOverrideMs: 700 });
  assert.equal(r.done, false);
  assert.equal(r.reason, 'timeout');
  assert.equal(r.typed, 1);
  assert.ok(Date.now() - t0 < 5000);
});

test('runTyper: a process that dies without DONE/STOPPED is reported, keeping typed count', async () => {
  const r = await runTyper({ list: ['a', 'b'], delayMs: 10, windowLike: '*x*', script: 'x', spawn: fakeSpawn('crash') });
  assert.equal(r.done, false);
  assert.equal(r.typed, 1);
  assert.match(r.reason, /^exited/);
});

test('runTyper: the temporary list file is removed afterwards', async () => {
  let listFile;
  const spy = (cmd, args, opts) => { listFile = args[args.indexOf('-ListFile') + 1]; assert.ok(fs.existsSync(listFile)); return fakeSpawn('ok')(cmd, args, opts); };
  await runTyper({ list: ['a'], delayMs: 10, windowLike: '*x*', script: 'x', spawn: spy });
  assert.ok(listFile && !fs.existsSync(listFile));
});

test('runTyper: refuses an empty list', async () => {
  await assert.rejects(() => runTyper({ list: [], delayMs: 10, windowLike: '*x*', script: 'x', spawn: fakeSpawn('ok') }), /empty/i);
});
