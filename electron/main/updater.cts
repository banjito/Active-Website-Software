/**
 * Auto-update for packaged builds. Reads the feed in electron-builder.yml
 * (`publish`), downloads new versions in the background, and installs them
 * when the app closes. Tells the renderer when one is ready so a tech can
 * restart sooner. Never forces a restart: they may be mid-report.
 *
 * Failures are logged and ignored. This app is used offline, so a failed check
 * is normal, and an updater problem must never stop a tech from working.
 */
import { app, BrowserWindow, ipcMain } from "electron";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // Laptops can stay open for days.

let readyVersion: string | null = null;

// Required on demand: a packaging mistake must not crash the app at launch.
function loadUpdater() {
  const { autoUpdater } =
    require("electron-updater") as typeof import("electron-updater");
  return autoUpdater;
}

/** Release gate: proves a packaged build can actually load the updater. */
export function runUpdaterTest(): void {
  try {
    loadUpdater();
    console.log("[updater-test] ok");
  } catch (err) {
    console.error("[updater-test] failed:", err);
    process.exitCode = 1;
  }
  app.quit();
}

export function initUpdates(): void {
  ipcMain.handle("updates:state", () => ({
    currentVersion: app.getVersion(),
    readyVersion,
  }));
  ipcMain.handle("updates:install", () => {
    // Silent: no installer window on Windows. Then reopen the app.
    if (readyVersion) loadUpdater().quitAndInstall(true, true);
  });

  if (!app.isPackaged) return;

  let updater: ReturnType<typeof loadUpdater>;
  try {
    updater = loadUpdater();
  } catch (err) {
    console.error("[updater] unavailable:", err);
    return;
  }

  // Patch-style updates need the previous version's files, which the
  // releases/latest address can't reach. Always fetch the full update.
  updater.disableDifferentialDownload = true;

  updater.on("error", (err) => {
    console.warn("[updater]", err.message);
  });
  updater.on("update-downloaded", (info) => {
    readyVersion = info.version;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("updates:ready", info.version);
    }
  });

  const check = () => {
    updater.checkForUpdates().catch((err: Error) => {
      console.warn("[updater]", err.message);
    });
  };
  check();
  setInterval(check, CHECK_EVERY_MS);
}
