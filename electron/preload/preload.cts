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
  // Offline PDF export of the current report (Phase 4).
  pdf: {
    export: (opts?: { defaultName?: string; landscape?: boolean }) =>
      ipcRenderer.invoke("pdf:export", opts ?? {}),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;
