import { useEffect, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "./ShellChrome";

const updates = (window as any).electronAPI?.updates;

/**
 * Corner notice once a new version has downloaded. The update installs on the
 * next close either way, so "Later" is safe. Hidden in print so it can never
 * land in an exported PDF.
 */
export default function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!updates) return;
    void updates
      .state()
      .then((state: { readyVersion: string | null }) => setVersion(state.readyVersion));
    return updates.onReady(setVersion);
  }, []);

  if (!version || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-none border border-neutral-200 bg-white p-4 shadow-lg print:hidden">
      <p className="text-sm font-semibold text-neutral-900">Update ready</p>
      <p className="mt-1 text-sm text-neutral-600">
        Version {version} installs when you close the app. Save your work before
        restarting.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setDismissed(true)} className={secondaryButtonClass}>
          Later
        </button>
        <button onClick={() => void updates.install()} className={primaryButtonClass}>
          Restart now
        </button>
      </div>
    </div>
  );
}
