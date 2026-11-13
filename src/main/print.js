'use strict';
// Printing. `electron` is required lazily so confirmAndPrint stays unit-testable in plain Node.

// Spec 6.3/6.4: the bill MUST be on disk before anything is printed.
// saveBill failure -> rejects, nothing printed. Print failure -> bill kept, printed:false.
async function confirmAndPrint({ bill, saveBill, printReceipt }) {
  const saved = await saveBill(bill);
  try {
    await printReceipt(saved);
    return { saved, printed: true };
  } catch (err) {
    return { saved, printed: false, error: (err && err.message) || String(err) };
  }
}

// Silent print of an HTML page through the Windows driver (drawer opens per the driver's setting).
function printHtml(html, deviceName) {
  const { BrowserWindow } = require('electron');
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { w.destroy(); } catch { /* already gone */ }
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('เครื่องพิมพ์ไม่ตอบสนอง (หมดเวลา)')), 20000);
    w.webContents.on('did-fail-load', (_e, _c, desc) => finish(new Error('โหลดใบเสร็จไม่สำเร็จ: ' + desc)));
    w.webContents.on('did-finish-load', () => {
      w.webContents.print(
        { silent: true, deviceName: deviceName || '', printBackground: false, margins: { marginType: 'none' } },
        (ok, reason) => finish(ok ? null : new Error('พิมพ์ไม่สำเร็จ: ' + (reason || 'ไม่ทราบสาเหตุ')))
      );
    });
    w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf8').toString('base64'));
  });
}

// Fallback only (spec 6.4): ESC p 0 25 250 sent raw to the printer. The main route is the driver setting.
const PS_RAW = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawP {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static void Send(string name, byte[] data) {
    IntPtr h; if (!OpenPrinter(name, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed " + Marshal.GetLastWin32Error());
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "drawer"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDoc failed");
      StartPagePrinter(h); int w; WritePrinter(h, data, data.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@
$n = $env:EPOS_PRINTER
if (-not $n) { $n = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name }
[RawP]::Send($n, [byte[]](0x1B,0x70,0x00,0x19,0xFA))
`;

function openDrawerRaw(deviceName) {
  const { execFile } = require('node:child_process');
  const encoded = Buffer.from(PS_RAW, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, EPOS_PRINTER: deviceName || '' }, windowsHide: true, timeout: 15000 },
      (err, _out, stderr) => (err ? reject(new Error((stderr || err.message).toString().trim())) : resolve()));
  });
}

module.exports = { confirmAndPrint, printHtml, openDrawerRaw };
