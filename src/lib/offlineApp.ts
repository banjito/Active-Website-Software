/**
 * True inside the ampOS Offline desktop app (electron/), whose preload exposes
 * `window.electronAPI`. Shared report code uses it to relax rules that assume a
 * job exists, since the offline app has no jobs.
 */
export function isOfflineApp(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
}
