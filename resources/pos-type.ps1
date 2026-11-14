param(
    [Parameter(Mandatory = $true)][string]$ListFile,
    [int]$DelayMs = 600,
    [string]$WindowLike = '*Sea And Hill POS*',
    [switch]$DryRun
)
# Types barcodes from -ListFile (one per line) into the Sea & Hill POS window + Enter,
# the same way a barcode scanner does. Layout-independent (works with Thai keyboard on).
# Output protocol (one line each, read as a stream by the app):
#   TYPED <n> <barcode>   STOPPED <n> <reason>   DONE <total>      exit 0 = DONE, 2 = STOPPED
# The KeyTyper class and the key timing below are the proven version from spec Appendix A: do not change them.
# -DryRun skips window lookup / BlockInput / SendInput but prints the same protocol (for tests).

function Out-Line([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }

if (-not $DryRun) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class KeyTyper {
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion U; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool BlockInput(bool fBlockIt);

    static void Key(ushort vk, ushort scan, uint flags) {
        INPUT[] a = new INPUT[2];
        a[0].type = 1; a[0].U.ki.wVk = vk; a[0].U.ki.wScan = scan; a[0].U.ki.dwFlags = flags;
        a[1].type = 1; a[1].U.ki.wVk = vk; a[1].U.ki.wScan = scan; a[1].U.ki.dwFlags = flags | 2;
        SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
    }
    public static void Text(string s) {
        foreach (char c in s) { Key(0, c, 4); System.Threading.Thread.Sleep(15); }
    }
    public static void Enter() { Key(0x0D, 0, 0); }
}
"@
}

# Build the list: one barcode per line (the app already repeated lines for quantity).
$codes = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $ListFile) {
    foreach ($line in (Get-Content -LiteralPath $ListFile)) {
        $code = $line.Trim()
        if ($code -eq '') { continue }
        if ($code -notmatch '^[0-9A-Za-z\-]+$') { continue }
        $codes.Add($code)
    }
}
if ($codes.Count -eq 0) { Out-Line 'STOPPED 0 empty-list'; exit 2 }

$pos = $null
if (-not $DryRun) {
    $pos = Get-Process | Where-Object { $_.MainWindowTitle -like $WindowLike } | Select-Object -First 1
    if (-not $pos) { Out-Line 'STOPPED 0 window-not-found'; exit 2 }
}

$done = 0
$problem = $null
try {
    if (-not $DryRun) {
        # Lock the real keyboard and mouse while typing (needs Administrator). Ctrl+Alt+Del always unlocks.
        [void][KeyTyper]::BlockInput($true)
        [void][KeyTyper]::SetForegroundWindow($pos.MainWindowHandle)
        Start-Sleep -Milliseconds 800
        if ([KeyTyper]::GetForegroundWindow() -ne $pos.MainWindowHandle) { $problem = 'cannot-focus' }
    }
    if (-not $problem) {
        foreach ($c in $codes) {
            if (-not $DryRun -and [KeyTyper]::GetForegroundWindow() -ne $pos.MainWindowHandle) {
                $problem = 'foreground-changed'
                break
            }
            if (-not $DryRun) {
                [KeyTyper]::Text($c)
                Start-Sleep -Milliseconds 80
                [KeyTyper]::Enter()
            }
            $done++
            Out-Line ("TYPED {0} {1}" -f $done, $c)
            Start-Sleep -Milliseconds $DelayMs
        }
    }
} finally {
    if (-not $DryRun) { [void][KeyTyper]::BlockInput($false) }
}

if ($problem) { Out-Line ("STOPPED {0} {1}" -f $done, $problem); exit 2 }
Out-Line ("DONE {0}" -f $done)
exit 0
