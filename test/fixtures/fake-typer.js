// Stand-in for pos-type.ps1 in tests. Same argv names; behaviour chosen by FAKE_MODE: ok | hang | stopped | crash.
const fs = require('node:fs');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const list = fs.readFileSync(arg('-ListFile'), 'utf8').split(/\r?\n/).filter(Boolean);
const mode = process.env.FAKE_MODE || 'ok';
const out = (s) => process.stdout.write(s + '\n');
(async () => {
  if (mode === 'ok') { list.forEach((c, i) => out(`TYPED ${i + 1} ${c}`)); out(`DONE ${list.length}`); process.exit(0); }
  if (mode === 'stopped') { out(`TYPED 1 ${list[0]}`); out('STOPPED 1 foreground-changed'); process.exit(2); }
  if (mode === 'crash') { out(`TYPED 1 ${list[0]}`); process.exit(1); }
  if (mode === 'hang') { out(`TYPED 1 ${list[0]}`); setInterval(() => {}, 1000); }
})();
