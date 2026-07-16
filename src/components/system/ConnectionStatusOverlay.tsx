import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";

/**
 * Non-blocking connection status toast, shown whenever the app can't reach
 * Supabase — e.g. the database is being upgraded, the project is
 * restarting/paused, or the user has lost their internet connection. It matches
 * the update toast in the top-right corner and lets the user keep working. It
 * auto-recovers: the underlying health hook keeps polling and the toast
 * disappears the moment the backend responds again. The user can also dismiss
 * it manually; it re-arms for the next outage.
 */
export default function ConnectionStatusOverlay() {
  const { status, isBrowserOffline, checkNow } = useSupabaseHealth();
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isDown = status === "down";
  const visible = isDown && !dismissed;

  // Re-arm the toast each time the backend goes down again after recovering,
  // so dismissing it only hides the current outage — not all future ones.
  useEffect(() => {
    if (!isDown) setDismissed(false);
  }, [isDown]);

  if (!visible) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await checkNow();
    } finally {
      // Brief visual feedback even if the check resolves instantly.
      setTimeout(() => setRetrying(false), 600);
    }
  };

  const heading = isBrowserOffline
    ? "You seem to be offline…"
    : "Reconnecting to ampOS…";

  const subtext = isBrowserOffline
    ? "Check your internet connection. ampOS will reconnect automatically as soon as you're back online."
    : "ampOS is temporarily unavailable while we perform maintenance. This usually only takes a few minutes.";

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label={heading}
      className="fixed top-4 right-4 z-[9999] max-w-sm rounded-none border border-neutral-200 bg-white p-4 shadow-md transition-all duration-300 ease-in-out dark:border-neutral-700 dark:bg-dark-150"
    >
      <div className="flex items-start">
        {/* Spinner mirrors the overlay's status indicator, sized like a toast icon. */}
        <div className="mr-3 mt-0.5 flex-shrink-0">
          <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-brand dark:border-neutral-600 dark:border-t-brand" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {heading}
          </h3>
          <p className="mt-1 text-sm text-neutral-700 dark:text-white">
            {subtext}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center rounded-none bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? "Checking…" : "Try again"}
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="ml-4 inline-flex flex-shrink-0 text-neutral-400 hover:text-neutral-500 focus:outline-none"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
