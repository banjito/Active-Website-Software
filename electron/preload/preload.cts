/**
 * Preload bridge for ampOS Offline.
 *
 * Runs with contextIsolation enabled and exposes a minimal, typed API on
 * `window.electronAPI`. Phase 0 only advertises the platform/version so the
 * renderer can detect it is running inside Electron. Later phases add:
 *   - db.query(intent)  -> SQLite executor over IPC (offline Supabase adapter)
 *   - sync.*            -> sync engine controls/status
 *   - pdf.export(...)   -> printToPDF
 *   - auth.*            -> safeStorage-backed session cache
 */
import { contextBridge, ipcRenderer } from "electron";

const api = {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Offline SQLite executor (Phase 1).
  db: {
    query: (intent: unknown) => ipcRenderer.invoke("db:query", intent),
  },
  // Export saved reports as one .amp-report file for the main app's importer.
  reports: {
    export: (assetIds: string[]) =>
      ipcRenderer.invoke("reports:export", { assetIds }),
  },
  // Offline PDF export of the current report (Phase 4).
  pdf: {
    export: (opts?: {
      defaultName?: string;
      landscape?: boolean;
      search?: string;
      hash?: string;
    }) => ipcRenderer.invoke("pdf:export", opts ?? {}),
  },
  // Auto-update status. The updater itself runs in the main process.
  updates: {
    state: (): Promise<{ currentVersion: string; readyVersion: string | null }> =>
      ipcRenderer.invoke("updates:state"),
    install: () => ipcRenderer.invoke("updates:install"),
    onReady: (callback: (version: string) => void) => {
      const listener = (_evt: unknown, version: string) => callback(version);
      ipcRenderer.on("updates:ready", listener);
      return () => {
        ipcRenderer.removeListener("updates:ready", listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;
