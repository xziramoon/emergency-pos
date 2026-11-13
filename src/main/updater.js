'use strict';
// Auto-update from GitHub Releases. Safe for a till: downloads in the background and installs only when
// the app is closed (autoInstallOnAppQuit) — never restarts in the middle of a sale. Offline = silently skipped.
async function setupAutoUpdate({ autoUpdater, isPackaged, log = () => {}, onReady = () => {} }) {
  if (!isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => log('update error: ' + ((e && e.message) || e)));
  autoUpdater.on('update-downloaded', (info) => onReady(info && info.version));
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    log('update check failed: ' + ((e && e.message) || e));
  }
}

module.exports = { setupAutoUpdate };
