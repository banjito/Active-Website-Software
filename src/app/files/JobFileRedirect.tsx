import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { jobFilePath, signJobFile } from "@/lib/jobFiles";

/**
 * /files/job/<path>: the ampOS address of a job file. Behind RequireAuth, so a
 * copied link asks for a login first; then it forwards to a short-lived signed
 * link. Staff only (storage rules refuse everyone else).
 */
export default function JobFileRedirect() {
  const { pathname } = useLocation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const path = jobFilePath(pathname);
    if (!path) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void signJobFile(path).then((url) => {
      if (cancelled) return;
      if (url) window.location.replace(url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-dark-50 px-4">
      <div className="max-w-md w-full border border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-100 rounded-none p-6 text-center">
        {failed ? (
          <>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Can't open this file
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              You may not have access to it, or it was deleted. Ask whoever
              sent it for a share link.
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Opening file…
          </p>
        )}
      </div>
    </div>
  );
}
